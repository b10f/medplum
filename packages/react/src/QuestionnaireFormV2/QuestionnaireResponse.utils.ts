// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { TypedValue } from '@medplum/core';
import { evalFhirPathTyped, getReferenceString, normalizeErrorString, toJsBoolean, toTypedValue } from '@medplum/core';
import type {
  Coding,
  Quantity,
  Questionnaire,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  Signature,
} from '@medplum/fhirtypes';
import {
  getResponseItemAnswerValue,
  QUESTIONNAIRE_CALCULATED_EXPRESSION_URL,
  QUESTIONNAIRE_ENABLED_WHEN_EXPRESSION_URL,
  QUESTIONNAIRE_SIGNATURE_RESPONSE_URL,
  typedValueToResponseItem,
} from '@medplum/react-hooks';
import type {
  ExtendedQuestionnaireItem,
  ExtendedQuestionnaireItemEnableWhen,
  QuestionnaireMode,
} from './QuestionnaireFormV2.utils';
import {
  findAnswerOption,
  findFormItemByLinkId,
  fromTypedValue,
  getChoiceValueKey,
  getRespondedItems,
  getValueByPath,
  isChoiceItemType,
  isCodedAnswerOption,
  isEmptyAnswerValue,
  isNonNegativeInteger,
  isPageItem,
  isQuantityAnswer,
  isQuestionItem,
  isReadOnlyFormItem,
  isUsedInMode,
  toFhirAnswerOption,
  toQuantityUnit,
} from './QuestionnaireFormV2.utils';

/**
 * Evaluates an item's enableWhen conditions (or its enableWhenExpression) against the answers in the draft response.
 * Incomplete conditions (no question or operator) are ignored, matching toFhirQuestionnaireItem.
 * @param values - The current form values (the questionnaire).
 * @param response - The draft QuestionnaireResponse.
 * @param item - The form item to evaluate.
 * @param context - The response path of the response items the item is answered in, e.g. `item.0.item`.
 * @returns True if the item should be shown.
 */
export function evaluateEnableWhen(
  values: Record<string, any>,
  response: QuestionnaireResponse,
  item: ExtendedQuestionnaireItem,
  context: string
): boolean {
  // The conditions are read from the item's definition in the current values, so an edit applies right away.
  const definition: ExtendedQuestionnaireItem = getValueByPath(values, item.path) ?? item;

  // As in Medplum's QuestionnaireForm, an enableWhenExpression takes the place of the enableWhen conditions.
  const enableWhenExpression = getItemExpression(definition, QUESTIONNAIRE_ENABLED_WHEN_EXPRESSION_URL);
  if (enableWhenExpression) {
    try {
      return toJsBoolean(evaluateResponseExpression(values, response, enableWhenExpression));
    } catch {
      // An expression that cannot be evaluated falls back to the enableWhen conditions.
    }
  }

  const enableWhen = (definition.enableWhen || []).filter((condition) => condition?.question && condition.operator);
  const enableBehavior = definition.enableBehavior ?? 'all';

  if (enableWhen.length === 0) {
    return true;
  }

  return enableWhen[enableBehavior === 'all' ? 'every' : 'some']((condition: ExtendedQuestionnaireItemEnableWhen) => {
    const { question, operator, answer } = condition;
    const predicateQuestion = findFormItemByLinkId(values.item ?? [], question.linkId);
    const answers = findQuestionAnswers(response, context, question.linkId).map((responseAnswer) => ({
      value: predicateQuestion ? getAnswerValue(predicateQuestion, responseAnswer) : undefined,
    }));
    const isCodeType = predicateQuestion?.type === 'choice' || predicateQuestion?.type === 'open-choice';
    // Numbers compare as numbers, also when typed into a text field as a string.
    const isNumeric =
      typeof answer === 'number' || ['integer', 'decimal', 'quantity'].includes(predicateQuestion?.type ?? '');

    // Comparisons only count given answers: an unanswered number is empty, not 0.
    const given = answers.filter((a) => !isEmptyAnswerValue(a.value));

    switch (operator) {
      case 'exists':
        return answer === false
          ? !answers.some((a) => hasAnswerValue(a.value))
          : answers.some((a) => hasAnswerValue(a.value));
      case 'empty':
        return !answers.some((a) => hasAnswerValue(a.value));
      case '=':
        return given.some((a) => {
          if (!predicateQuestion) {
            return false;
          }
          if (isCodeType) {
            return matchesChoiceValue(a.value, answer);
          }
          if (isNumeric) {
            return +getNumericAnswer(a.value) === +answer;
          }
          return a.value === answer;
        });
      case '!=':
        return given.some((a) => {
          if (!predicateQuestion) {
            return false;
          }
          if (isCodeType) {
            return !matchesChoiceValue(a.value, answer);
          }
          if (isNumeric) {
            return +getNumericAnswer(a.value) !== +answer;
          }
          return a.value !== answer;
        });
      case '>':
        return given.some((a) => (isNumeric ? +getNumericAnswer(a.value) > +answer : a.value && a.value > answer));
      case '>=':
        return given.some((a) => (isNumeric ? +getNumericAnswer(a.value) >= +answer : a.value && a.value >= answer));
      case '<':
        return given.some((a) => (isNumeric ? +getNumericAnswer(a.value) < +answer : a.value && a.value < answer));
      case '<=':
        return given.some((a) => (isNumeric ? +getNumericAnswer(a.value) <= +answer : a.value && a.value <= answer));
      default:
        return false;
    }
  });
}

function matchesChoiceValue(value: any, expected: any): boolean {
  const key = getChoiceValueKey(expected);
  return (Array.isArray(value) ? value : [value]).some((entry) => getChoiceValueKey(entry) === key);
}

/**
 * Returns the indexes of an item's response items among the response items at a response path: one per repetition of
 * a group, one for a question.
 * @param response - The draft QuestionnaireResponse.
 * @param context - The response path of the response items, e.g. `item` or `item.0.answer.1.item`.
 * @param linkId - The item's linkId.
 * @returns The indexes.
 */
export function getResponseItemIndexes(
  response: QuestionnaireResponse | Record<string, any>,
  context: string,
  linkId: string
): number[] {
  const responseItems: QuestionnaireResponseItem[] = getValueByPath(response, context) ?? [];
  return responseItems.flatMap((responseItem, index) => (responseItem.linkId === linkId ? [index] : []));
}

/**
 * Returns the response path of the response items that hold the group repetition or question answer the response items
 * at `context` belong to.
 * @param context - A response path of response items.
 * @returns The response path, or undefined at the top level.
 */
function getParentContext(context: string): string | undefined {
  return /^(.*)\.\d+\.answer\.\d+\.item$/.exec(context)?.[1] ?? /^(.*)\.\d+\.item$/.exec(context)?.[1];
}

function findResponseItem(
  responseItems: QuestionnaireResponseItem[] | undefined,
  linkId: string
): QuestionnaireResponseItem | undefined {
  for (const responseItem of responseItems ?? []) {
    if (responseItem.linkId === linkId) {
      return responseItem;
    }
    const found =
      findResponseItem(responseItem.item, linkId) ??
      responseItem.answer?.map((answer) => findResponseItem(answer.item, linkId)).find(Boolean);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * Finds the answers of a question for an item answered at `context`: in the nearest group repetition or answer that has
 * the question, so each repetition of a group has its own. A condition on the question an item is a follow-up item of
 * is about the answer the item belongs to.
 * @param response - The draft QuestionnaireResponse.
 * @param context - The response path of the response items the item is answered in.
 * @param linkId - The question's linkId.
 * @returns The question's answers.
 */
function findQuestionAnswers(
  response: QuestionnaireResponse,
  context: string,
  linkId: string
): QuestionnaireResponseItemAnswer[] {
  let scope: string | undefined = context;
  while (scope !== undefined) {
    const found = findResponseItem(getValueByPath(response, scope), linkId);
    if (found) {
      return found.answer ?? [];
    }
    const answerScope = /^(.*\.\d+)\.answer\.(\d+)\.item$/.exec(scope);
    if (answerScope && getValueByPath(response, answerScope[1])?.linkId === linkId) {
      const answer = getValueByPath(response, `${answerScope[1]}.answer.${answerScope[2]}`);
      return answer ? [answer] : [];
    }
    scope = getParentContext(scope);
  }
  return [];
}

function hasAnswerValue(value: any): boolean {
  if (isQuantityAnswer(value)) {
    return !isEmptyAnswerValue(value.value);
  }
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

/**
 * Returns the number of an answer: a quantity's value, or the answer itself.
 * @param value - The answer value.
 * @returns The number (or the value to convert to one).
 */
function getNumericAnswer(value: any): any {
  return isQuantityAnswer(value) ? value.value : value;
}

function isBlankValue(value: any): boolean {
  return value === undefined || value === null || value === '';
}

function getDefaultAnswerValue(type: string): boolean | null | string {
  if (type === 'boolean') {
    return false;
  }
  if (type === 'integer' || type === 'decimal') {
    return null;
  }
  return '';
}

function fromQuestionnaireResponseItemAnswer(
  answers: QuestionnaireResponseItemAnswer[],
  itemType: string
): { value: any }[] {
  return answers.map((answer: QuestionnaireResponseItemAnswer) => {
    const typed = getResponseItemAnswerValue(answer);
    if (!typed) {
      return { value: getDefaultAnswerValue(itemType) };
    }
    // A choice answer is one of the options' values, which are kept as they are.
    if (itemType === 'choice' || itemType === 'open-choice') {
      return { value: typed.value };
    }
    return { value: fromTypedValue(typed, itemType === 'quantity') };
  });
}

/**
 * Returns the value of a draft response answer as an input holds it: a coding, a quantity, a local date and time, the
 * text of a string, and so on.
 * @param item - The question.
 * @param answer - The draft response answer.
 * @returns The value, or undefined for an answer without one.
 */
export function getAnswerValue(
  item: ExtendedQuestionnaireItem,
  answer: QuestionnaireResponseItemAnswer | undefined
): any {
  if (!answer || !Object.keys(answer).some((key) => key.startsWith('value'))) {
    return undefined;
  }
  const value = fromQuestionnaireResponseItemAnswer([answer], item.type)[0].value;
  // A quantity always has a value key, so one with only a unit still counts as unanswered.
  return item.type === 'quantity' && value && typeof value === 'object' ? { ...value, value: value.value } : value;
}

/**
 * Converts a value, as an input holds it, into a draft response answer: its FHIR value[x], or no value while the input
 * is empty. Unlike a submitted response, a draft keeps empty answers, e.g. the rows of a repeating question.
 * @param item - The question.
 * @param value - The value.
 * @returns The draft response answer.
 */
export function toDraftAnswer(item: ExtendedQuestionnaireItem, value: any): QuestionnaireResponseItemAnswer {
  if (item.type === 'quantity') {
    const quantity: Quantity = isQuantityAnswer(value) ? value : { value };
    const number = isBlankValue(quantity.value) ? Number.NaN : parseFloat(String(quantity.value));
    const draft: Quantity = {
      ...(quantity.comparator && { comparator: quantity.comparator }),
      ...(Number.isFinite(number) && { value: number }),
      ...(quantity.unit && { unit: quantity.unit }),
      ...(quantity.system && { system: quantity.system }),
      ...(quantity.code && { code: quantity.code }),
    };
    return Object.keys(draft).length > 0 ? { valueQuantity: draft } : {};
  }
  if (isBlankValue(value)) {
    return {};
  }
  if (item.type === 'integer' || item.type === 'decimal') {
    const number = item.type === 'integer' ? Number.parseInt(String(value), 10) : parseFloat(String(value));
    return Number.isFinite(number) ? toFhirResponseAnswer(item, number) : {};
  }
  if (item.type === 'dateTime' && Number.isNaN(new Date(value).getTime())) {
    return {};
  }
  return toFhirResponseAnswer(item, value);
}

/**
 * Returns a new answer of a question: its initial value at that position, if any, or else an empty answer (a yes/no
 * switch or check box starts off; yes/no radio buttons start unanswered).
 * @param item - The question.
 * @param index - The answer's position.
 * @returns The draft response answer.
 */
export function getNewAnswer(item: ExtendedQuestionnaireItem, index: number): QuestionnaireResponseItemAnswer {
  // The builder holds initial values as { value }, as it holds answers.
  const initial = (item.initial?.[index] as { value?: any } | undefined)?.value;
  if (!isChoiceItemType(item.type) && !isBlankValue(initial)) {
    return toDraftAnswer(item, initial);
  }
  return item.type === 'boolean' && item.itemControl?.code !== 'radio-button' ? { valueBoolean: false } : {};
}

/**
 * Returns a question's initial answers: its initially selected options, or its initial values.
 * @param item - The question.
 * @returns The draft response answers.
 */
function getInitialAnswers(item: ExtendedQuestionnaireItem): QuestionnaireResponseItemAnswer[] {
  if (isChoiceItemType(item.type)) {
    return (item.answerOption ?? [])
      .filter((option) => option.initialSelected)
      .map((option) => toDraftAnswer(item, option.value));
  }
  return (item.initial ?? [])
    .filter((initial) => !isBlankValue((initial as { value?: any })?.value))
    .map((initial) => toDraftAnswer(item, (initial as { value?: any }).value));
}

function getMinOccurs(item: ExtendedQuestionnaireItem): number {
  return item.repeats ? Math.max(1, +item.minOccurs || 1) : 1;
}

function getMaxOccurs(item: ExtendedQuestionnaireItem): number {
  if (!item.repeats) {
    return 1;
  }
  return item.maxOccurs ? +item.maxOccurs : Infinity;
}

/**
 * Brings draft response items in line with the items they answer, as a QuestionnaireResponse holds its answers: a
 * response item per question, created with its initial answers; one per repetition of a group, within its minimum and
 * maximum occurrences; and a question's follow-up items under each of its answers. A question has at least one answer
 * to fill in (its minimum occurrences, when it repeats), except a repeating choice question: it has one answer per
 * selected option. Response items of items that are not there (any more) are left out.
 * @param items - The form items.
 * @param responseItems - The draft response items.
 * @returns The draft response items.
 */
export function syncResponseItems(
  items: ExtendedQuestionnaireItem[],
  responseItems: QuestionnaireResponseItem[] | undefined
): QuestionnaireResponseItem[] {
  return items.flatMap((item): QuestionnaireResponseItem[] => {
    if (item.type === 'display') {
      return [];
    }
    const existing = (responseItems ?? []).filter((responseItem) => responseItem.linkId === item.linkId);
    if (item.type === 'group') {
      const repetitions = existing.slice(0, getMaxOccurs(item));
      while (repetitions.length < getMinOccurs(item)) {
        repetitions.push({ linkId: item.linkId });
      }
      return repetitions.map((repetition) => ({
        ...repetition,
        item: syncResponseItems(item.item ?? [], repetition.item),
      }));
    }
    const responseItem = existing[0] ?? { linkId: item.linkId };
    return [{ ...responseItem, answer: syncAnswers(item, responseItem.answer ?? getInitialAnswers(item)) }];
  });
}

function syncAnswers(
  item: ExtendedQuestionnaireItem,
  answers: QuestionnaireResponseItemAnswer[]
): QuestionnaireResponseItemAnswer[] {
  const synced = answers.slice(0, getMaxOccurs(item));
  const rows = isChoiceItemType(item.type) && item.repeats ? 0 : getMinOccurs(item);
  while (synced.length < rows) {
    synced.push(getNewAnswer(item, synced.length));
  }
  const followUpItems = item.item ?? [];
  return synced.map(({ item: answerItems, ...answer }) =>
    followUpItems.length > 0 ? { ...answer, item: syncResponseItems(followUpItems, answerItems) } : answer
  );
}

/**
 * Returns the draft QuestionnaireResponse a form starts from: the answers of an existing response (e.g. one being
 * continued), or the initial answers.
 * @param items - The form items.
 * @param response - The existing response.
 * @returns The draft QuestionnaireResponse.
 */
export function toDraftResponse(
  items: ExtendedQuestionnaireItem[],
  response?: QuestionnaireResponse
): QuestionnaireResponse {
  return {
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    item: syncResponseItems(items, response?.item),
  };
}

/**
 * Removes the response items of the given items, wherever they are answered.
 * @param responseItems - The draft response items.
 * @param linkIds - The items' linkIds.
 * @returns The draft response items without them.
 */
export function removeResponseItems(
  responseItems: QuestionnaireResponseItem[] | undefined,
  linkIds: Set<string>
): QuestionnaireResponseItem[] {
  return (responseItems ?? [])
    .filter((responseItem) => !linkIds.has(responseItem.linkId))
    .map((responseItem) => ({
      ...responseItem,
      ...(responseItem.item && { item: removeResponseItems(responseItem.item, linkIds) }),
      ...(responseItem.answer && {
        answer: responseItem.answer.map((answer) =>
          answer.item ? { ...answer, item: removeResponseItems(answer.item, linkIds) } : answer
        ),
      }),
    }));
}

/**
 * Returns what each question's initial answers are, by linkId. When that changes, e.g. as an initial value is edited in
 * the builder, the question's answers start over from the new initial answers.
 * @param items - The form items.
 * @param keys - The keys found so far (for recursion).
 * @returns The keys, by linkId.
 */
export function getInitialAnswerKeys(
  items: ExtendedQuestionnaireItem[],
  keys = new Map<string, string>()
): Map<string, string> {
  for (const item of items) {
    if (isQuestionItem(item)) {
      keys.set(item.linkId, JSON.stringify([item.type, getInitialAnswers(item), getNewAnswer(item, 0)]));
    }
    getInitialAnswerKeys(item.item ?? [], keys);
  }
  return keys;
}

/**
 * Returns the key of a group's error among the form errors: the group is not one answer, but all its repetitions.
 * @param context - The response path of the response items the group is answered in.
 * @param linkId - The group's linkId.
 * @returns The error key.
 */
export function getGroupErrorKey(context: string, linkId: string): string {
  return `${context}:${linkId}`;
}

/**
 * Checks a required group (FHIR: it must be present in the response, so it needs at least one answered question;
 * a repeating group needs that in at least `minOccurs` repetitions).
 * @param values - The current form values.
 * @param response - The draft QuestionnaireResponse.
 * @param item - The group.
 * @param context - The response path of the response items the group is answered in.
 * @returns The error message, or undefined when the group is not required or is answered.
 */
export function getRequiredGroupError(
  values: Record<string, any>,
  response: QuestionnaireResponse,
  item: ExtendedQuestionnaireItem,
  context: string
): string | undefined {
  const definition: ExtendedQuestionnaireItem = getValueByPath(values, item.path) ?? item;
  if (definition.type !== 'group' || !definition.required || isReadOnlyFormItem(values, item)) {
    return undefined;
  }

  const minOccurs = definition.repeats ? Math.max(1, +definition.minOccurs || 1) : 1;
  const answered = getResponseItemIndexes(response, context, item.linkId).filter((index) =>
    toResponseItems(values, response, definition.item ?? [], `${context}.${index}.item`, true).some(hasResponseAnswer)
  ).length;
  if (answered >= minOccurs) {
    return undefined;
  }

  const scope = isPageItem(definition) ? 'on this page' : 'in this group';
  return minOccurs > 1
    ? `Answer at least one question ${scope} in ${minOccurs} repetitions`
    : `Answer at least one question ${scope}`;
}

function hasResponseAnswer(item: QuestionnaireResponseItem): boolean {
  return !!item.answer?.length || (item.item ?? []).some(hasResponseAnswer);
}

/**
 * Validates one answer value against its item's constraints (length, regex, value range).
 * @param original - The item definition.
 * @param value - The answer value.
 * @returns The error message, or undefined when valid.
 */
export function validateAnswerValue(original: ExtendedQuestionnaireItem, value: any): string | undefined {
  if (isEmptyAnswerValue(value)) {
    return undefined;
  }

  const label = original.text || 'This field';
  const type = original.type;

  if (type === 'string' || type === 'text') {
    const text = String(value);
    if (original.minLength && text.length < +original.minLength) {
      return `${label} must be at least ${original.minLength} characters`;
    }
    if (original.maxLength && text.length > +original.maxLength) {
      return `${label} cannot exceed ${original.maxLength} characters`;
    }
    const pattern = toRegExp(original.regex);
    if (pattern && !pattern.test(text)) {
      return `${label} format is invalid`;
    }
  }

  if (type === 'url') {
    const text = String(value);
    if (original.maxLength && text.length > +original.maxLength) {
      return `${label} cannot exceed ${original.maxLength} characters`;
    }
    if (!isValidUrl(text)) {
      return `${label} must be a full link, e.g. https://example.com`;
    }
  }

  if ((type === 'decimal' || type === 'quantity') && isNonNegativeInteger(original.maxDecimalPlaces)) {
    const places = +original.maxDecimalPlaces;
    if (countDecimalPlaces(getNumericAnswer(value)) > places) {
      return places === 0
        ? `${label} must be a whole number`
        : `${label} can have at most ${places} decimal place${places === 1 ? '' : 's'}`;
    }
  }

  if (type === 'integer' || type === 'decimal' || type === 'quantity') {
    const number = +getNumericAnswer(value);
    if (!isEmptyAnswerValue(original.minValue) && number < +(original.minValue as number | string)) {
      return `${label} must be at least ${original.minValue}`;
    }
    if (!isEmptyAnswerValue(original.maxValue) && number > +(original.maxValue as number | string)) {
      return `${label} cannot exceed ${original.maxValue}`;
    }
  }

  if (type === 'date' || type === 'dateTime' || type === 'time') {
    if (!isEmptyAnswerValue(original.minValue) && String(value) < String(original.minValue)) {
      return `${label} must be at least ${original.minValue}`;
    }
    if (!isEmptyAnswerValue(original.maxValue) && String(value) > String(original.maxValue)) {
      return `${label} cannot exceed ${original.maxValue}`;
    }
  }

  return undefined;
}

/**
 * Counts the decimal places of a number as typed (e.g. "1.250" has 3).
 * @param value - The number, or its text.
 * @returns The decimal places.
 */
function countDecimalPlaces(value: unknown): number {
  const text = String(value).trim().toLowerCase();
  if (text.includes('e')) {
    return 0;
  }
  const point = text.indexOf('.');
  return point < 0 ? 0 : text.length - point - 1;
}

/**
 * Validates the answers of all shown items (not hidden, enabled by their conditions).
 * @param values - The current form values.
 * @param response - The draft QuestionnaireResponse.
 * @param items - The items to validate; defaults to all top-level items.
 * @param context - The response path of the response items the items are answered in.
 * @returns Error messages keyed by response path: an answer's, or a repeating choice question's answer list.
 */
export function validateFormAnswers(
  values: Record<string, any>,
  response: QuestionnaireResponse,
  items: ExtendedQuestionnaireItem[] = values.item ?? [],
  context = 'item'
): Record<string, string> {
  const errors: Record<string, string> = {};

  const visit = (item: ExtendedQuestionnaireItem, itemContext: string): void => {
    const original: ExtendedQuestionnaireItem = getValueByPath(values, item.path) ?? item;
    if (
      original.hidden ||
      !evaluateEnableWhen(values, response, item, itemContext) ||
      !isShownInMode(values, response, item, itemContext, 'capture') ||
      original.type === 'display'
    ) {
      return;
    }

    const indexes = getResponseItemIndexes(response, itemContext, item.linkId);
    if (original.type === 'group') {
      const groupError = getRequiredGroupError(values, response, item, itemContext);
      if (groupError) {
        errors[getGroupErrorKey(itemContext, item.linkId)] = groupError;
      }
      for (const index of indexes) {
        (original.item ?? []).forEach((child) => visit(child, `${itemContext}.${index}.item`));
      }
      return;
    }

    if (indexes.length === 0) {
      return;
    }
    const answersPath = `${itemContext}.${indexes[0]}.answer`;
    const answerValues = ((getValueByPath(response, answersPath) ?? []) as QuestionnaireResponseItemAnswer[]).map(
      (answer) => getAnswerValue(original, answer)
    );

    // A read-only question cannot be answered by the respondent, so it cannot be required of them.
    const readOnly = isReadOnlyFormItem(values, item);
    if (original.required && !readOnly && answerValues.every(isEmptyAnswerValue)) {
      const isRepeatingChoice = isChoiceItemType(original.type) && original.repeats;
      errors[isRepeatingChoice ? answersPath : `${answersPath}.0`] = 'This field is required';
      return;
    }

    answerValues.forEach((value, index) => {
      const message = validateAnswerValue(original, value);
      if (message) {
        errors[`${answersPath}.${index}`] = message;
      }
      if (!isEmptyAnswerValue(value)) {
        (original.item ?? []).forEach((child) => visit(child, `${answersPath}.${index}.item`));
      }
    });
  };

  items.forEach((item) => visit(item, context));
  return errors;
}

/**
 * Returns true if an item is shown in a mode: its usage mode includes the mode and, for the `-non-empty` usage modes
 * when viewing answers, it is answered.
 * @param values - The current form values.
 * @param response - The draft QuestionnaireResponse.
 * @param item - The item.
 * @param context - The response path of the response items the item is answered in.
 * @param mode - The mode the questionnaire is rendered in.
 * @returns True if the item is shown.
 */
export function isShownInMode(
  values: Record<string, any>,
  response: QuestionnaireResponse,
  item: ExtendedQuestionnaireItem,
  context: string,
  mode: QuestionnaireMode
): boolean {
  const definition: ExtendedQuestionnaireItem = getValueByPath(values, item.path) ?? item;
  if (!isUsedInMode(definition.usageMode, mode)) {
    return false;
  }
  if (mode === 'display' && definition.usageMode?.endsWith('non-empty')) {
    return isAnsweredItem(values, response, definition, context);
  }
  return true;
}

function isAnsweredItem(
  values: Record<string, any>,
  response: QuestionnaireResponse,
  item: ExtendedQuestionnaireItem,
  context: string
): boolean {
  const indexes = getResponseItemIndexes(response, context, item.linkId);
  if (item.type === 'group') {
    return indexes.some((index) =>
      toResponseItems(values, response, item.item ?? [], `${context}.${index}.item`, true).some(hasResponseAnswer)
    );
  }
  const answers: QuestionnaireResponseItemAnswer[] =
    indexes.length > 0 ? (getValueByPath(response, `${context}.${indexes[0]}.answer`) ?? []) : [];
  return answers.some((answer) => !isEmptyAnswerValue(getAnswerValue(item, answer)));
}

/**
 * Returns the signature on a QuestionnaireResponse (questionnaireresponse-signature), e.g. to prefill a form.
 * @param response - The QuestionnaireResponse.
 * @returns The signature, or undefined.
 */
export function getResponseSignature(response: QuestionnaireResponse | undefined): Signature | undefined {
  return response?.extension?.find((ext) => ext.url === QUESTIONNAIRE_SIGNATURE_RESPONSE_URL)?.valueSignature;
}

/**
 * Converts the draft response into the QuestionnaireResponse to submit. Display items, hidden items, items disabled by
 * their conditions, unanswered questions and, in a questionnaire with pages, top-level items outside a page are left
 * out.
 * @param values - The current form values (the questionnaire).
 * @param response - The draft QuestionnaireResponse.
 * @param signature - The respondent's signature, when the questionnaire requires one.
 * @returns The QuestionnaireResponse.
 */
export function toFhirQuestionnaireResponse(
  values: Record<string, any>,
  response: QuestionnaireResponse,
  signature?: Signature
): QuestionnaireResponse {
  const questionnaire = values as Questionnaire;
  let questionnaireCanonical: string | undefined = questionnaire.url;
  if (!questionnaireCanonical && questionnaire.id) {
    questionnaireCanonical = getReferenceString(questionnaire as Questionnaire & { id: string });
  }

  return {
    resourceType: 'QuestionnaireResponse',
    ...(questionnaireCanonical && { questionnaire: questionnaireCanonical }),
    status: 'completed',
    authored: new Date().toISOString(),
    // Stored as Medplum's QuestionnaireForm stores it.
    ...(signature && { extension: [{ url: QUESTIONNAIRE_SIGNATURE_RESPONSE_URL, valueSignature: signature }] }),
    item: toResponseItems(values, response, getRespondedItems(values.item ?? []), 'item', true),
  };
}

/**
 * Converts the draft response's answers to the given items into FHIR response items. Each group repetition is a
 * separate item with the group's linkId; follow-up items are answered under their answer. A submitted response leaves
 * out what toFhirQuestionnaireResponse describes; otherwise every question is there, answered or not, as in the response
 * Medplum's QuestionnaireForm evaluates expressions against.
 * @param values - The current form values.
 * @param response - The draft QuestionnaireResponse.
 * @param items - The items.
 * @param context - The response path of the response items the items are answered in.
 * @param submitted - True for the response to submit.
 * @returns The response items.
 */
function toResponseItems(
  values: Record<string, any>,
  response: QuestionnaireResponse,
  items: ExtendedQuestionnaireItem[],
  context: string,
  submitted: boolean
): QuestionnaireResponseItem[] {
  return items.flatMap((item): QuestionnaireResponseItem[] => {
    const original: ExtendedQuestionnaireItem = getValueByPath(values, item.path) ?? item;
    // Display text is not answered, so it has no response item.
    if (original.type === 'display') {
      return [];
    }
    // Items only shown when viewing answers are not filled in.
    if (
      submitted &&
      (original.hidden ||
        !evaluateEnableWhen(values, response, item, context) ||
        !isShownInMode(values, response, item, context, 'capture'))
    ) {
      return [];
    }

    const base = { linkId: item.linkId, ...(original.text && { text: original.text }) };
    const indexes = getResponseItemIndexes(response, context, item.linkId);

    if (original.type === 'group') {
      return indexes
        .map((index) => ({
          ...base,
          item: toResponseItems(values, response, original.item ?? [], `${context}.${index}.item`, submitted),
        }))
        .filter((groupResponse) => !submitted || groupResponse.item.length > 0);
    }

    const answersPath = `${context}.${indexes[0]}.answer`;
    const draftAnswers: QuestionnaireResponseItemAnswer[] =
      indexes.length > 0 ? (getValueByPath(response, answersPath) ?? []) : [];
    const answers = draftAnswers.flatMap((draftAnswer, index): QuestionnaireResponseItemAnswer[] => {
      const value = getAnswerValue(original, draftAnswer);
      if (isEmptyAnswerValue(value)) {
        return [];
      }
      const followUpItems = toResponseItems(
        values,
        response,
        original.item ?? [],
        `${answersPath}.${index}.item`,
        submitted
      );
      return [{ ...toFhirResponseAnswer(original, value), ...(followUpItems.length > 0 && { item: followUpItems }) }];
    });

    if (submitted) {
      return answers.length > 0 ? [{ ...base, answer: answers }] : [];
    }
    return [{ ...base, ...(answers.length > 0 && { answer: answers }) }];
  });
}

function toFhirResponseAnswer(item: ExtendedQuestionnaireItem, value: any): QuestionnaireResponseItemAnswer {
  switch (item.type) {
    case 'boolean':
      return { valueBoolean: Boolean(value) };
    case 'decimal':
      return { valueDecimal: parseFloat(value) };
    case 'integer':
      return { valueInteger: parseInt(value, 10) };
    case 'date':
      return { valueDate: value };
    case 'dateTime':
      return { valueDateTime: new Date(value).toISOString() };
    case 'time':
      return { valueTime: toFhirTime(String(value)) };
    case 'string':
    case 'text':
      return { valueString: String(value) };
    case 'url':
      return { valueUri: value };
    case 'attachment':
      return { valueAttachment: value };
    case 'reference':
      return { valueReference: value };
    case 'quantity': {
      const quantity: Quantity = isQuantityAnswer(value) ? value : { value };
      // The respondent's unit, or else the question's fixed unit: its only allowed unit, or its unit.
      const unitOptions: Coding[] = (item.unitOption ?? []).filter(Boolean);
      const fixedUnit = unitOptions.length === 1 ? unitOptions[0] : item.unit;
      const unit = quantity.unit || quantity.code ? quantity : toQuantityUnit(fixedUnit);
      return {
        valueQuantity: {
          ...(quantity.comparator && { comparator: quantity.comparator }),
          value: parseFloat(String(quantity.value)),
          ...(unit?.unit && { unit: unit.unit }),
          ...(unit?.system && { system: unit.system }),
          ...(unit?.code && { code: unit.code }),
        },
      };
    }
    case 'choice':
    case 'open-choice': {
      // Written as the option it was selected from: its value type, or its whole coding.
      const option = findAnswerOption(item.answerOption, value);
      if (option && !isCodedAnswerOption(option)) {
        return { [option.valueType as string]: option.value };
      }
      const optionCoding = option && toFhirAnswerOption(option)?.valueCoding;
      if (optionCoding) {
        return { valueCoding: optionCoding };
      }
      if (value && typeof value === 'object') {
        if (value.reference) {
          return { valueReference: value };
        }
        return {
          valueCoding: {
            ...(value.system && { system: value.system }),
            code: value.code,
            ...(value.display && { display: value.display }),
          },
        };
      }
      // An open-choice answer typed by the respondent.
      return { valueString: String(value) };
    }
    default:
      return { valueString: String(value) };
  }
}

/**
 * Returns an item's FHIRPath expression from an SDC expression extension (e.g. sdc-questionnaire-calculatedExpression),
 * kept in the item's preserved extensions.
 * @param definition - The item definition.
 * @param url - The extension URL.
 * @returns The expression, or undefined when the item has none.
 */
function getItemExpression(definition: ExtendedQuestionnaireItem, url: string): string | undefined {
  return definition.preserved?.extension?.find((extension) => extension.url === url)?.valueExpression?.expression;
}

const currentResponses = new WeakMap<Record<string, any>, WeakMap<QuestionnaireResponse, QuestionnaireResponse>>();

/**
 * Converts the draft response into a QuestionnaireResponse for expressions to evaluate against: every question,
 * including unanswered, hidden and disabled ones, as in the response Medplum's QuestionnaireForm evaluates expressions
 * against.
 * @param values - The current form values.
 * @param response - The draft QuestionnaireResponse.
 * @returns The QuestionnaireResponse, the same one for the same values and draft.
 */
function toCurrentQuestionnaireResponse(
  values: Record<string, any>,
  response: QuestionnaireResponse
): QuestionnaireResponse {
  let byResponse = currentResponses.get(values);
  if (!byResponse) {
    byResponse = new WeakMap();
    currentResponses.set(values, byResponse);
  }
  let current = byResponse.get(response);
  if (!current) {
    current = {
      resourceType: 'QuestionnaireResponse',
      status: 'in-progress',
      item: toResponseItems(values, response, values.item ?? [], 'item', false),
    };
    byResponse.set(response, current);
  }
  return current;
}

/**
 * Evaluates a FHIRPath expression against the current answers, as Medplum's QuestionnaireForm does: on the
 * QuestionnaireResponse, which is also `%resource`.
 * @param values - The current form values.
 * @param response - The draft QuestionnaireResponse.
 * @param expression - The FHIRPath expression.
 * @returns The result.
 */
function evaluateResponseExpression(
  values: Record<string, any>,
  response: QuestionnaireResponse,
  expression: string
): TypedValue[] {
  const current = toTypedValue(toCurrentQuestionnaireResponse(values, response));
  return evalFhirPathTyped(expression, [current], { '%resource': current });
}

/** An answer calculated by its question's calculatedExpression, or why it could not be. */
export interface CalculatedAnswer {
  /** The response path of the answer. */
  readonly answerPath: string;
  /** The calculated answer, without a value when the expression has no result. */
  readonly answer?: QuestionnaireResponseItemAnswer;
  readonly error?: string;
}

/**
 * Calculates the answers of questions with a calculatedExpression (sdc-questionnaire-calculatedExpression) from the
 * current answers, as Medplum's QuestionnaireForm does. An expression without a result clears the answer.
 * @param values - The current form values.
 * @param response - The draft QuestionnaireResponse.
 * @returns The calculated answers, one for each response item of each such question.
 */
export function getCalculatedAnswers(values: Record<string, any>, response: QuestionnaireResponse): CalculatedAnswer[] {
  const result: CalculatedAnswer[] = [];

  const visit = (item: ExtendedQuestionnaireItem, context: string): void => {
    const original: ExtendedQuestionnaireItem = getValueByPath(values, item.path) ?? item;
    if (original.type === 'display') {
      return;
    }
    const indexes = getResponseItemIndexes(response, context, item.linkId);
    if (original.type === 'group') {
      for (const index of indexes) {
        (original.item ?? []).forEach((child) => visit(child, `${context}.${index}.item`));
      }
      return;
    }
    if (indexes.length === 0) {
      return;
    }

    const answersPath = `${context}.${indexes[0]}.answer`;
    const expression = getItemExpression(original, QUESTIONNAIRE_CALCULATED_EXPRESSION_URL);
    if (expression) {
      result.push(calculateAnswer(values, response, original, `${answersPath}.0`, expression));
    }
    ((getValueByPath(response, answersPath) ?? []) as QuestionnaireResponseItemAnswer[]).forEach((_answer, index) =>
      (original.item ?? []).forEach((child) => visit(child, `${answersPath}.${index}.item`))
    );
  };

  (values.item ?? []).forEach((item: ExtendedQuestionnaireItem) => visit(item, 'item'));
  return result;
}

function calculateAnswer(
  values: Record<string, any>,
  response: QuestionnaireResponse,
  item: ExtendedQuestionnaireItem,
  answerPath: string,
  expression: string
): CalculatedAnswer {
  let calculated: TypedValue[];
  try {
    calculated = evaluateResponseExpression(values, response, expression);
  } catch (err) {
    return { answerPath, error: `Expression evaluation failed: ${normalizeErrorString(err)}` };
  }

  if (calculated.length === 0) {
    return { answerPath, answer: {} };
  }
  const answer = typedValueToResponseItem({ linkId: item.linkId, type: item.type }, calculated[0]);
  if (!answer) {
    return { answerPath, error: `The expression's result is a ${calculated[0].type}, not a ${item.type}` };
  }
  // Written as its input would write it, so an unchanged result is the same answer.
  return { answerPath, answer: toDraftAnswer(item, fromQuestionnaireResponseItemAnswer([answer], item.type)[0].value) };
}

const URL_PROTOCOLS = ['http:', 'https:', 'ftp:', 'mailto:'];

/**
 * Returns true if a URL answer is a full link: a web or FTP address with a host, or a mailto address.
 * @param value - The answer.
 * @returns True if the value is a valid URL.
 */
function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return URL_PROTOCOLS.includes(url.protocol) && (url.protocol === 'mailto:' || !!url.hostname);
  } catch (_err) {
    return false;
  }
}

function toFhirTime(value: string): string {
  if (!value.includes(':')) {
    return `${value}:00:00`;
  }
  return value.split(':').length === 2 ? `${value}:00` : value;
}

function toRegExp(regex: string | undefined): RegExp | undefined {
  if (!regex) {
    return undefined;
  }
  try {
    // A FHIR regex must match the whole value, as in Medplum's own validation of FHIR types.
    return new RegExp(`^(?:${regex})$`);
  } catch (_err) {
    // An invalid pattern typed into the builder is not the respondent's error.
    return undefined;
  }
}
