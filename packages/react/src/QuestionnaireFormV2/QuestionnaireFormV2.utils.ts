// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { TypedValue } from '@medplum/core';
import { capitalize, generateId, HTTP_HL7_ORG, PropertyType, UCUM } from '@medplum/core';
import type {
  Coding,
  Encounter,
  Extension,
  Quantity,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
  QuestionnaireItemEnableWhen,
  QuestionnaireItemInitial,
  Reference,
} from '@medplum/fhirtypes';
import {
  getItemAnswerOptionValue,
  getItemEnableWhenValueAnswer,
  getItemInitialValue,
  getQuestionnaireItemReferenceFilter,
  getQuestionnaireItemReferenceTargetTypes,
  QUESTIONNAIRE_HIDDEN_URL,
  QUESTIONNAIRE_ITEM_CONTROL_URL,
  QUESTIONNAIRE_OPTION_EXCLUSIVE_URL,
  QUESTIONNAIRE_REFERENCE_FILTER_URL,
  QUESTIONNAIRE_REFERENCE_RESOURCE_URL,
  QUESTIONNAIRE_SIGNATURE_REQUIRED_URL,
  setQuestionnaireItemReferenceTargetTypes,
} from '@medplum/react-hooks';

/**
 * A questionnaire item as the builder edits it: the extensions it reads are plain fields. Its answers are not here, but
 * in a draft QuestionnaireResponse (see QuestionnaireResponse.utils).
 */
export interface ExtendedQuestionnaireItem extends Omit<QuestionnaireItem, 'enableWhen' | 'item' | 'answerOption'> {
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
  /** The resource types a reference question can point to (questionnaire-referenceResource). */
  referenceResource: string[];
  /** The profiles a reference question's answer must conform to (questionnaire-referenceProfile). */
  referenceProfile: string[];
  /** The search a reference question's answer is picked from, e.g. `active=true` (questionnaire-referenceFilter). */
  referenceFilter: string;
  /** The value set a quantity's unit is picked from (questionnaire-unitValueSet). */
  unitValueSet: string | null;
  /** The most decimal places a decimal or quantity answer may have (maxDecimalPlaces). */
  maxDecimalPlaces: number | null;
  /** An attachment's maximum size in bytes (maxSize). */
  maxSize: number | null;
  /** The file types an attachment may have (mimeType), e.g. `image/png` or `image/*`. */
  mimeType: string[];
  usageMode: string;
  supportLink: string;
  sliderStepValue: number;
  /** A note for authors (designNote), never shown to respondents. */
  designNote: string;
  help: string;
  /** How the help text is shown: behind a help button, on hover, or below the question. */
  helpDisplay: HelpDisplay;
  /** The help item as loaded, so its linkId and anything else on it are kept on save; only its text is edited. */
  helpItem: QuestionnaireItem | undefined;
  /** A question's texts shown with its answer (prompt, unit, lower, upper), by item control. */
  displayTexts: Partial<Record<QuestionDisplayText, string>>;
  /** Those texts' display items as loaded, so their linkIds and anything else on them are kept on save. */
  displayTextItems: Partial<Record<QuestionDisplayText, QuestionnaireItem>>;
  /** What the builder does not edit (other fields and extensions), written back unchanged on save. */
  preserved: PreservedItemContent | undefined;
  itemControl: Record<string, any>;
  answerOption: ExtendedQuestionnaireItemAnswerOption[];
  path: string;
  /** A group's items, or a question's follow-up items. */
  item: ExtendedQuestionnaireItem[];
  parent: ExtendedQuestionnaireItem | undefined;
  enableWhen: ExtendedQuestionnaireItemEnableWhen[];
}

/** The parts of a FHIR item or answer option that the builder does not edit. */
export interface PreservedItemContent {
  /** Fields such as `id`, `definition`, `modifierExtension` and primitive extensions (`_text`). */
  readonly fields?: Record<string, any>;
  /** Extensions the builder does not read. */
  readonly extension?: Extension[];
}

export interface ExtendedQuestionnaireItemAnswerOption extends QuestionnaireItemAnswerOption {
  /** A coding ({ code, display, system, score }), or the plain value of a string, integer, date or time option. */
  value: any;
  /** The FHIR value[x] the option was read from, e.g. `valueString`; a coding when undefined. */
  valueType?: string;
  /** Selecting this option clears the other answers, e.g. "None of the above" (questionnaire-optionExclusive). */
  exclusive?: boolean;
  /** A label shown before the option, e.g. "a)" or "1." (questionnaire-optionPrefix). */
  prefix?: string;
  /** Extensions other than the score and exclusive flag, written back unchanged on save. */
  preservedExtension?: Extension[];
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

export const EXTENSION_URLS = {
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
  referenceResource: QUESTIONNAIRE_REFERENCE_RESOURCE_URL,
  referenceProfile: `${STRUCTURE_DEFINITION_URL}/questionnaire-referenceProfile`,
  referenceFilter: QUESTIONNAIRE_REFERENCE_FILTER_URL,
  maxSize: `${STRUCTURE_DEFINITION_URL}/maxSize`,
  unitValueSet: `${STRUCTURE_DEFINITION_URL}/questionnaire-unitValueSet`,
  maxDecimalPlaces: `${STRUCTURE_DEFINITION_URL}/maxDecimalPlaces`,
  optionPrefix: `${STRUCTURE_DEFINITION_URL}/questionnaire-optionPrefix`,
  mimeType: `${STRUCTURE_DEFINITION_URL}/mimeType`,
  designNote: `${STRUCTURE_DEFINITION_URL}/designNote`,
  ordinalValue: `${STRUCTURE_DEFINITION_URL}/ordinalValue`,
} as const;

const QUESTIONNAIRE_ITEM_CONTROL_SYSTEM = `${HTTP_HL7_ORG}/fhir/questionnaire-item-control`;

/**
 * The extensions the builder reads into its own fields (and writes back from them), by the kind of item they are read
 * for. Others, including these on an item kind they are not read for, are kept unchanged.
 */
const MODELED_EXTENSIONS = {
  all: ['hidden', 'usageMode', 'supportLink', 'designNote', 'displayCategory', 'itemControl'],
  questionsAndGroups: ['minOccurs', 'maxOccurs'],
  questions: [
    'minLength',
    'minValue',
    'maxValue',
    'entryFormat',
    'regex',
    'choiceOrientation',
    'unit',
    'unitOption',
    'sliderStepValue',
    'referenceResource',
    'referenceProfile',
    'referenceFilter',
    'maxSize',
    'mimeType',
    'maxDecimalPlaces',
    'unitValueSet',
  ],
} satisfies Record<string, (keyof typeof EXTENSION_URLS)[]>;

function getModeledExtensionUrls(type: string | undefined): string[] {
  const names: (keyof typeof EXTENSION_URLS)[] = [...MODELED_EXTENSIONS.all];
  if (type !== 'display') {
    names.push(...MODELED_EXTENSIONS.questionsAndGroups);
  }
  if (type !== 'display' && type !== 'group') {
    names.push(...MODELED_EXTENSIONS.questions);
  }
  return names.map((name) => EXTENSION_URLS[name]);
}

/** The FHIR QuestionnaireItem fields the builder does not edit. */
const PRESERVED_ITEM_FIELDS = ['id', 'definition', 'modifierExtension'];

/**
 * Collects what the builder does not edit on a FHIR item: other fields, primitive extensions and other extensions.
 * @param item - The FHIR QuestionnaireItem.
 * @returns The preserved content, or undefined when there is none.
 */
function getPreservedItemContent(item: QuestionnaireItem): PreservedItemContent | undefined {
  const fields = Object.fromEntries(
    Object.entries(item).filter(([key]) => PRESERVED_ITEM_FIELDS.includes(key) || key.startsWith('_'))
  );
  const modeled = getModeledExtensionUrls(item.type);
  const extension = (item.extension ?? []).filter((ext) => !modeled.includes(ext.url));
  if (Object.keys(fields).length === 0 && extension.length === 0) {
    return undefined;
  }
  return {
    ...(Object.keys(fields).length > 0 && { fields }),
    ...(extension.length > 0 && { extension }),
  };
}

/** The item control that marks a top-level group as a page, as used by Medplum's QuestionnaireBuilder and form. */
export const PAGE_ITEM_CONTROL: Coding = { system: QUESTIONNAIRE_ITEM_CONTROL_SYSTEM, code: 'page', display: 'Page' };

/**
 * Decides whether a choice question's options are laid out in a row: only when its `choiceOrientation` is
 * horizontal. Without one, options are listed one per line.
 * @param item - The choice item (its definition).
 * @returns True for a horizontal layout, false for one option per line.
 */
export function isHorizontalChoiceLayout(item: ExtendedQuestionnaireItem): boolean {
  return item.choiceOrientation === 'horizontal';
}

/**
 * Returns true if the form item is a page: a group with the `page` item control.
 * @param item - The form item.
 * @returns True if the item is a page.
 */
export function isPageItem(item: ExtendedQuestionnaireItem | undefined): boolean {
  return item?.type === 'group' && item.itemControl?.code === PAGE_ITEM_CONTROL.code;
}

/** A top-level group kept visible above the questionnaire (item control `header`). */
export const HEADER_ITEM_CONTROL: Coding = {
  system: QUESTIONNAIRE_ITEM_CONTROL_SYSTEM,
  code: 'header',
  display: 'Header',
};

/** A top-level group kept visible below the questionnaire (item control `footer`). */
export const FOOTER_ITEM_CONTROL: Coding = {
  system: QUESTIONNAIRE_ITEM_CONTROL_SYSTEM,
  code: 'footer',
  display: 'Footer',
};

/**
 * Returns true if the form item is a header or footer: a group with the `header` or `footer` item control.
 * @param item - The form item.
 * @returns True if the item is a header or footer.
 */
export function isHeaderOrFooterItem(item: ExtendedQuestionnaireItem | undefined): boolean {
  const code = item?.itemControl?.code;
  return item?.type === 'group' && (code === HEADER_ITEM_CONTROL.code || code === FOOTER_ITEM_CONTROL.code);
}

/**
 * The ways a question's (or group's) help text is shown, by the item control of its display item: behind a help button,
 * on hover (flyover), or below it (inline). In this order, the first one found is the help text.
 */
export const HELP_DISPLAYS = ['help', 'flyover', 'inline'] as const;

export type HelpDisplay = (typeof HELP_DISPLAYS)[number];

/** A question's texts shown with its answer, by the item control of their display items. */
export const QUESTION_DISPLAY_TEXTS = ['prompt', 'unit', 'lower', 'upper'] as const;

export type QuestionDisplayText = (typeof QUESTION_DISPLAY_TEXTS)[number];

const DISPLAY_CONTROL_NAMES: Record<string, string> = {
  help: 'Help-Button',
  flyover: 'Fly-over',
  inline: 'In-line',
  prompt: 'Prompt',
  unit: 'Unit',
  lower: 'Lower-bound',
  upper: 'Upper-bound',
};

/**
 * Returns the item control of a display item, e.g. `help`.
 * @param item - The FHIR QuestionnaireItem.
 * @returns The item control code, or undefined for other items.
 */
function getDisplayControl(item: QuestionnaireItem): string | undefined {
  if (item.type !== 'display') {
    return undefined;
  }
  return item.extension
    ?.find((ext: Extension) => ext.url === EXTENSION_URLS.itemControl)
    ?.valueCodeableConcept?.coding?.find(
      (coding) => !coding.system || coding.system === QUESTIONNAIRE_ITEM_CONTROL_SYSTEM
    )?.code;
}

/**
 * Finds the help text among an item's children: the first display item shown behind a help button, on hover, or
 * below it (in that order).
 * @param items - The FHIR child items.
 * @returns The help item, or undefined.
 */
function findHelpItem(items: QuestionnaireItem[]): QuestionnaireItem | undefined {
  for (const code of HELP_DISPLAYS) {
    const found = items.find((item) => getDisplayControl(item) === code);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * Returns a display item with the given item control, keeping everything else on it.
 * @param item - The FHIR display item.
 * @param code - The item control code.
 * @returns The display item with the control.
 */
function withDisplayControl(item: QuestionnaireItem, code: string): QuestionnaireItem {
  if (getDisplayControl(item) === code) {
    return item;
  }
  const display = DISPLAY_CONTROL_NAMES[code];
  return {
    ...item,
    extension: [
      ...(item.extension ?? []).filter((ext) => ext.url !== EXTENSION_URLS.itemControl),
      {
        url: EXTENSION_URLS.itemControl,
        valueCodeableConcept: { coding: [{ system: QUESTIONNAIRE_ITEM_CONTROL_SYSTEM, code, display }], text: display },
      },
    ],
  };
}

/**
 * Returns the pages of a questionnaire: its top-level page groups. When a questionnaire has pages, top-level items
 * outside a page are not rendered.
 * @param items - The top-level form items.
 * @returns The page items, or undefined when the questionnaire has no pages.
 */
export function getPageItems(items: ExtendedQuestionnaireItem[]): ExtendedQuestionnaireItem[] | undefined {
  const pages = items.filter(isPageItem);
  return pages.length > 0 ? pages : undefined;
}

/**
 * Returns the top-level items a respondent fills in: all of them, or with pages, the pages and any header or footer.
 * @param items - The top-level form items.
 * @returns The items that are shown and answered.
 */
export function getRespondedItems(items: ExtendedQuestionnaireItem[]): ExtendedQuestionnaireItem[] {
  return getPageItems(items) ? items.filter((item) => isPageItem(item) || isHeaderOrFooterItem(item)) : items;
}

/**
 * Returns true if a FHIR item is help text: a display item with the `help` item control. Help is shown by its
 * question or group, not as an item of its own.
 * @param item - The FHIR QuestionnaireItem.
 * @returns True if the item is help text.
 */
export function isHelpItem(item: QuestionnaireItem): boolean {
  return HELP_DISPLAYS.includes(getDisplayControl(item) as HelpDisplay);
}

/**
 * Returns true if the form item is a question: an item that is answered, so neither a group nor display text.
 * @param item - The form item.
 * @returns True if the item is a question.
 */
export function isQuestionItem(item: ExtendedQuestionnaireItem | undefined): boolean {
  return !!item && item.type !== 'group' && item.type !== 'display';
}

/**
 * Returns true if the form item is a question with follow-up items.
 * @param item - The form item.
 * @returns True if the question has follow-up items.
 */
export function hasFollowUpItems(item: ExtendedQuestionnaireItem | undefined): boolean {
  return isQuestionItem(item) && (item?.item?.length ?? 0) > 0;
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
 * Finds a form item by linkId, searching nested group items.
 * @param items - The form items to search.
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
 * Rebuilds all form items from their FHIR form, recomputing `path`, `parent` and `enableWhen` references. Call after
 * any change to the item structure (add, move, delete).
 * @param values - The current form values.
 * @returns The rebuilt form items.
 */
export function rebuildFormItems(values: Record<string, any>): ExtendedQuestionnaireItem[] {
  const fhirItems: QuestionnaireItem[] = (values.item ?? []).map((item: any) => toFhirQuestionnaireItem(item));
  const questionnaire = { ...values, item: fhirItems } as Questionnaire;
  return fhirItems.map((item: QuestionnaireItem, index: number) =>
    fromFhirQuestionnaireItem(item, questionnaire, index)
  );
}

/**
 * Converts the form values back into a FHIR Questionnaire. Top-level fields are kept as loaded; only the
 * items are converted back from their form values.
 * @param values - The current form values.
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
 * Converts a form item back into a FHIR QuestionnaireItem.
 * @param item - The form item.
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
    designNote,
    referenceResource,
    referenceProfile,
    referenceFilter,
    maxSize,
    mimeType,
    maxDecimalPlaces,
    unitValueSet,
    help,
    helpDisplay,
    helpItem,
    displayTexts,
    displayTextItems,
    preserved,
    itemControl,
    enableWhen,
    enableBehavior,
    initial,
    answerOption,
    code,
    index: _index,
    item: childItems,
    path: _path,
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
        // Typed like the option it names: a coding, or a plain value (answerString, answerInteger, ...).
        const option = findAnswerOption(condition.question.answerOption, answer);
        if (option && !isCodedAnswerOption(option)) {
          answerKey = (option.valueType as string).replace(/^value/, 'answer');
        } else if (answer && typeof answer === 'object') {
          answer = {
            ...(answer.system && { system: answer.system }),
            code: answer.code,
            ...(answer.display && { display: answer.display }),
          };
        } else {
          answerKey = 'answerString';
        }
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
          value = { value: +initialItem.value };
        } else {
          value = initialItem.value;
        }

        return { [valueKey]: value };
      });

    transformedAnswerOption = (answerOption ?? [])
      .map((option: ExtendedQuestionnaireItemAnswerOption) => toFhirAnswerOption(option))
      .filter(Boolean);
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

  // 0 is a bound too.
  if (!isEmptyAnswerValue(minValue)) {
    const questionType: string = item.type;
    // R4 minValue/maxValue take no Quantity: a quantity's bound is its number, as a decimal.
    const valueKey =
      questionType === 'quantity'
        ? 'valueDecimal'
        : `value${questionType.charAt(0).toUpperCase()}${questionType.slice(1)}`;
    let value: string | number;

    if (questionType === 'integer' || questionType === 'decimal' || questionType === 'quantity') {
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

  if (!isEmptyAnswerValue(maxValue)) {
    const questionType = item.type;
    // R4 minValue/maxValue take no Quantity: a quantity's bound is its number, as a decimal.
    const valueKey =
      questionType === 'quantity'
        ? 'valueDecimal'
        : `value${questionType.charAt(0).toUpperCase()}${questionType.slice(1)}`;
    let value: string | number;

    if (questionType === 'integer' || questionType === 'decimal' || questionType === 'quantity') {
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

  if (designNote) {
    extensions.push({
      url: EXTENSION_URLS.designNote,
      valueMarkdown: designNote,
    });
  }

  if (supportLink) {
    extensions.push({
      url: EXTENSION_URLS.supportLink,
      valueUri: supportLink,
    });
  }

  if ((item.type === 'integer' || item.type === 'decimal') && itemControl.code === 'slider' && sliderStepValue) {
    extensions.push({
      url: EXTENSION_URLS.sliderStepValue,
      valueInteger: +sliderStepValue,
    });
  }

  // A group's items, or a question's follow-up items.
  const processedChildItems: QuestionnaireItem[] =
    item.type === 'display' ? [] : (childItems ?? []).map((childItem: any) => toFhirQuestionnaireItem(childItem));

  // A question's display texts, and its help first: loaded ones keep everything but their text and control.
  for (const code of [...QUESTION_DISPLAY_TEXTS].reverse()) {
    const text = displayTexts?.[code];
    if (text) {
      const base = displayTextItems?.[code] ?? { linkId: `${item.linkId}_${code}`, type: 'display' };
      processedChildItems.unshift(withDisplayControl({ ...base, text }, code));
    }
  }
  if (help) {
    const base = helpItem ?? { linkId: `${item.linkId}_help`, type: 'display' };
    processedChildItems.unshift(withDisplayControl({ ...base, text: help }, helpDisplay || 'help'));
  }

  if (item.type === 'quantity' && unitValueSet) {
    extensions.push({ url: EXTENSION_URLS.unitValueSet, valueCanonical: unitValueSet });
  }

  if ((item.type === 'decimal' || item.type === 'quantity') && isNonNegativeInteger(maxDecimalPlaces)) {
    extensions.push({ url: EXTENSION_URLS.maxDecimalPlaces, valueInteger: +maxDecimalPlaces });
  }

  if (item.type === 'attachment') {
    if (maxSize) {
      extensions.push({ url: EXTENSION_URLS.maxSize, valueDecimal: +maxSize });
    }
    for (const type of (mimeType ?? []).filter(Boolean)) {
      extensions.push({ url: EXTENSION_URLS.mimeType, valueCode: type });
    }
  }

  if (item.type === 'reference') {
    for (const profile of (referenceProfile ?? []).filter(Boolean)) {
      extensions.push({ url: EXTENSION_URLS.referenceProfile, valueCanonical: profile });
    }
    if (referenceFilter?.trim()) {
      extensions.push({ url: EXTENSION_URLS.referenceFilter, valueString: referenceFilter.trim() });
    }
  }

  extensions.push(...(preserved?.extension ?? []));

  const result: QuestionnaireItem = {
    ...rest,
    ...preserved?.fields,
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

  // Written with Medplum's helper, as its QuestionnaireBuilder does: one type as a code, several as a CodeableConcept.
  const targetTypes = (referenceResource ?? []).filter(Boolean);
  return item.type === 'reference' && targetTypes.length > 0
    ? setQuestionnaireItemReferenceTargetTypes(result, targetTypes)
    : result;
}

/**
 * Converts a FHIR QuestionnaireItem into a form item.
 * @param item - The FHIR QuestionnaireItem (or an already converted form item).
 * @param questionnaire - The questionnaire the item belongs to; used to resolve enableWhen questions.
 * @param index - The index of the item within its parent.
 * @param parent - The parent form item, if nested.
 * @param basePath - The form path of the parent item list.
 * @returns The form item.
 */
export function fromFhirQuestionnaireItem(
  item: QuestionnaireItem | ExtendedQuestionnaireItem,
  questionnaire: Questionnaire | null,
  index?: number,
  parent?: ExtendedQuestionnaireItem,
  basePath: string = 'item'
): any {
  // Help and a question's display texts are not items of their own: they are read into `help` and `displayTexts`.
  const allChildItems = (item.item ?? []) as QuestionnaireItem[];
  const helpItem = item.type === 'display' ? undefined : findHelpItem(allChildItems);
  const displayTextItems: Partial<Record<QuestionDisplayText, QuestionnaireItem>> = {};
  if (item.type !== 'display' && item.type !== 'group') {
    for (const code of QUESTION_DISPLAY_TEXTS) {
      const found = allChildItems.find((child) => child !== helpItem && getDisplayControl(child) === code);
      if (found) {
        displayTextItems[code] = found;
      }
    }
  }
  const childItems = allChildItems.filter(
    (child) => child !== helpItem && !Object.values(displayTextItems).includes(child)
  );
  const extensions: Extension[] = item.extension ?? [];
  const minOccurs = extensions.find((ext) => ext.url === EXTENSION_URLS.minOccurs)?.valueInteger ?? 1;
  const maxOccurs = extensions.find((ext) => ext.url === EXTENSION_URLS.maxOccurs)?.valueInteger ?? null;
  const path = `${basePath}.${index}`;

  const parentRef = parent
    ? {
        linkId: parent.linkId,
        type: parent.type,
        readOnly: parent.readOnly,
        ...(parent.parent && { parent: parent.parent }),
        ...(parent.path && { path: parent.path }),
      }
    : undefined;

  const formData: any = {
    // applies to questions & groups & display
    path: path,
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
    designNote:
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.designNote)?.valueMarkdown ?? '',
    displayCategory:
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.displayCategory)?.valueCodeableConcept
        ?.coding?.[0] ?? {},
    parent: parentRef,
    // Groups, questions and display text all have item controls.
    itemControl:
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.itemControl)?.valueCodeableConcept
        ?.coding?.[0] ?? {},
    preserved: getPreservedItemContent(item as QuestionnaireItem),
  };

  // applies to questions & groups
  if (item.type !== 'display') {
    // Whole codings, so fields the builder does not edit (e.g. version) are kept.
    formData.code = item.code?.map((code: Coding) => ({ ...code })) || [];
    formData.required = item.required ?? false;
    formData.repeats = item.repeats ?? false;
    formData.readOnly = item.readOnly ?? false;
    formData.help = helpItem?.text ?? '';
    formData.helpDisplay = (helpItem && getDisplayControl(helpItem)) ?? 'help';
    formData.helpItem = helpItem;
    formData.displayTexts = Object.fromEntries(
      Object.entries(displayTextItems).map(([code, child]) => [code, child.text ?? ''])
    );
    formData.displayTextItems = displayTextItems;
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
    // Answers bound to a value set instead of listed as options (FHIR allows one or the other).
    formData.answerValueSet = item.answerValueSet;
    formData.unitOption = extensions
      .filter((extension: Extension) => extension.url === EXTENSION_URLS.unitOption)
      .map((extension: Extension) => extension.valueCoding);
    formData.unit =
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.unit)?.valueCoding ?? null;
    formData.referenceResource = getQuestionnaireItemReferenceTargetTypes(item as QuestionnaireItem) ?? [];
    formData.maxSize =
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.maxSize)?.valueDecimal ?? null;
    formData.unitValueSet =
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.unitValueSet)?.valueCanonical ?? null;
    formData.maxDecimalPlaces =
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.maxDecimalPlaces)?.valueInteger ??
      null;
    formData.mimeType = extensions
      .filter((extension: Extension) => extension.url === EXTENSION_URLS.mimeType && extension.valueCode)
      .map((extension: Extension) => extension.valueCode);
    formData.referenceFilter =
      extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.referenceFilter)?.valueString ?? '';
    formData.referenceProfile = extensions
      .filter((extension: Extension) => extension.url === EXTENSION_URLS.referenceProfile && extension.valueCanonical)
      .map((extension: Extension) => extension.valueCanonical);
  }

  // A group's items, or a question's follow-up items (answered under each of its answers, in `answer.item`).
  if (item.type !== 'display') {
    formData.item = childItems.map((childItem: QuestionnaireItem, childIndex: number) =>
      fromFhirQuestionnaireItem(childItem, questionnaire, childIndex, formData, `${path}.item`)
    );
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
      return toLocalDateTime((extension as any)[valueKey]);
    } else if (questionType === 'quantity') {
      return extension.valueDecimal ?? extension.valueInteger ?? (extension as any).valueQuantity?.value ?? null;
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

  const answer = getItemEnableWhenValueAnswer(enableWhen);
  if (answer?.type === PropertyType.Quantity) {
    formData.answer = answer.value?.value;
    formData.unit = { code: answer.value?.code, display: answer.value?.unit, system: answer.value?.system };
  } else if (answer) {
    formData.answer = fromTypedValue(answer, false);
  }

  return formData;
}

/**
 * Converts a FHIR value (of an initial value, an answer or a condition), as Medplum's typed value helpers read it, into
 * the value an input holds: a dateTime in local time, a time without seconds, a quantity or only its number.
 * @param typed - The typed value.
 * @param keepQuantity - True to keep a quantity whole (for a quantity question), false for its number.
 * @returns The value, or undefined without one.
 */
export function fromTypedValue(typed: TypedValue | undefined, keepQuantity: boolean): any {
  if (!typed) {
    return undefined;
  }
  switch (typed.type) {
    case PropertyType.dateTime:
      return toLocalDateTime(typed.value);
    case PropertyType.time:
      return typed.value?.split(':').slice(0, 2).join(':');
    case PropertyType.Quantity:
      return keepQuantity ? { ...typed.value } : typed.value?.value;
    default:
      return typed.value;
  }
}

function fromQuestionnaireItemInitial(initial: QuestionnaireItemInitial): any {
  const value = fromTypedValue(getItemInitialValue(initial), false);
  return value === undefined ? {} : { value };
}

/**
 * Returns true if an answer option is a coding (hand-written, LOINC, value set), rather than a plain value.
 * @param answerOption - The form answer option.
 * @returns True for a coded option.
 */
export function isCodedAnswerOption(answerOption: ExtendedQuestionnaireItemAnswerOption): boolean {
  return !answerOption.valueType || answerOption.valueType === 'valueCoding';
}

/**
 * Returns the text an answer option is shown with: a coding's display (or code), a reference's display (or
 * reference), or a plain value itself.
 * @param answerOption - The form answer option.
 * @returns The option's label.
 */
export function getAnswerOptionLabel(answerOption: ExtendedQuestionnaireItemAnswerOption): string {
  const value = answerOption.value;
  if (value && typeof value === 'object') {
    return String(value.display || value.code || value.reference || '');
  }
  return String(value ?? '');
}

/**
 * Returns the text an answer option is listed with: its prefix (questionnaire-optionPrefix), if any, and its label.
 * @param answerOption - The form answer option.
 * @returns The option's listed text, e.g. "a) Apple".
 */
export function getAnswerOptionDisplay(answerOption: ExtendedQuestionnaireItemAnswerOption): string {
  const label = getAnswerOptionLabel(answerOption);
  return answerOption.prefix?.trim() ? `${answerOption.prefix.trim()} ${label}` : label;
}

/**
 * Returns true if a value is a whole number of 0 or more, or its text (e.g. a maxDecimalPlaces setting).
 * @param value - The value.
 * @returns True for a non-negative integer.
 */
export function isNonNegativeInteger(value: unknown): value is number | string {
  return value !== null && value !== undefined && value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0;
}

/**
 * Returns a key that identifies a choice answer value: codings by code, references by reference, plain values by type
 * and value. Answers and answer options with the same key are the same answer.
 * @param value - A choice answer value, or an answer option's value.
 * @returns The key.
 */
export function getChoiceValueKey(value: any): string {
  if (value && typeof value === 'object') {
    return value.reference ? `reference:${value.reference}` : `code:${value.code ?? ''}`;
  }
  return `${typeof value}:${String(value ?? '')}`;
}

/**
 * Finds the answer option a choice answer value was selected from.
 * @param answerOptions - The item's answer options.
 * @param value - The answer value.
 * @returns The answer option, or undefined (e.g. for an open-choice answer typed by the respondent).
 */
export function findAnswerOption(
  answerOptions: ExtendedQuestionnaireItemAnswerOption[] | undefined,
  value: any
): ExtendedQuestionnaireItemAnswerOption | undefined {
  const key = getChoiceValueKey(value);
  return (answerOptions ?? []).find((option) => getChoiceValueKey(option.value) === key);
}

/**
 * Converts a form answer option back into a FHIR answer option.
 * @param option - The form answer option.
 * @returns The FHIR answer option, or undefined when it is incomplete (a coding without code, an empty value).
 */
export function toFhirAnswerOption(
  option: ExtendedQuestionnaireItemAnswerOption
): QuestionnaireItemAnswerOption | undefined {
  const { initialSelected, value, exclusive, prefix, preservedExtension = [] } = option;
  const exclusiveExtension = [
    ...(exclusive ? [{ url: QUESTIONNAIRE_OPTION_EXCLUSIVE_URL, valueBoolean: true }] : []),
    ...(prefix?.trim() ? [{ url: EXTENSION_URLS.optionPrefix, valueString: prefix }] : []),
  ];
  if (!isCodedAnswerOption(option)) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const typed = option.valueType === 'valueInteger' ? Number.parseInt(String(value), 10) : value;
    const plainExtension = [...exclusiveExtension, ...preservedExtension];
    return {
      initialSelected,
      [option.valueType as string]: typed,
      ...(plainExtension.length > 0 && { extension: plainExtension }),
    };
  }

  const { score, ...coding } = value ?? {};
  if (!String(coding.code ?? '').trim()) {
    return undefined;
  }
  // A score of 0 is a real score (e.g. "Not at all" in PHQ instruments).
  const hasScore = score !== undefined && score !== null && score !== '';
  const extension = [
    ...(hasScore ? [{ url: EXTENSION_URLS.ordinalValue, valueDecimal: +score }] : []),
    ...exclusiveExtension,
    ...preservedExtension,
  ];
  return {
    initialSelected,
    // Empty fields left by editing (e.g. a cleared display) are not written.
    valueCoding: Object.fromEntries(
      Object.entries(coding).filter(
        ([, fieldValue]) => fieldValue !== undefined && fieldValue !== null && fieldValue !== ''
      )
    ),
    ...(extension.length > 0 && { extension }),
  };
}

/**
 * Converts FHIR answer options into form answer options.
 * @param answerOptions - The FHIR answer options.
 * @returns The form answer options.
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
  const optionValue = getItemAnswerOptionValue(answerOption);
  if (optionValue && optionValue.type !== PropertyType.Coding) {
    formData.valueType = `value${capitalize(optionValue.type)}`;
  }
  if (extensions.some((extension) => extension.url === QUESTIONNAIRE_OPTION_EXCLUSIVE_URL && extension.valueBoolean)) {
    formData.exclusive = true;
  }
  const prefix = extensions.find((extension) => extension.url === EXTENSION_URLS.optionPrefix)?.valueString;
  if (prefix) {
    formData.prefix = prefix;
  }
  const modeledOptionExtensions = [
    EXTENSION_URLS.ordinalValue,
    QUESTIONNAIRE_OPTION_EXCLUSIVE_URL,
    EXTENSION_URLS.optionPrefix,
  ];
  const preservedExtension = extensions.filter(
    (extension: Extension) => !modeledOptionExtensions.includes(extension.url)
  );
  if (preservedExtension.length > 0) {
    formData.preservedExtension = preservedExtension;
  }

  if (optionValue?.type === PropertyType.Coding) {
    // The whole coding, so fields the builder does not edit (e.g. version) are kept.
    formData.value = {
      ...optionValue.value,
      score: extensions.find((extension: Extension) => extension.url === EXTENSION_URLS.ordinalValue)?.valueDecimal,
    };
  } else if (optionValue) {
    formData.value = optionValue.value;
  }

  return formData;
}

/**
 * Returns the top-most ancestor of a form item.
 * @param item - The form item.
 * @returns The root item (the item itself when it has no parent).
 */
export function findRootItem(item: ExtendedQuestionnaireItem): ExtendedQuestionnaireItem {
  if (!item.parent) {
    return item;
  }
  return findRootItem(item.parent);
}

/**
 * Returns true if an answer value is a quantity ({ value, comparator, unit, code, system }).
 * @param value - The answer value.
 * @returns True for a quantity.
 */
export function isQuantityAnswer(value: any): value is Quantity {
  return !!value && typeof value === 'object' && !Array.isArray(value) && 'value' in value;
}

/**
 * Returns true for a choice or open-choice question type.
 * @param type - The item type.
 * @returns True for a choice type.
 */
export function isChoiceItemType(type: string | undefined): boolean {
  return type === 'choice' || type === 'open-choice';
}

/**
 * Returns true if an item cannot be answered by the respondent: it, or a group or question it belongs to, is read only.
 * Read from the definitions, so it reflects the latest edits.
 * @param values - The current form values.
 * @param item - The form item.
 * @returns True if the item is read only.
 */
export function isReadOnlyFormItem(values: Record<string, any>, item: ExtendedQuestionnaireItem): boolean {
  const segments = (item.path ?? '').split('.');
  for (let length = 2; length <= segments.length; length += 2) {
    if (getValueByPath(values, segments.slice(0, length).join('.'))?.readOnly) {
      return true;
    }
  }
  return false;
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
  if (isQuantityAnswer(value)) {
    return isEmptyAnswerValue(value.value);
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  return Array.isArray(value) && value.length === 0;
}

/**
 * Returns the signature a questionnaire requires (questionnaire-signatureRequired on the Questionnaire itself, as
 * Medplum's QuestionnaireForm reads it), or undefined when none is required.
 * @param values - The form values (the questionnaire).
 * @returns The required signature type, or undefined.
 */
export function getRequiredSignatureType(values: Record<string, any>): Coding | undefined {
  const extension = (values.extension as Extension[] | undefined)?.find(
    (ext) => ext.url === QUESTIONNAIRE_SIGNATURE_REQUIRED_URL
  );
  if (!extension) {
    return undefined;
  }
  return extension.valueCodeableConcept?.coding?.[0] ?? {};
}

/** How a questionnaire is rendered: filled in (capture), or its answers viewed (display). */
export type QuestionnaireMode = 'capture' | 'display';

/**
 * Returns true if an item's usage mode (questionnaire-usageMode) includes a mode, regardless of answers. Without a usage
 * mode, an item is used in both.
 * @param usageMode - The item's usage mode code.
 * @param mode - The mode the questionnaire is rendered in.
 * @returns True if the item is used in the mode.
 */
export function isUsedInMode(usageMode: string | undefined, mode: QuestionnaireMode): boolean {
  const code = usageMode || 'capture-display';
  return mode === 'capture' ? code.startsWith('capture') : code !== 'capture';
}

/**
 * Checks a reference search filter (questionnaire-referenceFilter): search parameters as `name=value`, joined by `&`,
 * as Medplum's QuestionnaireForm reads them.
 * @param filter - The filter.
 * @returns The error message, or undefined when the filter is empty or valid.
 */
export function getReferenceFilterError(filter: string | undefined): string | undefined {
  const parts = filter?.trim() ? filter.trim().split('&') : [];
  const invalid = parts.find((part) => !/^[^=\s]+=\S/.test(part));
  if (invalid === undefined) {
    return undefined;
  }
  return `"${invalid}" is not name=value. Join several with &, e.g. active=true&address-state=CA`;
}

/**
 * Returns the search a reference answer is picked from: the question's filter (questionnaire-referenceFilter), with
 * `$subj` and `$encounter` replaced by the form's subject and encounter, as Medplum's QuestionnaireForm does. Parameters
 * whose variable has no value are left out, so the search is not narrowed by an unresolved variable.
 * @param original - The reference question.
 * @param subject - The form's subject.
 * @param encounter - The form's encounter.
 * @returns The search parameters, or undefined when there is no filter.
 */
export function getReferenceSearchCriteria(
  original: ExtendedQuestionnaireItem,
  subject?: Reference,
  encounter?: Reference<Encounter>
): Record<string, string> | undefined {
  if (!original.referenceFilter?.trim() || getReferenceFilterError(original.referenceFilter)) {
    return undefined;
  }
  const criteria = getQuestionnaireItemReferenceFilter(
    {
      linkId: original.linkId,
      type: 'reference',
      extension: [{ url: EXTENSION_URLS.referenceFilter, valueString: original.referenceFilter.trim() }],
    },
    subject,
    encounter
  );
  const resolved = Object.entries(criteria ?? {}).filter(
    ([, value]) => !value.includes('$subj') && !value.includes('$encounter')
  );
  return resolved.length > 0 ? Object.fromEntries(resolved) : undefined;
}

/**
 * Converts a FHIR dateTime into the local date and time of a `datetime-local` input. Form values are local times,
 * saved as UTC instants (toISOString), so they must be read back in local time or they shift by the time zone offset.
 * @param value - The FHIR dateTime.
 * @returns The local date and time (`YYYY-MM-DDTHH:mm`, with seconds when not zero), or the value when it has no time.
 */
function toLocalDateTime(value: string | undefined): string | undefined {
  if (!value?.includes('T')) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (n: number): string => String(n).padStart(2, '0');
  const local = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return date.getSeconds() ? `${local}:${pad(date.getSeconds())}` : local;
}

/**
 * Converts a unit coding (questionnaire-unit, questionnaire-unitOption) into the unit fields of a Quantity.
 * @param coding - The unit coding.
 * @returns The Quantity's unit, system and code, or undefined.
 */
export function toQuantityUnit(
  coding: Coding | null | undefined
): Pick<Quantity, 'unit' | 'system' | 'code'> | undefined {
  if (!coding) {
    return undefined;
  }
  return { unit: coding.display ?? coding.code, system: coding.system, code: coding.code };
}
