// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { generateId, getReferenceString, HTTP_HL7_ORG, UCUM } from '@medplum/core';
import type {
  Coding,
  Extension,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
  QuestionnaireItemEnableWhen,
  QuestionnaireItemInitial,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  ValueSet,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import { QUESTIONNAIRE_HIDDEN_URL, QUESTIONNAIRE_ITEM_CONTROL_URL } from '@medplum/react-hooks';
import type { QuestionnaireForm } from './QuestionnaireFormContext';

export interface ExtendedQuestionnaireItem extends Omit<QuestionnaireItem, 'enableWhen' | 'item' | 'answerOption'> {
  /**
   * A question's answers; each carries its own copies of the question's follow-up items. A group's answers are its
   * repetitions: copies of its items (see ExtendedQuestionnaireItemAnswer).
   */
  answer: ExtendedQuestionnaireItemAnswer[];
  prefix: string;
  hidden: boolean;
  minLength: number | null;
  minValue: number | string | null;
  maxValue: number | string | null;
  entryFormat: string;
  regex: string;
  minOccurs: number;
  /** Null when the item has no maxOccurs extension, meaning unlimited repetitions. */
  maxOccurs: number | null;
  choiceOrientation: string | null;
  displayCategory: Record<string, any>;
  unit: Coding | null;
  unitOption: any[];
  usageMode: string;
  supportLink: string;
  sliderStepValue: number;
  help: string;
  /** The linkId of the help item, kept so an imported questionnaire's linkIds do not change on save. */
  helpLinkId: string | undefined;
  itemControl: Record<string, any>;
  answerOption: ExtendedQuestionnaireItemAnswerOption[];
  path: string;
  answerPath: string;
  /** A group's items, or a question's follow-up items. */
  item: ExtendedQuestionnaireItem[];
  parent: ExtendedQuestionnaireItem | undefined;
  enableWhen: ExtendedQuestionnaireItemEnableWhen[];
}

export interface ExtendedQuestionnaireItemAnswer {
  value: any;
  /** Copies of the question's follow-up items, answered for this answer. */
  item?: ExtendedQuestionnaireItem[];
}

export interface ExtendedQuestionnaireItemAnswerOption extends QuestionnaireItemAnswerOption {
  value: any;
}

export interface ExtendedQuestionnaireItemEnableWhen extends Omit<
  QuestionnaireItemEnableWhen,
  'question' | 'operator'
> {
  answer: any;
  question: QuestionnaireItem;
  /** `empty` is the builder's form of FHIR `exists` with `answerBoolean: false`. */
  operator: QuestionnaireItemEnableWhen['operator'] | 'empty' | '';
}

const STRUCTURE_DEFINITION_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition`;

const EXTENSION_URLS = {
  hidden: QUESTIONNAIRE_HIDDEN_URL,
  itemControl: QUESTIONNAIRE_ITEM_CONTROL_URL,
  displayCategory: `${STRUCTURE_DEFINITION_URL}/questionnaire-displayCategory`,
  minLength: `${STRUCTURE_DEFINITION_URL}/minLength`,
  minValue: `${STRUCTURE_DEFINITION_URL}/minValue`,
  maxValue: `${STRUCTURE_DEFINITION_URL}/maxValue`,
  entryFormat: `${STRUCTURE_DEFINITION_URL}/entryFormat`,
  regex: `${STRUCTURE_DEFINITION_URL}/regex`,
  minOccurs: `${STRUCTURE_DEFINITION_URL}/questionnaire-minOccurs`,
  maxOccurs: `${STRUCTURE_DEFINITION_URL}/questionnaire-maxOccurs`,
  choiceOrientation: `${STRUCTURE_DEFINITION_URL}/questionnaire-choiceOrientation`,
  unit: `${STRUCTURE_DEFINITION_URL}/questionnaire-unit`,
  unitOption: `${STRUCTURE_DEFINITION_URL}/questionnaire-unitOption`,
  usageMode: `${STRUCTURE_DEFINITION_URL}/questionnaire-usageMode`,
  supportLink: `${STRUCTURE_DEFINITION_URL}/questionnaire-supportLink`,
  sliderStepValue: `${STRUCTURE_DEFINITION_URL}/questionnaire-sliderStepValue`,
  ordinalValue: `${STRUCTURE_DEFINITION_URL}/ordinalValue`,
} as const;

const QUESTIONNAIRE_ITEM_CONTROL_SYSTEM = `${HTTP_HL7_ORG}/fhir/questionnaire-item-control`;

/** The item control that marks a top-level group as a page, as used by Medplum's QuestionnaireBuilder and form. */
export const PAGE_ITEM_CONTROL: Coding = { system: QUESTIONNAIRE_ITEM_CONTROL_SYSTEM, code: 'page', display: 'Page' };

const MAX_HORIZONTAL_CHOICE_OPTIONS = 4;
const MAX_HORIZONTAL_CHOICE_TOTAL_LENGTH = 40;

/**
 * Decides whether a choice question's options are laid out in a row. An explicit `choiceOrientation` always wins;
 * otherwise only a few short options go in a row (their labels together fit in a narrow column), since long or many
 * options wrap into an uneven grid.
 * @param item - The choice item (its definition).
 * @returns True for a horizontal layout, false for one option per line.
 */
export function isHorizontalChoiceLayout(item: ExtendedQuestionnaireItem): boolean {
  if (item.choiceOrientation === 'horizontal' || item.choiceOrientation === 'vertical') {
    return item.choiceOrientation === 'horizontal';
  }
  const options = item.answerOption ?? [];
  const totalLength = options.reduce((sum, option) => sum + String(option.value?.display ?? '').length, 0);
  return options.length <= MAX_HORIZONTAL_CHOICE_OPTIONS && totalLength <= MAX_HORIZONTAL_CHOICE_TOTAL_LENGTH;
}

/**
 * Returns true if the builder form item is a page: a group with the `page` item control.
 * @param item - The builder form item.
 * @returns True if the item is a page.
 */
export function isPageItem(item: ExtendedQuestionnaireItem | undefined): boolean {
  return item?.type === 'group' && item.itemControl?.code === PAGE_ITEM_CONTROL.code;
}

/**
 * Returns the pages of a questionnaire: its top-level page groups. When a questionnaire has pages, top-level items
 * outside a page are not rendered.
 * @param items - The top-level builder form items.
 * @returns The page items, or undefined when the questionnaire has no pages.
 */
export function getPageItems(items: ExtendedQuestionnaireItem[]): ExtendedQuestionnaireItem[] | undefined {
  const pages = items.filter(isPageItem);
  return pages.length > 0 ? pages : undefined;
}

/**
 * Returns true if a FHIR item is help text: a display item with the `help` item control. Help is shown by its
 * question or group, not as an item of its own.
 * @param item - The FHIR QuestionnaireItem.
 * @returns True if the item is help text.
 */
export function isHelpItem(item: QuestionnaireItem): boolean {
  return (
    item.type === 'display' &&
    !!item.extension?.some(
      (ext: Extension) =>
        ext.url === EXTENSION_URLS.itemControl &&
        ext.valueCodeableConcept?.coding?.some(
          (coding: Coding) => coding.code === 'help' && coding.system === QUESTIONNAIRE_ITEM_CONTROL_SYSTEM
        )
    )
  );
}

/**
 * Returns true if the builder form item is a question: an item that is answered, so neither a group nor display text.
 * @param item - The builder form item.
 * @returns True if the item is a question.
 */
export function isQuestionItem(item: ExtendedQuestionnaireItem | undefined): boolean {
  return !!item && item.type !== 'group' && item.type !== 'display';
}

/**
 * Returns true if the builder form item is a question with follow-up items.
 * @param item - The builder form item.
 * @returns True if the question has follow-up items.
 */
export function hasFollowUpItems(item: ExtendedQuestionnaireItem | undefined): boolean {
  return isQuestionItem(item) && (item?.item?.length ?? 0) > 0;
}

/**
 * Returns the condition a new follow-up item starts with: shown when its question is answered "yes" for a boolean
 * question, or answered at all for any other question.
 * @param question - The question the follow-up item is added to.
 * @returns The enableWhen condition.
 */
export function createFollowUpEnableWhen(question: ExtendedQuestionnaireItem): ExtendedQuestionnaireItemEnableWhen {
  return {
    id: generateId(),
    question: question as unknown as QuestionnaireItem,
    operator: question.type === 'boolean' ? '=' : 'exists',
    answer: true,
  };
}

/**
 * Reads a value from an object by a dotted form path (e.g. `item.0.item`).
 * @param obj - The object to read from.
 * @param path - The dotted path.
 * @returns The value at the path, or undefined.
 */
export function getValueByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

/**
 * Finds a builder form item by linkId, searching nested group items.
 * @param items - The builder form items to search.
 * @param linkId - The linkId to find.
 * @returns The matching form item, or undefined.
 */
export function findFormItemByLinkId(
  items: ExtendedQuestionnaireItem[],
  linkId: string | undefined
): ExtendedQuestionnaireItem | undefined {
  for (const item of items) {
    if (item.linkId === linkId) {
      return item;
    }
    const found = findFormItemByLinkId(item.item ?? [], linkId);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * Rebuilds all builder form items from their FHIR form, recomputing `path`, `answerPath`, `parent` and `enableWhen`
 * references. Preview answers are carried over by linkId. Call after any change to the item structure (add, move,
 * delete).
 * @param values - The current builder form values.
 * @returns The rebuilt builder form items.
 */
export function rebuildFormItems(values: Record<string, any>): ExtendedQuestionnaireItem[] {
  const responseItems = toResponseItems(values.item ?? []);
  const fhirItems: QuestionnaireItem[] = (values.item ?? []).map((item: any) => toFhirQuestionnaireItem(item));
  const questionnaire = { ...values, item: fhirItems } as Questionnaire;
  return fhirItems.map((item: QuestionnaireItem, index: number) =>
    fromFhirQuestionnaireItem(item, questionnaire, index, responseItems)
  );
}

/** A builder form item as a row of the item tree, which is rendered (and sorted) as one flat list. */
export interface FlattenedFormItem {
  readonly item: ExtendedQuestionnaireItem;
  readonly parentLinkId: string | undefined;
  readonly depth: number;
  /** The item's index among its siblings. */
  readonly index: number;
  readonly siblings: ExtendedQuestionnaireItem[];
}

/** Where a dragged item lands: its depth in the tree, its new parent group and its index among that group's items. */
export interface FormItemDropTarget {
  readonly depth: number;
  readonly parentLinkId: string | undefined;
  readonly index: number;
}

/**
 * Flattens builder form items into tree rows, in display order. Children (a group's items or a question's follow-up
 * items) are included only for expanded items.
 * @param items - The builder form items.
 * @param expanded - The expanded state of the groups, by linkId.
 * @param collapsedLinkId - An item whose children are left out, e.g. the one being dragged.
 * @param parentLinkId - The linkId of the items' parent group (for recursion).
 * @param depth - The items' depth (for recursion).
 * @returns The tree rows.
 */
export function flattenFormItems(
  items: ExtendedQuestionnaireItem[],
  expanded: Record<string, boolean>,
  collapsedLinkId?: string,
  parentLinkId?: string,
  depth = 0
): FlattenedFormItem[] {
  return items.flatMap((item, index) => {
    const row: FlattenedFormItem = { item, parentLinkId, depth, index, siblings: items };
    if (!item.item?.length || !expanded[item.linkId] || item.linkId === collapsedLinkId) {
      return [row];
    }
    return [row, ...flattenFormItems(item.item ?? [], expanded, collapsedLinkId, item.linkId, depth + 1)];
  });
}

/**
 * Projects where a dragged tree row lands. The row it is dragged over sets the position; the horizontal drag offset
 * sets the depth, within what the neighbouring rows allow: only groups and questions that already have follow-up items
 * take children, and pages stay top level.
 * @param rows - The tree rows, without the dragged item's children.
 * @param activeLinkId - The linkId of the dragged item.
 * @param overLinkId - The linkId of the row it is dragged over.
 * @param offsetX - The horizontal drag offset, in pixels.
 * @param indentWidth - The indent of one tree level, in pixels.
 * @returns The drop target, or undefined when either row is not in the tree.
 */
export function getFormItemDropTarget(
  rows: FlattenedFormItem[],
  activeLinkId: string,
  overLinkId: string,
  offsetX: number,
  indentWidth: number
): FormItemDropTarget | undefined {
  const activeIndex = rows.findIndex((row) => row.item.linkId === activeLinkId);
  const overIndex = rows.findIndex((row) => row.item.linkId === overLinkId);
  if (activeIndex < 0 || overIndex < 0) {
    return undefined;
  }

  const active = rows[activeIndex];
  const reordered = [...rows];
  reordered.splice(overIndex, 0, ...reordered.splice(activeIndex, 1));
  const previous = reordered[overIndex - 1] as FlattenedFormItem | undefined;
  const next = reordered[overIndex + 1] as FlattenedFormItem | undefined;

  let maxDepth = 0;
  if (previous && !isPageItem(active.item)) {
    const takesChildren = previous.item.type === 'group' || hasFollowUpItems(previous.item);
    maxDepth = takesChildren ? previous.depth + 1 : previous.depth;
  }
  const minDepth = Math.min(next?.depth ?? 0, maxDepth);
  const projectedDepth = active.depth + Math.round(offsetX / indentWidth);
  const depth = Math.min(Math.max(projectedDepth, minDepth), maxDepth);

  let parentLinkId: string | undefined;
  if (depth > 0 && previous) {
    if (depth === previous.depth) {
      parentLinkId = previous.parentLinkId;
    } else if (depth > previous.depth) {
      parentLinkId = previous.item.linkId;
    } else {
      parentLinkId = reordered
        .slice(0, overIndex)
        .reverse()
        .find((row) => row.depth === depth)?.parentLinkId;
    }
  }

  const index = reordered.slice(0, overIndex).filter((row) => row.parentLinkId === parentLinkId).length;
  return { depth, parentLinkId, index };
}

/**
 * Moves a builder form item to a new parent group and position, which can be anywhere in the tree.
 * @param values - The current builder form values.
 * @param linkId - The linkId of the item to move.
 * @param target - The new parent group and index among its items.
 * @returns The rebuilt builder form items.
 */
export function moveFormItem(
  values: Record<string, any>,
  linkId: string,
  target: Pick<FormItemDropTarget, 'parentLinkId' | 'index'>
): ExtendedQuestionnaireItem[] {
  const moved = findFormItemByLinkId(values.item ?? [], linkId);
  if (!moved || (target.parentLinkId && findFormItemByLinkId(moved.item ?? [], target.parentLinkId))) {
    return values.item ?? [];
  }

  const remove = (items: ExtendedQuestionnaireItem[]): ExtendedQuestionnaireItem[] =>
    items
      .filter((item) => item.linkId !== linkId)
      .map((item) => (item.item?.length ? { ...item, item: remove(item.item) } : item));

  const insert = (
    items: ExtendedQuestionnaireItem[],
    parentLinkId: string | undefined
  ): ExtendedQuestionnaireItem[] => {
    if (parentLinkId === target.parentLinkId) {
      return [...items.slice(0, target.index), moved, ...items.slice(target.index)];
    }
    return items.map((item) => (item.item ? { ...item, item: insert(item.item, item.linkId) } : item));
  };

  return rebuildFormItems({ ...values, item: insert(remove(values.item ?? []), undefined) });
}

/**
 * Converts the preview answers of builder form items into response items in the shape
 * fromFhirQuestionnaireItem reads back: one answer per value, and one response item per group repetition.
 * @param items - The builder form items (or group answer copies).
 * @returns The response items.
 */
function toResponseItems(items: ExtendedQuestionnaireItem[]): QuestionnaireResponseItem[] {
  return items.flatMap((item): QuestionnaireResponseItem[] => {
    if (item.type === 'group') {
      const answerGroups = (item.answer ?? []) as unknown as ExtendedQuestionnaireItem[][];
      return answerGroups
        .filter(Array.isArray)
        .map((answerGroup) => ({ linkId: item.linkId, item: toResponseItems(answerGroup) }));
    }
    // No answers means "use the initial values", except for a repeating choice where nothing selected is a valid state.
    const isRepeatingChoice = (item.type === 'choice' || item.type === 'open-choice') && item.repeats;
    if (!item.answer || (item.answer.length === 0 && !isRepeatingChoice)) {
      return [{ linkId: item.linkId }];
    }
    return [
      {
        linkId: item.linkId,
        answer: item.answer.map((answer) => ({
          ...toResponseItemAnswer(answer.value),
          ...(answer.item?.length && { item: toResponseItems(answer.item) }),
        })),
      },
    ];
  });
}

function toResponseItemAnswer(value: any): QuestionnaireResponseItemAnswer {
  if (value === undefined || value === null || value === '') {
    return {};
  }
  if (typeof value === 'boolean') {
    return { valueBoolean: value };
  }
  if (typeof value === 'number') {
    return { valueDecimal: value };
  }
  if (typeof value === 'string') {
    return { valueString: value };
  }
  // Codings, attachments and references come back unchanged from valueCoding; only the round trip matters here.
  return { valueCoding: value };
}

/**
 * Converts the builder form values back into a FHIR Questionnaire. Top-level fields are kept as loaded; only the
 * items are converted back from their builder form.
 * @param values - The current builder form values.
 * @returns The FHIR Questionnaire.
 */
export function toFhirQuestionnaire(values: Record<string, any>): Questionnaire {
  const { item, ...rest } = values;
  const fhirItems: QuestionnaireItem[] = (item ?? []).map((formItem: any) => toFhirQuestionnaireItem(formItem));
  return {
    ...rest,
    ...(fhirItems.length !== 0 && { item: fhirItems }),
  } as Questionnaire;
}

/**
 * Converts a builder form item back into a FHIR QuestionnaireItem.
 * @param item - The builder form item.
 * @returns The FHIR QuestionnaireItem.
 */
export function toFhirQuestionnaireItem(item: any): QuestionnaireItem {
  const {
    prefix,
    required,
    repeats,
    readOnly,
    maxLength,
    hidden,
    minLength,
    minValue,
    maxValue,
    entryFormat,
    regex,
    minOccurs,
    maxOccurs,
    choiceOrientation,
    displayCategory,
    unit,
    unitOption,
    usageMode,
    supportLink,
    sliderStepValue,
    help,
    helpLinkId,
    itemControl,
    enableWhen,
    enableBehavior,
    initial,
    answerOption,
    code,
    answer: _answer,
    index: _index,
    item: childItems,
    path: _path,
    answerPath: _answerPath,
    parent: _parent,
    ...rest
  } = item;

  const transformedEnableWhen = (enableWhen ?? [])
    .filter((condition: any) => condition.question && condition.operator)
    .map((condition: any) => {
      const questionType = condition.question.type;
      let answerKey: string;
      let operator: any;
      let answer: any;

      if (questionType === 'string' || questionType === 'text' || questionType === 'url') {
        answerKey = 'answerString';
      } else if (questionType === 'choice' || questionType === 'open-choice') {
        answerKey = 'answerCoding';
      } else {
        answerKey = `answer${questionType.charAt(0).toUpperCase()}${questionType.slice(1)}`;
      }

      if (condition.operator === 'exists' || condition.operator === 'empty') {
        answerKey = 'answerBoolean';
        operator = 'exists';
        answer = condition.operator === 'exists';
      } else {
        operator = condition.operator;
        answer = condition.answer;
      }

      if (
        (questionType === 'choice' || questionType === 'open-choice') &&
        condition.operator !== 'exists' &&
        condition.operator !== 'empty'
      ) {
        answer = {
          code: answer.code,
          display: answer.display,
          system: answer.system,
        };
      }

      if (questionType === 'boolean') {
        answer = answer === '' ? true : answer;
      } else if (
        (questionType === 'integer' || questionType === 'decimal') &&
        condition.operator !== 'exists' &&
        condition.operator !== 'empty'
      ) {
        answer = +answer;
      } else if (questionType === 'time' && condition.operator !== 'exists' && condition.operator !== 'empty') {
        answer = `${answer}:00`;
      } else if (questionType === 'dateTime' && condition.operator !== 'exists' && condition.operator !== 'empty') {
        answer = new Date(answer).toISOString();
      } else if (questionType === 'quantity' && condition.operator !== 'exists' && condition.operator !== 'empty') {
        answer = {
          value: answer,
          ...(condition.unit && {
            code: condition.unit.code,
            unit: condition.unit.display,
            system: condition.unit.system,
          }),
        };
      }

      return {
        question: condition.question.linkId,
        operator: operator,
        [answerKey]: answer,
      };
    });

  let transformedInitial;
  let transformedAnswerOption;

  if (item.type !== 'display' && item.type !== 'group') {
    const questionType = item.type;
    let valueKey: string;

    if (questionType === 'string' || questionType === 'text') {
      valueKey = 'valueString';
    } else if (questionType === 'choice' || questionType === 'open-choice') {
      valueKey = 'valueCoding';
    } else if (questionType === 'url') {
      valueKey = 'valueUri';
    } else {
      valueKey = `value${questionType.charAt(0).toUpperCase()}${questionType.slice(1)}`;
    }

    transformedInitial = (initial ?? [])
      .filter((initialItem: { value: string | boolean }) => {
        if (typeof initialItem.value === 'boolean') {
          return true;
        }
        return initialItem.value;
      })
      .map((initialItem: { value: string }) => {
        let value: any;

        if (questionType === 'integer' || questionType === 'decimal') {
          value = +initialItem.value;
        } else if (questionType === 'time') {
          value = `${initialItem.value}:00`;
        } else if (questionType === 'dateTime') {
          value = new Date(initialItem.value).toISOString();
        } else if (questionType === 'quantity') {
          value = { value: initialItem.value };
        } else {
          value = initialItem.value;
        }

        return { [valueKey]: value };
      });

    transformedAnswerOption = (answerOption ?? [])
      .filter((option: { initialSelected: boolean; value: any }) => option.value.code && option.value.display)
      .map((option: { initialSelected: boolean; value: any }) => {
        const answerOptionExtensions: Extension[] = [];
        const { initialSelected, value } = option;
        const { score, ...withoutScore } = value;

        // A score of 0 is a real score (e.g. "Not at all" in PHQ instruments).
        if (score !== undefined && score !== null && score !== '') {
          answerOptionExtensions.push({
            url: EXTENSION_URLS.ordinalValue,
            valueDecimal: +score,
          });
        }

        return {
          initialSelected: initialSelected,
          [valueKey]: withoutScore,
          ...(answerOptionExtensions?.length && { extension: answerOptionExtensions }),
        };
      });
  }

  const extensions: Extension[] = [];

  extensions.push({
    url: EXTENSION_URLS.hidden,
    valueBoolean: hidden ?? false,
  });

  if (minLength) {
    extensions.push({
      url: EXTENSION_URLS.minLength,
      valueInteger: +minLength,
    });
  }

  if (minValue) {
    const questionType: string = item.type;
    const valueKey = `value${questionType.charAt(0).toUpperCase()}${questionType.slice(1)}`;
    let value: string | number;

    if (questionType === 'integer' || questionType === 'decimal') {
      value = +minValue;
    } else if (questionType === 'time') {
      value = `${minValue}:00`;
    } else if (questionType === 'dateTime') {
      value = new Date(minValue).toISOString();
    } else {
      value = minValue;
    }

    extensions.push({
      url: EXTENSION_URLS.minValue,
      [valueKey]: value,
    });
  }

  if (maxValue) {
    const questionType = item.type;
    const valueKey = `value${questionType.charAt(0).toUpperCase()}${questionType.slice(1)}`;
    let value: string | number;

    if (questionType === 'integer' || questionType === 'decimal') {
      value = +maxValue;
    } else if (questionType === 'dateTime') {
      value = new Date(maxValue).toISOString();
    } else if (questionType === 'time') {
      value = `${maxValue}:00`;
    } else {
      value = maxValue;
    }

    extensions.push({
      url: EXTENSION_URLS.maxValue,
      [valueKey]: value,
    });
  }

  if (entryFormat) {
    extensions.push({
      url: EXTENSION_URLS.entryFormat,
      valueString: entryFormat,
    });
  }

  if (regex) {
    extensions.push({
      url: EXTENSION_URLS.regex,
      valueString: regex,
    });
  }

  if (itemControl && Object.keys(itemControl).length !== 0) {
    extensions.push({
      url: EXTENSION_URLS.itemControl,
      valueCodeableConcept: {
        coding: [itemControl],
        text: itemControl.display,
      },
    });
  }

  if (item.repeats && item.required && +minOccurs > 1) {
    extensions.push({
      url: EXTENSION_URLS.minOccurs,
      valueInteger: +minOccurs,
    });
  }

  if (item.repeats && +maxOccurs > 1) {
    extensions.push({
      url: EXTENSION_URLS.maxOccurs,
      valueInteger: +maxOccurs,
    });
  }

  // Radio buttons and checkboxes are also the default controls, so the orientation is kept unless it is a drop-down.
  if (
    (item.type === 'choice' || item.type === 'open-choice') &&
    itemControl?.code !== 'drop-down' &&
    choiceOrientation
  ) {
    extensions.push({
      url: EXTENSION_URLS.choiceOrientation,
      valueCode: choiceOrientation,
    });
  }

  if (displayCategory && Object.keys(displayCategory).length !== 0) {
    extensions.push({
      url: EXTENSION_URLS.displayCategory,
      valueCodeableConcept: {
        coding: [displayCategory],
        text: displayCategory.display,
      },
    });
  }

  if (unit) {
    extensions.push({
      url: EXTENSION_URLS.unit,
      valueCoding: { ...unit, system: UCUM },
    });
  }

  if (unitOption) {
    extensions.push(
      ...unitOption.map((option: Coding) => {
        return {
          url: EXTENSION_URLS.unitOption,
          valueCoding: { ...option, system: UCUM },
        };
      })
    );
  }

  if (usageMode) {
    extensions.push({
      url: EXTENSION_URLS.usageMode,
      valueCode: usageMode,
    });
  }

  if (supportLink) {
    extensions.push({
      url: EXTENSION_URLS.supportLink,
      valueUri: supportLink,
    });
  }

  if (item.type === 'integer' && itemControl.code === 'slider' && sliderStepValue) {
    extensions.push({
      url: EXTENSION_URLS.sliderStepValue,
      valueInteger: +sliderStepValue,
    });
  }

  // A group's items, or a question's follow-up items.
  const processedChildItems: QuestionnaireItem[] =
    item.type === 'display' ? [] : (childItems ?? []).map((childItem: any) => toFhirQuestionnaireItem(childItem));

  if (help) {
    processedChildItems.unshift({
      linkId: helpLinkId || `${item.linkId}_help`,
      text: help,
      type: 'display',
      extension: [
        {
          url: EXTENSION_URLS.itemControl,
          valueCodeableConcept: {
            coding: [
              {
                system: QUESTIONNAIRE_ITEM_CONTROL_SYSTEM,
                code: 'help',
                display: 'Help-Button',
              },
            ],
            text: 'Help-Button',
          },
        },
      ],
    });
  }

  return {
    ...rest,
    ...(prefix && { prefix: prefix }),
    ...(maxLength && { maxLength: +maxLength }),
    ...(transformedEnableWhen && transformedEnableWhen.length !== 0 && { enableWhen: transformedEnableWhen }),
    ...(transformedEnableWhen && transformedEnableWhen.length > 1 ? { enableBehavior: enableBehavior } : {}),
    ...(item.type !== 'display' && { required, repeats, readOnly }),
    ...(item.type !== 'display' && code?.length !== 0 && { code: code }),
    ...(item.type !== 'display' &&
      item.type !== 'group' &&
      transformedInitial &&
      transformedInitial.length !== 0 &&
      transformedAnswerOption?.length === 0 && { initial: transformedInitial }),
    ...(item.type !== 'display' &&
      item.type !== 'group' &&
      transformedAnswerOption &&
      transformedAnswerOption.length !== 0 && { answerOption: transformedAnswerOption }),
    ...(extensions?.length !== 0 && { extension: extensions }),
    ...(processedChildItems?.length !== 0 && { item: processedChildItems }),
  };
}

/**
 * Converts a FHIR QuestionnaireItem into a builder form item.
 * @param item - The FHIR QuestionnaireItem (or an already converted form item).
 * @param questionnaire - The questionnaire the item belongs to; used to resolve enableWhen questions.
 * @param index - The index of the item within its parent.
 * @param responseItems - Optional response items to prefill answers from.
 * @param parent - The parent form item, if nested.
 * @param basePath - The form path of the parent item list.
 * @param baseAnswerPath - The form path of the parent answer list.
 * @returns The builder form item.
 */
export function fromFhirQuestionnaireItem(
  item: QuestionnaireItem | ExtendedQuestionnaireItem,
  questionnaire: Questionnaire | null,
  index?: number,
  responseItems?: QuestionnaireResponseItem[],
  parent?: ExtendedQuestionnaireItem,
  basePath: string = 'item',
  baseAnswerPath: string = 'item'
): any {
  // Help is not an item of its own: it is read into `help` below.
  const childItems = ((item.item ?? []) as QuestionnaireItem[]).filter((childItem) => !isHelpItem(childItem));
  const helpItem = ((item.item ?? []) as QuestionnaireItem[]).find(isHelpItem);
  const extensions: Extension[] = item.extension ?? [];
  const minOccurs = extensions.find((ext) => ext.url === EXTENSION_URLS.minOccurs)?.valueInteger ?? 1;
  const maxOccurs = extensions.find((ext) => ext.url === EXTENSION_URLS.maxOccurs)?.valueInteger ?? null;
  const path = `${basePath}.${index}`;
  const answerPath = `${baseAnswerPath}.${index}`;
  const responseItem = (responseItems ?? []).find(
    (responseItem: QuestionnaireResponseItem) => responseItem.linkId === item.linkId
  );

  const parentRef = parent
    ? {
        linkId: parent.linkId,
        type: parent.type,
        readOnly: parent.readOnly,
        ...(parent.parent && { parent: parent.parent }),
        ...(parent.path && { path: parent.path }),
        ...(parent.answerPath && { answerPath: parent.answerPath }),
      }
    : undefined;

  const formData: any = {
    // applies to questions & groups & display
    path: path,
    answerPath: answerPath,
    index: index,
    linkId: item.linkId,
    prefix: item.prefix ?? '',
    text: item.text,
    type: item.type,
    hidden: extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.hidden)?.valueBoolean || false,
    enableWhen:
      (item.enableWhen as QuestionnaireItemEnableWhen[] | undefined)?.map((enableWhen: QuestionnaireItemEnableWhen) =>
        fromFhirQuestionnaireItemEnableWhen(enableWhen, questionnaire)
      ) ?? [],
    enableBehavior: item.enableBehavior ?? 'all',
    supportLink:
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.supportLink)?.valueUri ?? '',
    usageMode: extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.usageMode)?.valueCode ?? '',
    parent: parentRef,
  };

  // applies to questions & groups
  if (item.type !== 'display') {
    formData.code =
      item.code?.map((code: Coding) => ({
        code: code.code,
        display: code.display,
        system: code.system,
      })) || [];
    formData.required = item.required ?? false;
    formData.repeats = item.repeats ?? false;
    formData.readOnly = item.readOnly ?? false;
    formData.help = helpItem?.text ?? '';
    formData.helpLinkId = helpItem?.linkId;
    formData.itemControl =
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.itemControl)?.valueCodeableConcept
        ?.coding?.[0] ?? {};
    formData.minOccurs = minOccurs;
    formData.maxOccurs = maxOccurs;
  }

  // applies to questions only
  if (item.type !== 'display' && item.type !== 'group') {
    formData.maxLength = item.maxLength ?? null;
    formData.minLength =
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.minLength)?.valueInteger ?? null;
    formData.minValue = fromExtensionToValue(extensions, item.type, 'minValue');
    formData.maxValue = fromExtensionToValue(extensions, item.type, 'maxValue');
    formData.entryFormat =
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.entryFormat)?.valueString ?? '';
    formData.regex =
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.regex)?.valueString ?? '';
    formData.sliderStepValue =
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.sliderStepValue)?.valueInteger ?? 1;
    formData.choiceOrientation =
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.choiceOrientation)?.valueCode ?? null;
    formData.initial = item.initial?.map((initial: QuestionnaireItemInitial) =>
      fromQuestionnaireItemInitial(initial)
    ) ?? [{ value: getDefaultInitialValue(item.type) }];
    formData.answerOption =
      item.answerOption?.map((answerOption: QuestionnaireItemAnswerOption) =>
        fromQuestionnaireItemAnswerOption(answerOption)
      ) ?? [];
    formData.unitOption = extensions
      .filter((extension: Extension) => extension.url === EXTENSION_URLS.unitOption)
      .map((extension: Extension) => extension.valueCoding);
    formData.answer = responseItem?.answer
      ? fromQuestionnaireResponseItemAnswer(responseItem.answer, item.type)
      : fromQuestionnaireItemInitialToAnswer(item as QuestionnaireItem);
    formData.unit =
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.unit)?.valueCoding ?? null;

    // Follow-up items: defined in the question's `item`, answered under each of its answers (`answer.item`).
    formData.item = childItems.map((childItem: QuestionnaireItem, childIndex: number) =>
      fromFhirQuestionnaireItem(childItem, questionnaire, childIndex, undefined, formData, `${path}.item`)
    );
    if (childItems.length > 0) {
      formData.answer = formData.answer.map((answer: ExtendedQuestionnaireItemAnswer, answerIndex: number) => ({
        ...answer,
        item: childItems.map((childItem: QuestionnaireItem, childIndex: number) =>
          fromFhirQuestionnaireItem(
            childItem,
            questionnaire,
            childIndex,
            responseItem?.answer?.[answerIndex]?.item,
            formData,
            `${path}.item`,
            `${answerPath}.answer.${answerIndex}.item`
          )
        ),
      }));
    }
  }

  // applies to groups only
  if (item.type === 'group') {
    formData.answer = [];

    // Each repetition of a group is a separate response item with the group's linkId; its children are in `item`.
    const groupRepetitions = (responseItems ?? []).filter(
      (groupResponse: QuestionnaireResponseItem) => groupResponse.linkId === item.linkId && groupResponse.item?.length
    );

    groupRepetitions.forEach((groupResponse: QuestionnaireResponseItem) => {
      formData.answer.push(
        childItems.map((childItem: QuestionnaireItem, childIndex: number) =>
          fromFhirQuestionnaireItem(
            childItem,
            questionnaire,
            childIndex,
            groupResponse.item,
            formData,
            `${path}.item`,
            `${answerPath}.answer.${formData.answer.length}`
          )
        )
      );
    });

    formData.item = childItems.map((childItem: QuestionnaireItem, childIndex: number) =>
      fromFhirQuestionnaireItem(childItem, questionnaire, childIndex, undefined, formData, `${path}.item`)
    );
  }

  // If it's a group, initialize its answers to track repetitions
  if (item.type === 'group') {
    while (formData.answer.length < minOccurs) {
      formData.answer.push(
        childItems.map((childItem: QuestionnaireItem, childIndex: number) =>
          fromFhirQuestionnaireItem(
            childItem,
            questionnaire,
            childIndex,
            undefined,
            formData,
            `${path}.item`,
            `${answerPath}.answer.${formData.answer.length}`
          )
        )
      );
    }
  }

  return formData;
}

// A boolean's default initial value is null rather than false, so an untouched item does not export `initial: false`.
function getDefaultInitialValue(type: string): null | string {
  if (type === 'boolean' || type === 'integer' || type === 'decimal') {
    return null;
  }
  return '';
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

function fromExtensionToValue(
  extensions: Extension[],
  questionType: string,
  extensionUrl: 'minValue' | 'maxValue'
): any {
  const extension: Extension | undefined = extensions.find(
    (extension: Extension) => extension.url === EXTENSION_URLS[extensionUrl]
  );

  if (extension) {
    const valueKey = `value${questionType.charAt(0).toUpperCase()}${questionType.slice(1)}`;

    if (questionType === 'time') {
      return (extension as any)[valueKey].split(':').slice(0, 2).join(':');
    } else if (questionType === 'dateTime') {
      return (extension as any)[valueKey].split('.')[0];
    }

    return (extension as any)[valueKey];
  }

  return null;
}

function findItemByLinkId(items: QuestionnaireItem[], linkId: string): QuestionnaireItem | null {
  for (const item of items) {
    if (item.linkId === linkId) {
      return item;
    }

    if (item.item) {
      const found = findItemByLinkId(item.item, linkId);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function fromFhirQuestionnaireItemEnableWhen(
  enableWhen: QuestionnaireItemEnableWhen,
  questionnaire: Questionnaire | null
): any {
  if (!questionnaire) {
    return null;
  }

  // The referenced question is converted without the questionnaire so that enableWhen cycles cannot recurse forever.
  // A reference to a missing item leaves `question` undefined, and toFhirQuestionnaireItem drops the condition.
  const questionItem = findItemByLinkId(questionnaire.item ?? [], enableWhen.question);
  const formData: any = {
    id: generateId(),
    question: questionItem ? fromFhirQuestionnaireItem(questionItem, null) : undefined,
    operator: enableWhen.operator === 'exists' && enableWhen.answerBoolean === false ? 'empty' : enableWhen.operator,
  };

  // Detect and add the appropriate answer[x] property
  if ('answerBoolean' in enableWhen) {
    formData.answer = enableWhen.answerBoolean;
  } else if ('answerDecimal' in enableWhen) {
    formData.answer = enableWhen.answerDecimal;
  } else if ('answerInteger' in enableWhen) {
    formData.answer = enableWhen.answerInteger;
  } else if ('answerDate' in enableWhen) {
    formData.answer = enableWhen.answerDate;
  } else if ('answerDateTime' in enableWhen) {
    formData.answer = enableWhen.answerDateTime?.split('.')[0];
  } else if ('answerTime' in enableWhen) {
    formData.answer = enableWhen.answerTime?.split(':').slice(0, 2).join(':');
  } else if ('answerString' in enableWhen) {
    formData.answer = enableWhen.answerString;
  } else if ('answerCoding' in enableWhen) {
    formData.answer = enableWhen.answerCoding;
  } else if ('answerQuantity' in enableWhen) {
    formData.answer = enableWhen.answerQuantity?.value;
    formData.unit = {
      code: enableWhen.answerQuantity?.code,
      display: enableWhen.answerQuantity?.unit,
      system: enableWhen.answerQuantity?.system,
    };
  } else if ('answerReference' in enableWhen) {
    formData.answer = enableWhen.answerReference;
  }

  return formData;
}

function fromQuestionnaireItemInitial(initial: QuestionnaireItemInitial): any {
  const formData: any = {};

  // Detect and add the appropriate value[x] property
  if ('valueBoolean' in initial) {
    formData.value = initial.valueBoolean;
  } else if ('valueDecimal' in initial) {
    formData.value = initial.valueDecimal;
  } else if ('valueInteger' in initial) {
    formData.value = initial.valueInteger;
  } else if ('valueDate' in initial) {
    formData.value = initial.valueDate;
  } else if ('valueDateTime' in initial) {
    formData.value = initial.valueDateTime?.split('.')[0];
  } else if ('valueTime' in initial) {
    formData.value = initial.valueTime?.split(':').slice(0, 2).join(':');
  } else if ('valueString' in initial) {
    formData.value = initial.valueString;
  } else if ('valueUri' in initial) {
    formData.value = initial.valueUri;
  } else if ('valueAttachment' in initial) {
    formData.value = initial.valueAttachment;
  } else if ('valueCoding' in initial) {
    formData.value = initial.valueCoding;
  } else if ('valueQuantity' in initial) {
    formData.value = initial.valueQuantity?.value;
  } else if ('valueReference' in initial) {
    formData.value = initial.valueReference;
  }

  return formData;
}

function fromQuestionnaireItemInitialToAnswer(item: QuestionnaireItem): { value: any }[] {
  const initialArray = item.initial ?? [];
  const extensions: Extension[] = item.extension ?? [];
  const minOccurs =
    extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.minOccurs)?.valueInteger ?? 1;
  let answers: any[] = [];

  initialArray.forEach((initial: QuestionnaireItemInitial) => {
    let value: any = '';

    if ('valueBoolean' in initial) {
      value = initial.valueBoolean;
    } else if ('valueDecimal' in initial) {
      value = initial.valueDecimal;
    } else if ('valueInteger' in initial) {
      value = initial.valueInteger;
    } else if ('valueDate' in initial) {
      value = initial.valueDate;
    } else if ('valueDateTime' in initial) {
      value = initial.valueDateTime?.split('.')[0];
    } else if ('valueTime' in initial) {
      value = initial.valueTime?.split(':').slice(0, 2).join(':');
    } else if ('valueString' in initial) {
      value = initial.valueString;
    } else if ('valueUri' in initial) {
      value = initial.valueUri;
    } else if ('valueAttachment' in initial) {
      value = initial.valueAttachment;
    } else if ('valueCoding' in initial) {
      value = initial.valueCoding;
    } else if ('valueQuantity' in initial) {
      value = initial.valueQuantity?.value;
    } else if ('valueReference' in initial) {
      value = initial.valueReference;
    }

    answers.push({ value: value });
  });

  if (item.type === 'choice' || item.type === 'open-choice') {
    const initialSelected = (item.answerOption ?? [])
      .filter((answer: QuestionnaireItemAnswerOption) => answer.initialSelected)
      .map((answer: QuestionnaireItemAnswerOption) => ({ value: answer.valueCoding }));

    answers = initialSelected;
  }

  const defaultValue = getDefaultAnswerValue(item.type);

  // If minOccurs is greater, add empty values to fulfill minOccurs requirement
  while (answers.length < minOccurs) {
    answers.push({ value: defaultValue });
  }

  return answers;
}

function fromQuestionnaireResponseItemAnswer(
  answers: QuestionnaireResponseItemAnswer[],
  itemType: string
): { value: any }[] {
  return answers.map((answer: QuestionnaireResponseItemAnswer) => {
    let value: any;

    if ('valueBoolean' in answer) {
      value = answer.valueBoolean;
    } else if ('valueDecimal' in answer) {
      value = answer.valueDecimal;
    } else if ('valueInteger' in answer) {
      value = answer.valueInteger;
    } else if ('valueDate' in answer) {
      value = answer.valueDate;
    } else if ('valueDateTime' in answer) {
      value = answer.valueDateTime?.split('.')[0];
    } else if ('valueTime' in answer) {
      value = answer.valueTime?.split(':').slice(0, 2).join(':');
    } else if ('valueString' in answer) {
      value = answer.valueString;
    } else if ('valueUri' in answer) {
      value = answer.valueUri;
    } else if ('valueAttachment' in answer) {
      value = answer.valueAttachment;
    } else if ('valueCoding' in answer) {
      value = answer.valueCoding;
    } else if ('valueQuantity' in answer) {
      value = answer.valueQuantity?.value;
    } else if ('valueReference' in answer) {
      value = answer.valueReference;
    } else {
      value = getDefaultAnswerValue(itemType);
    }

    return { value };
  });
}

/**
 * Returns the code system for answer options written by hand in a questionnaire: a system local to the questionnaire,
 * so its codes cannot collide with another questionnaire's.
 * @param questionnaireCanonical - The questionnaire's canonical url (or its FHIR URL when it has none).
 * @returns The local code system, or undefined when the questionnaire has no identity yet.
 */
export function getLocalAnswerOptionSystem(questionnaireCanonical: string | undefined): string | undefined {
  return questionnaireCanonical ? `${questionnaireCanonical}/answer-options` : undefined;
}

/**
 * Creates a new hand-written answer option, coded with the next free number in the questionnaire-local code system.
 * @param answerOptions - The item's current answer options.
 * @param system - The local code system for the option.
 * @returns The new builder form answer option.
 */
export function createManualAnswerOption(
  answerOptions: ExtendedQuestionnaireItemAnswerOption[],
  system: string | undefined
): ExtendedQuestionnaireItemAnswerOption {
  const nextCode = answerOptions.reduce((max, option) => Math.max(max, Number(option.value?.code) || 0), 0) + 1;
  return {
    id: generateId(),
    initialSelected: false,
    value: { code: String(nextCode), display: `Option ${nextCode}`, ...(system && { system }) },
  };
}

/**
 * Converts an expanded ValueSet into answer options. Abstract codes only group their children and are left out.
 * @param valueSet - The expanded ValueSet.
 * @returns The FHIR answer options, one per code.
 */
export function toFhirAnswerOptionsFromValueSet(valueSet: ValueSet): QuestionnaireItemAnswerOption[] {
  const flatten = (contains: ValueSetExpansionContains[]): ValueSetExpansionContains[] =>
    contains.flatMap((entry) =>
      entry.abstract ? flatten(entry.contains ?? []) : [entry, ...flatten(entry.contains ?? [])]
    );

  return flatten(valueSet.expansion?.contains ?? [])
    .filter((entry) => entry.code)
    .map((entry) => ({
      valueCoding: {
        ...(entry.system && { system: entry.system }),
        code: entry.code,
        display: entry.display ?? entry.code,
      },
    }));
}

/**
 * Returns true if an answer option was written by hand in this questionnaire (coded in its local system). Other coded
 * answers (LOINC, a value set) keep their code and text, so they mean the same wherever they are used.
 * @param answerOption - The builder form answer option.
 * @param localSystem - The questionnaire-local answer option system.
 * @returns True if the option can be edited.
 */
export function isManualAnswerOption(
  answerOption: ExtendedQuestionnaireItemAnswerOption,
  localSystem: string | undefined
): boolean {
  const system = answerOption.value?.system;
  return !system || system === localSystem;
}

/**
 * Finds answer option problems that would lose data: options without code or text are not saved, and options sharing
 * a code cannot be told apart in a response.
 * @param answerOptions - The item's answer options.
 * @returns The problems, as messages.
 */
export function getAnswerOptionProblems(answerOptions: ExtendedQuestionnaireItemAnswerOption[]): string[] {
  const problems: string[] = [];
  if (
    answerOptions.some(
      (option) => !String(option.value?.code ?? '').trim() || !String(option.value?.display ?? '').trim()
    )
  ) {
    problems.push('Every answer option needs a code and display text; incomplete options are not saved.');
  }
  const codes = answerOptions.map((option) => String(option.value?.code ?? '').trim()).filter(Boolean);
  const duplicates = [...new Set(codes.filter((code, index) => codes.indexOf(code) !== index))];
  if (duplicates.length > 0) {
    problems.push(`Answer option codes must be unique: ${duplicates.join(', ')}`);
  }
  return problems;
}

/**
 * Converts FHIR answer options into the builder's form answer options.
 * @param answerOptions - The FHIR answer options.
 * @returns The builder form answer options.
 */
export function fromFhirAnswerOptions(
  answerOptions: QuestionnaireItemAnswerOption[]
): ExtendedQuestionnaireItemAnswerOption[] {
  return answerOptions.map(fromQuestionnaireItemAnswerOption);
}

function fromQuestionnaireItemAnswerOption(answerOption: QuestionnaireItemAnswerOption): any {
  const extensions: Extension[] = answerOption.extension ?? [];
  const formData: any = {
    id: generateId(),
    initialSelected: answerOption.initialSelected ?? false,
  };

  // Detect and add the appropriate value[x] property
  if ('valueInteger' in answerOption) {
    formData.value = answerOption.valueInteger;
  } else if ('valueDate' in answerOption) {
    formData.value = answerOption.valueDate;
  } else if ('valueTime' in answerOption) {
    formData.value = answerOption.valueTime;
  } else if ('valueString' in answerOption) {
    formData.value = answerOption.valueString;
  } else if ('valueCoding' in answerOption) {
    formData.value = {
      code: answerOption.valueCoding?.code,
      display: answerOption.valueCoding?.display,
      system: answerOption.valueCoding?.system,
      score: extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.ordinalValue)?.valueDecimal,
    };
  } else if ('valueReference' in answerOption) {
    formData.value = answerOption.valueReference;
  }

  return formData;
}

/**
 * Evaluates an item's enableWhen conditions against the answers entered in the builder preview.
 * Incomplete conditions (no question or operator) are ignored, matching toFhirQuestionnaireItem.
 * @param values - The current builder form values.
 * @param item - The builder form item to evaluate.
 * @returns True if the item should be shown.
 */
export function evaluateEnableWhen(values: Record<string, any>, item: ExtendedQuestionnaireItem): boolean {
  const enableWhen = (item.enableWhen || []).filter((condition) => condition?.question && condition.operator);
  const enableBehavior = item.enableBehavior ?? 'all';

  if (enableWhen.length === 0) {
    return true;
  }

  // A follow-up item of a question belongs to one of its answers: a condition on that question is about that answer.
  const parentAnswer = getParentAnswer(values, item);

  return enableWhen[enableBehavior === 'all' ? 'every' : 'some']((condition: ExtendedQuestionnaireItemEnableWhen) => {
    const { question, operator, answer } = condition;
    const predicateQuestion = findFormItemByLinkId(values.item ?? [], question.linkId);
    let answers: { value: any }[] | undefined;

    if (parentAnswer && question.linkId === item.parent?.linkId) {
      answers = [parentAnswer];
    } else if (predicateQuestion?.parent) {
      const root = findRootItem(predicateQuestion);
      const answerItem = findAnswerItem(values, root, predicateQuestion);
      answers = answerItem?.answer;
    } else {
      answers = predicateQuestion?.answer;
    }

    answers = answers ?? [];
    const isCodeType = predicateQuestion?.type === 'choice' || predicateQuestion?.type === 'open-choice';
    const isNumeric = typeof answer === 'number' || predicateQuestion?.type === 'quantity';

    switch (operator) {
      case 'exists':
        return answer === false
          ? answers.some((a) => !hasAnswerValue(a.value))
          : answers.some((a) => hasAnswerValue(a.value));
      case 'empty':
        return answers.some((a) => !hasAnswerValue(a.value));
      case '=':
        return answers.some((a) => {
          if (!predicateQuestion) {
            return false;
          }
          if (isCodeType) {
            return getAnswerCodes(a.value).includes(answer?.code);
          }
          if (isNumeric) {
            return +a.value === +answer;
          }
          return a.value === answer;
        });
      case '!=':
        return answers.some((a) => {
          if (!predicateQuestion) {
            return false;
          }
          if (isCodeType) {
            return !getAnswerCodes(a.value).includes(answer?.code);
          }
          if (isNumeric) {
            return +a.value !== +answer;
          }
          return a.value !== answer;
        });
      case '>':
        return answers.some((a) => (isNumeric ? +a.value > +answer : a.value && a.value > answer));
      case '>=':
        return answers.some((a) => (isNumeric ? +a.value >= +answer : a.value && a.value >= answer));
      case '<':
        return answers.some((a) => (isNumeric ? +a.value < +answer : a.value && a.value < answer));
      case '<=':
        return answers.some((a) => (isNumeric ? +a.value <= +answer : a.value && a.value <= answer));
      default:
        return false;
    }
  });
}

/**
 * Returns the top-most ancestor of a builder form item.
 * @param item - The builder form item.
 * @returns The root item (the item itself when it has no parent).
 */
export function findRootItem(item: ExtendedQuestionnaireItem): ExtendedQuestionnaireItem {
  if (!item.parent) {
    return item;
  }
  return findRootItem(item.parent);
}

/**
 * Returns the answer a follow-up item belongs to, when the item is a copy under one of its question's answers.
 * @param values - The current builder form values.
 * @param item - The builder form item.
 * @returns The question's answer, or undefined when the item is not a follow-up item copy.
 */
function getParentAnswer(values: Record<string, any>, item: ExtendedQuestionnaireItem): { value: any } | undefined {
  const match = /^(.*\.answer\.\d+)\.item\.\d+$/.exec(item.answerPath ?? '');
  return match ? getValueByPath(values, match[1]) : undefined;
}

/**
 * Returns the items answered under one answer of an item: a group repetition's items, or a question answer's
 * follow-up items.
 * @param answer - A group repetition, or a question's answer.
 * @returns The answered items, or undefined.
 */
export function getAnswerItems(answer: any): ExtendedQuestionnaireItem[] | undefined {
  if (Array.isArray(answer)) {
    return answer;
  }
  return Array.isArray(answer?.item) ? answer.item : undefined;
}

function findAnswerItem(
  values: Record<string, any>,
  node: ExtendedQuestionnaireItem,
  item: ExtendedQuestionnaireItem
): ExtendedQuestionnaireItem | undefined {
  const answers = getValueByPath(values, `${node.answerPath}.answer`) ?? [];

  for (const answer of answers) {
    for (const answerItem of getAnswerItems(answer) ?? []) {
      if (answerItem.linkId === item.linkId) {
        return answerItem;
      }
      const found = findAnswerItem(values, answerItem, item);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

function hasAnswerValue(value: any): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function getAnswerCodes(value: any): (string | undefined)[] {
  return Array.isArray(value) ? value.map((coding) => coding?.code) : [value?.code];
}

/**
 * Adds an answer (or, for a group, a repetition) to a builder form item.
 * @param form - The questionnaire form.
 * @param item - The builder form item (or group answer copy) to add the answer to.
 * @param original - The item's definition when `item` is a copy inside a group answer.
 */
export function addFormAnswer(
  form: QuestionnaireForm,
  item: ExtendedQuestionnaireItem,
  original?: ExtendedQuestionnaireItem
): void {
  const path = item.answerPath;
  if (!path) {
    return;
  }

  const answerArray = getValueByPath(form.getValues(), `${path}.answer`) ?? [];
  const questionnaireItem = toFhirQuestionnaireItem(item);
  const childItems = questionnaireItem.item ?? [];

  if (item.type === 'group') {
    const newGroupAnswer = childItems
      .filter((childItem: QuestionnaireItem) => !isHelpItem(childItem))
      .map((childItem: QuestionnaireItem, childIndex: number) =>
        fromFhirQuestionnaireItem(
          childItem,
          form.getValues() as Questionnaire,
          childIndex,
          undefined,
          item,
          `${item.path}.item`,
          `${path}.answer.${answerArray.length}`
        )
      );

    form.setFieldValue(`${path}.answer`, [...answerArray, newGroupAnswer]);
    return;
  }

  let initialArray;

  if (original) {
    if (original.type === 'group') {
      const itemIndex = original.item.findIndex(
        (originalItem: ExtendedQuestionnaireItem) => originalItem.linkId === item.linkId
      );
      const question = original.item[itemIndex];
      initialArray = question.initial;
    } else {
      initialArray = original.initial;
    }
  } else {
    initialArray = getValueByPath(form.getValues(), `${item.path}.initial`) ?? [];
  }

  const index = answerArray.length;
  const initialValue = (initialArray?.[index] as { value?: any } | undefined)?.value ?? '';

  form.setFieldValue(`${path}.answer`, [...answerArray, { value: initialValue }]);
  rebuildFollowUpAnswers(form, original ?? item);
}

/**
 * After a question's answers were added, removed or replaced, gives each answer its own copies of the question's
 * follow-up items (with their paths), keeping what was answered in them.
 * @param form - The questionnaire form.
 * @param question - The question's definition.
 */
export function rebuildFollowUpAnswers(form: QuestionnaireForm, question: ExtendedQuestionnaireItem): void {
  const definition: ExtendedQuestionnaireItem = getValueByPath(form.getValues(), question.path) ?? question;
  if (hasFollowUpItems(definition)) {
    form.setFieldValue('item', rebuildFormItems(form.getValues()));
  }
}

/**
 * Returns true if an answer value counts as unanswered. `false` is an answer.
 * @param value - The answer value.
 * @returns True if the value is empty.
 */
export function isEmptyAnswerValue(value: any): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  return Array.isArray(value) && value.length === 0;
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

  if (type === 'integer' || type === 'decimal' || type === 'quantity') {
    if (!isEmptyAnswerValue(original.minValue) && +value < +(original.minValue as number | string)) {
      return `${label} must be at least ${original.minValue}`;
    }
    if (!isEmptyAnswerValue(original.maxValue) && +value > +(original.maxValue as number | string)) {
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
 * Validates the answers of all shown items (not hidden, enabled by enableWhen).
 * @param values - The current form values.
 * @param items - The items to validate; defaults to all top-level items.
 * @returns Error messages keyed by form path.
 */
export function validateFormAnswers(
  values: Record<string, any>,
  items: ExtendedQuestionnaireItem[] = values.item ?? []
): Record<string, string> {
  const errors: Record<string, string> = {};

  const visit = (item: ExtendedQuestionnaireItem): void => {
    const original: ExtendedQuestionnaireItem = getValueByPath(values, item.path) ?? item;
    if (original.hidden || !evaluateEnableWhen(values, item) || original.type === 'display') {
      return;
    }

    if (original.type === 'group') {
      for (const answerGroup of (item.answer ?? []) as unknown as ExtendedQuestionnaireItem[][]) {
        if (Array.isArray(answerGroup)) {
          answerGroup.forEach(visit);
        }
      }
      return;
    }

    const answersPath = `${item.answerPath}.answer`;
    const answers = item.answer ?? [];

    if (original.required && answers.every((answer) => isEmptyAnswerValue(answer.value))) {
      const isRepeatingChoice = (original.type === 'choice' || original.type === 'open-choice') && original.repeats;
      errors[isRepeatingChoice ? answersPath : `${answersPath}.0.value`] = 'This field is required';
      return;
    }

    answers.forEach((answer, index) => {
      const message = validateAnswerValue(original, answer.value);
      if (message) {
        errors[`${answersPath}.${index}.value`] = message;
      }
      if (!isEmptyAnswerValue(answer.value)) {
        answer.item?.forEach(visit);
      }
    });
  };

  items.forEach(visit);
  return errors;
}

/**
 * Converts the answers in the builder form values into a FHIR QuestionnaireResponse. Hidden items, items disabled by
 * enableWhen, unanswered questions and, in a questionnaire with pages, top-level items outside a page are left out.
 * Each group repetition is a separate item with the group's linkId; follow-up items are answered under their answer.
 * @param values - The current form values (the questionnaire with its answers).
 * @returns The QuestionnaireResponse.
 */
export function toFhirQuestionnaireResponse(values: Record<string, any>): QuestionnaireResponse {
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
    item: toSubmittedResponseItems(values, getPageItems(values.item ?? []) ?? values.item ?? []),
  };
}

function toSubmittedResponseItems(
  values: Record<string, any>,
  items: ExtendedQuestionnaireItem[]
): QuestionnaireResponseItem[] {
  return items.flatMap((item): QuestionnaireResponseItem[] => {
    const original: ExtendedQuestionnaireItem = getValueByPath(values, item.path) ?? item;
    if (original.hidden || !evaluateEnableWhen(values, item)) {
      return [];
    }

    const base = { linkId: item.linkId, ...(original.text && { text: original.text }) };

    if (original.type === 'display') {
      return [base];
    }

    if (original.type === 'group') {
      return ((item.answer ?? []) as unknown as ExtendedQuestionnaireItem[][])
        .filter(Array.isArray)
        .map((answerGroup) => ({ ...base, item: toSubmittedResponseItems(values, answerGroup) }))
        .filter((groupResponse) => groupResponse.item.length > 0);
    }

    const answers = (item.answer ?? [])
      .filter((answer) => !isEmptyAnswerValue(answer.value))
      .map((answer) => {
        // Follow-up items are answered under the answer they belong to.
        const followUpItems = toSubmittedResponseItems(values, answer.item ?? []);
        return {
          ...toFhirResponseAnswer(original, answer.value),
          ...(followUpItems.length > 0 && { item: followUpItems }),
        };
      });

    return answers.length > 0 ? [{ ...base, answer: answers }] : [];
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
      const unit = item.unit;
      return {
        valueQuantity: {
          value: parseFloat(value),
          ...(unit && { unit: unit.display, system: unit.system, code: unit.code }),
        },
      };
    }
    case 'choice':
    case 'open-choice':
      if (typeof value === 'object') {
        return { valueCoding: { code: value.code, display: value.display, system: value.system } };
      }
      return { valueString: String(value) };
    default:
      return { valueString: String(value) };
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
    return new RegExp(regex);
  } catch (_err) {
    // An invalid pattern typed into the builder is not the respondent's error.
    return undefined;
  }
}
