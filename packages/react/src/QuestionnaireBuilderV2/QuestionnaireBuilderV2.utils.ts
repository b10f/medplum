// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { TypedValue } from '@medplum/core';
import {
  evalFhirPathTyped,
  generateId,
  getReferenceString,
  HTTP_HL7_ORG,
  normalizeErrorString,
  toJsBoolean,
  toTypedValue,
  UCUM,
} from '@medplum/core';
import type {
  Coding,
  Extension,
  Quantity,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
  QuestionnaireItemEnableWhen,
  QuestionnaireItemInitial,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  Signature,
  ValueSet,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import {
  getQuestionnaireItemReferenceTargetTypes,
  QUESTIONNAIRE_CALCULATED_EXPRESSION_URL,
  QUESTIONNAIRE_ENABLED_WHEN_EXPRESSION_URL,
  QUESTIONNAIRE_HIDDEN_URL,
  QUESTIONNAIRE_ITEM_CONTROL_URL,
  QUESTIONNAIRE_OPTION_EXCLUSIVE_URL,
  QUESTIONNAIRE_REFERENCE_RESOURCE_URL,
  QUESTIONNAIRE_SIGNATURE_REQUIRED_URL,
  QUESTIONNAIRE_SIGNATURE_RESPONSE_URL,
  setQuestionnaireItemReferenceTargetTypes,
  typedValueToResponseItem,
} from '@medplum/react-hooks';
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
  /** The resource types a reference question can point to (questionnaire-referenceResource). */
  referenceResource: string[];
  /** The profiles a reference question's answer must conform to (questionnaire-referenceProfile). */
  referenceProfile: string[];
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
  answerPath: string;
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

export interface ExtendedQuestionnaireItemAnswer {
  value: any;
  /** Copies of the question's follow-up items, answered for this answer. */
  item?: ExtendedQuestionnaireItem[];
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
  referenceResource: QUESTIONNAIRE_REFERENCE_RESOURCE_URL,
  referenceProfile: `${STRUCTURE_DEFINITION_URL}/questionnaire-referenceProfile`,
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
 * Returns true if the builder form item is a page: a group with the `page` item control.
 * @param item - The builder form item.
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
 * Returns true if the builder form item is a header or footer: a group with the `header` or `footer` item control.
 * @param item - The builder form item.
 * @returns True if the item is a header or footer.
 */
export function isHeaderOrFooterItem(item: ExtendedQuestionnaireItem | undefined): boolean {
  const code = item?.itemControl?.code;
  return item?.type === 'group' && (code === HEADER_ITEM_CONTROL.code || code === FOOTER_ITEM_CONTROL.code);
}

/**
 * Returns true if a group's item control is fixed by what the group is (a page, header or footer), so it is not
 * edited as a setting.
 * @param item - The builder form item.
 * @returns True for pages, headers and footers.
 */
export function hasFixedItemControl(item: ExtendedQuestionnaireItem | undefined): boolean {
  return isPageItem(item) || isHeaderOrFooterItem(item);
}

/** The item controls of FHIR's item control code system, by the kind of item they are for (its top-level codes). */
export interface ItemControlCodes {
  readonly group: Coding[];
  readonly text: Coding[];
  readonly question: Coding[];
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
 * The question controls that suit each question type, from the item control code system's definitions: numbers are
 * typed, spun or slid; choices are picked from buttons, boxes or lists; yes/no is a box or two buttons. `lookup` (a
 * dialog tuned to one choice list) is not offered.
 * @param type - The question type.
 * @param repeats - True if the question repeats.
 * @returns The suitable question control codes.
 */
function getQuestionControlCodes(type: string, repeats: boolean): string[] {
  switch (type) {
    case 'boolean':
      return ['check-box', 'radio-button'];
    case 'integer':
    case 'decimal':
      return ['text-box', 'spinner', 'slider'];
    case 'choice':
    case 'open-choice':
      return repeats
        ? ['check-box', 'drop-down', 'multi-select', 'autocomplete']
        : ['radio-button', 'drop-down', 'autocomplete'];
    default:
      return [];
  }
}

/**
 * Returns the item controls an item can take, from the item control code system: group controls for groups (not
 * page, header or footer, which are added as such), and the question controls that suit a question's type. Text
 * controls are edited as the question's help and display texts.
 * @param codes - The item control codes, by kind.
 * @param item - The builder form item.
 * @returns The item controls, in the code system's order.
 */
export function getItemControlOptions(codes: ItemControlCodes, item: ExtendedQuestionnaireItem): Coding[] {
  if (item.type === 'group') {
    return codes.group.filter(
      (code) => code.code !== HEADER_ITEM_CONTROL.code && code.code !== FOOTER_ITEM_CONTROL.code
    );
  }
  if (item.type === 'display') {
    // Text controls are the question's help and texts shown with its answer, edited as such.
    return [];
  }
  const suitable = getQuestionControlCodes(item.type, !!item.repeats);
  return codes.question.filter((code) => suitable.includes(code.code as string));
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
 * Returns the top-level items a respondent fills in: all of them, or with pages, the pages and any header or footer.
 * @param items - The top-level builder form items.
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
 * take children, and pages, headers and footers stay top level.
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
  // Pages, headers and footers stay top level.
  if (previous && !hasFixedItemControl(active.item)) {
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
    designNote,
    referenceResource,
    referenceProfile,
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

  if (minValue) {
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

  if (maxValue) {
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
    formData.answer = responseItem?.answer
      ? fromQuestionnaireResponseItemAnswer(responseItem.answer, item.type)
      : fromQuestionnaireItemInitialToAnswer(item as QuestionnaireItem);
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
    formData.referenceProfile = extensions
      .filter((extension: Extension) => extension.url === EXTENSION_URLS.referenceProfile && extension.valueCanonical)
      .map((extension: Extension) => extension.valueCanonical);

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
    formData.answer = toLocalDateTime(enableWhen.answerDateTime);
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
    formData.value = toLocalDateTime(initial.valueDateTime);
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
      value = toLocalDateTime(initial.valueDateTime);
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
      // A quantity answer keeps its unit and comparator.
      value = item.type === 'quantity' ? { ...initial.valueQuantity } : initial.valueQuantity?.value;
    } else if ('valueReference' in initial) {
      value = initial.valueReference;
    }

    answers.push({ value: value });
  });

  if (item.type === 'choice' || item.type === 'open-choice') {
    const initialSelected = (item.answerOption ?? [])
      .filter((answer: QuestionnaireItemAnswerOption) => answer.initialSelected)
      .map((answer: QuestionnaireItemAnswerOption) => ({
        value: answer.valueCoding ?? fromQuestionnaireItemAnswerOption(answer).value,
      }));

    answers = initialSelected;
  }

  // Yes/no as two radio buttons starts with neither picked; a switch or check-box starts off (false).
  const isYesNoButtons =
    item.type === 'boolean' &&
    extensions.some(
      (extension: Extension) =>
        extension.url === EXTENSION_URLS.itemControl &&
        extension.valueCodeableConcept?.coding?.some((coding) => coding.code === 'radio-button')
    );
  const defaultValue = isYesNoButtons ? null : getDefaultAnswerValue(item.type);

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

    // A choice answer is one of the options' values, which are kept as they are.
    if ((itemType === 'choice' || itemType === 'open-choice') && (answer.valueTime || answer.valueDateTime)) {
      return { value: answer.valueTime ?? answer.valueDateTime };
    }

    if ('valueBoolean' in answer) {
      value = answer.valueBoolean;
    } else if ('valueDecimal' in answer) {
      value = answer.valueDecimal;
    } else if ('valueInteger' in answer) {
      value = answer.valueInteger;
    } else if ('valueDate' in answer) {
      value = answer.valueDate;
    } else if ('valueDateTime' in answer) {
      value = toLocalDateTime(answer.valueDateTime);
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
      value = itemType === 'quantity' ? { ...answer.valueQuantity } : answer.valueQuantity?.value;
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

const ANSWER_OPTION_VALUE_TYPES = [
  'valueCoding',
  'valueString',
  'valueInteger',
  'valueDate',
  'valueTime',
  'valueReference',
] as const;

/**
 * Returns true if an answer option is a coding (hand-written, LOINC, value set), rather than a plain value.
 * @param answerOption - The builder form answer option.
 * @returns True for a coded option.
 */
export function isCodedAnswerOption(answerOption: ExtendedQuestionnaireItemAnswerOption): boolean {
  return !answerOption.valueType || answerOption.valueType === 'valueCoding';
}

/**
 * Returns the text an answer option is shown with: a coding's display (or code), a reference's display (or
 * reference), or a plain value itself.
 * @param answerOption - The builder form answer option.
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
 * @param answerOption - The builder form answer option.
 * @returns The option's listed text, e.g. "a) Apple".
 */
export function getAnswerOptionDisplay(answerOption: ExtendedQuestionnaireItemAnswerOption): string {
  const label = getAnswerOptionLabel(answerOption);
  return answerOption.prefix?.trim() ? `${answerOption.prefix.trim()} ${label}` : label;
}

function isNonNegativeInteger(value: unknown): value is number | string {
  return value !== null && value !== undefined && value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0;
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
 * Applies exclusive answer options (questionnaire-optionExclusive) to a change of a repeating choice question's
 * answers, as Medplum's QuestionnaireForm does: selecting an exclusive option clears the other answers, and selecting
 * another option clears a selected exclusive one. Removing answers changes nothing else.
 * @param answerOptions - The question's answer options.
 * @param previousValues - The answer values before the change.
 * @param newValues - The answer values the change asks for.
 * @returns The answer values to keep.
 */
export function applyExclusiveOptions(
  answerOptions: ExtendedQuestionnaireItemAnswerOption[] | undefined,
  previousValues: any[],
  newValues: any[]
): any[] {
  const exclusiveKeys = (answerOptions ?? [])
    .filter((option) => option.exclusive)
    .map((option) => getChoiceValueKey(option.value));
  if (exclusiveKeys.length === 0) {
    return newValues;
  }
  const isExclusive = (value: any): boolean => exclusiveKeys.includes(getChoiceValueKey(value));
  const previousKeys = previousValues.map(getChoiceValueKey);
  const added = newValues.filter((value) => !previousKeys.includes(getChoiceValueKey(value)));
  const addedExclusive = added.find(isExclusive);
  if (addedExclusive !== undefined) {
    return [addedExclusive];
  }
  if (added.some((value) => !isExclusive(value))) {
    return newValues.filter((value) => !isExclusive(value));
  }
  return newValues;
}

function matchesChoiceValue(value: any, expected: any): boolean {
  const key = getChoiceValueKey(expected);
  return (Array.isArray(value) ? value : [value]).some((entry) => getChoiceValueKey(entry) === key);
}

/**
 * Converts a builder form answer option back into a FHIR answer option.
 * @param option - The builder form answer option.
 * @returns The FHIR answer option, or undefined when it is incomplete (a coding without code, an empty value).
 */
function toFhirAnswerOption(option: ExtendedQuestionnaireItemAnswerOption): QuestionnaireItemAnswerOption | undefined {
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
  if (!isCodedAnswerOption(answerOption)) {
    // A plain value has no code system to keep; a reference points at a resource and is not edited here.
    return answerOption.valueType !== 'valueReference';
  }
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
  if (answerOptions.some((option) => !toFhirAnswerOption(option))) {
    problems.push('Every answer option needs a code (or a value); incomplete options are not saved.');
  }
  const keys = answerOptions
    .filter((option) => toFhirAnswerOption(option))
    .map((option) => getChoiceValueKey(option.value));
  const duplicates = [
    ...new Set(
      keys.filter((key, index) => keys.indexOf(key) !== index).map((key) => key.split(':').slice(1).join(':'))
    ),
  ];
  if (duplicates.length > 0) {
    problems.push(`Answer options must be unique: ${duplicates.join(', ')}`);
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
  const valueType = ANSWER_OPTION_VALUE_TYPES.find((key) => key in answerOption);
  if (valueType && valueType !== 'valueCoding') {
    formData.valueType = valueType;
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
    // The whole coding, so fields the builder does not edit (e.g. version) are kept.
    formData.value = {
      ...answerOption.valueCoding,
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
  // The conditions are read from the item's definition: an answer copy (e.g. in a group repetition) is not updated
  // when its definition is edited.
  const definition: ExtendedQuestionnaireItem = getValueByPath(values, item.path) ?? item;

  // As in Medplum's QuestionnaireForm, an enableWhenExpression takes the place of the enableWhen conditions.
  const enableWhenExpression = getItemExpression(definition, QUESTIONNAIRE_ENABLED_WHEN_EXPRESSION_URL);
  if (enableWhenExpression) {
    try {
      return toJsBoolean(evaluateResponseExpression(values, enableWhenExpression));
    } catch {
      // An expression that cannot be evaluated falls back to the enableWhen conditions.
    }
  }

  const enableWhen = (definition.enableWhen || []).filter((condition) => condition?.question && condition.operator);
  const enableBehavior = definition.enableBehavior ?? 'all';

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
    // Numbers compare as numbers, also when typed into a text field as a string.
    const isNumeric =
      typeof answer === 'number' || ['integer', 'decimal', 'quantity'].includes(predicateQuestion?.type ?? '');

    // Comparisons only count given answers: an unanswered number is an empty string, not 0.
    const given = answers.filter((a) => !isEmptyAnswerValue(a.value));

    switch (operator) {
      case 'exists':
        return answer === false
          ? answers.some((a) => !hasAnswerValue(a.value))
          : answers.some((a) => hasAnswerValue(a.value));
      case 'empty':
        return answers.some((a) => !hasAnswerValue(a.value));
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
  if (isQuantityAnswer(value)) {
    return !isEmptyAnswerValue(value.value);
  }
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
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
 * Returns the number of an answer: a quantity's value, or the answer itself.
 * @param value - The answer value.
 * @returns The number (or the value to convert to one).
 */
function getNumericAnswer(value: any): any {
  return isQuantityAnswer(value) ? value.value : value;
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
    const groupHelpItem = findHelpItem(childItems);
    const newGroupAnswer = childItems
      .filter((childItem: QuestionnaireItem) => childItem !== groupHelpItem)
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
  rebuildAnswerItems(form, original ?? item);
}

/**
 * After an item's answers were added, removed or replaced, recomputes the items answered under them (a group's
 * repetitions, a question's follow-up items) with their paths, keeping what was answered in them.
 * @param form - The questionnaire form.
 * @param item - The item (or answer copy) whose answers changed.
 */
export function rebuildAnswerItems(form: QuestionnaireForm, item: ExtendedQuestionnaireItem): void {
  const definition: ExtendedQuestionnaireItem = getValueByPath(form.getValues(), item.path) ?? item;
  if (definition.type === 'group' || hasFollowUpItems(definition)) {
    form.setFieldValue('item', rebuildFormItems(form.getValues()));
  }
}

/**
 * Returns true if an item cannot be answered by the respondent: it, or a group or question it belongs to, is read only.
 * Read from the definitions, so it reflects the latest edits.
 * @param values - The current builder form values.
 * @param item - The builder form item (or answer copy).
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
 * Checks a required group (FHIR: it must be present in the response, so it needs at least one answered question;
 * a repeating group needs that in at least `minOccurs` repetitions).
 * @param values - The current form values.
 * @param item - The group (or its answer copy).
 * @returns The error message, or undefined when the group is not required or is answered.
 */
export function getRequiredGroupError(
  values: Record<string, any>,
  item: ExtendedQuestionnaireItem
): string | undefined {
  const definition: ExtendedQuestionnaireItem = getValueByPath(values, item.path) ?? item;
  if (definition.type !== 'group' || !definition.required || isReadOnlyFormItem(values, item)) {
    return undefined;
  }

  const minOccurs = definition.repeats ? Math.max(1, +definition.minOccurs || 1) : 1;
  const answered = ((item.answer ?? []) as unknown as ExtendedQuestionnaireItem[][])
    .filter(Array.isArray)
    .filter((repetition) => toSubmittedResponseItems(values, repetition).some(hasResponseAnswer)).length;
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
    if (
      original.hidden ||
      !evaluateEnableWhen(values, item) ||
      !isShownInMode(values, item, 'capture') ||
      original.type === 'display'
    ) {
      return;
    }

    if (original.type === 'group') {
      const groupError = getRequiredGroupError(values, item);
      if (groupError) {
        errors[`${item.answerPath}.answer`] = groupError;
      }
      for (const answerGroup of (item.answer ?? []) as unknown as ExtendedQuestionnaireItem[][]) {
        if (Array.isArray(answerGroup)) {
          answerGroup.forEach(visit);
        }
      }
      return;
    }

    const answersPath = `${item.answerPath}.answer`;
    const answers = item.answer ?? [];

    // A read-only question cannot be answered by the respondent, so it cannot be required of them.
    const readOnly = isReadOnlyFormItem(values, item);
    if (original.required && !readOnly && answers.every((answer) => isEmptyAnswerValue(answer.value))) {
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

/** The signature type Medplum's documentation uses for a signature-required questionnaire. */
export const DEFAULT_SIGNATURE_TYPE: Coding = {
  system: 'urn:iso-astm:E1762-95:2013',
  code: '1.2.840.10065.1.12.1.1',
  display: "Author's Signature",
};

/**
 * Returns the signature a questionnaire requires (questionnaire-signatureRequired on the Questionnaire itself, as
 * Medplum's QuestionnaireForm reads it), or undefined when none is required.
 * @param values - The builder form values (the questionnaire).
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

/**
 * Sets or removes the questionnaire's required signature.
 * @param form - The questionnaire form.
 * @param signatureType - The required signature type, or undefined for none.
 */
export function setRequiredSignatureType(form: QuestionnaireForm, signatureType: Coding | undefined): void {
  const others = ((form.getValues().extension ?? []) as Extension[]).filter(
    (ext) => ext.url !== QUESTIONNAIRE_SIGNATURE_REQUIRED_URL
  );
  const extension = signatureType
    ? [...others, { url: QUESTIONNAIRE_SIGNATURE_REQUIRED_URL, valueCodeableConcept: { coding: [signatureType] } }]
    : others;
  form.setFieldValue('extension', extension.length > 0 ? extension : undefined);
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
 * Returns true if an item is shown in a mode: its usage mode includes the mode and, for the `-non-empty` usage modes
 * when viewing answers, it is answered.
 * @param values - The current form values.
 * @param item - The item (or its answer copy).
 * @param mode - The mode the questionnaire is rendered in.
 * @returns True if the item is shown.
 */
export function isShownInMode(
  values: Record<string, any>,
  item: ExtendedQuestionnaireItem,
  mode: QuestionnaireMode
): boolean {
  const definition: ExtendedQuestionnaireItem = getValueByPath(values, item.path) ?? item;
  if (!isUsedInMode(definition.usageMode, mode)) {
    return false;
  }
  if (mode === 'display' && definition.usageMode?.endsWith('non-empty')) {
    return isAnsweredItem(values, item);
  }
  return true;
}

function isAnsweredItem(values: Record<string, any>, item: ExtendedQuestionnaireItem): boolean {
  const definition: ExtendedQuestionnaireItem = getValueByPath(values, item.path) ?? item;
  if (definition.type === 'group') {
    return ((item.answer ?? []) as unknown as ExtendedQuestionnaireItem[][])
      .filter(Array.isArray)
      .some((repetition) => toSubmittedResponseItems(values, repetition).some(hasResponseAnswer));
  }
  return (item.answer ?? []).some((answer) => !isEmptyAnswerValue(answer.value));
}

/**
 * Returns the questionnaire's design note (designNote on the Questionnaire itself).
 * @param values - The builder form values (the questionnaire).
 * @returns The design note, or an empty string.
 */
export function getQuestionnaireDesignNote(values: Record<string, any>): string {
  return (
    (values.extension as Extension[] | undefined)?.find((ext) => ext.url === EXTENSION_URLS.designNote)
      ?.valueMarkdown ?? ''
  );
}

/**
 * Sets or removes the questionnaire's design note.
 * @param form - The questionnaire form.
 * @param note - The design note; empty removes it.
 */
export function setQuestionnaireDesignNote(form: QuestionnaireForm, note: string): void {
  const others = ((form.getValues().extension ?? []) as Extension[]).filter(
    (ext) => ext.url !== EXTENSION_URLS.designNote
  );
  const extension = note.trim() ? [...others, { url: EXTENSION_URLS.designNote, valueMarkdown: note }] : others;
  form.setFieldValue('extension', extension.length > 0 ? extension : undefined);
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
 * Converts the answers in the builder form values into a FHIR QuestionnaireResponse. Display items, hidden items, items
 * disabled by enableWhen, unanswered questions and, in a questionnaire with pages, top-level items outside a page are
 * left out.
 * Each group repetition is a separate item with the group's linkId; follow-up items are answered under their answer.
 * @param values - The current form values (the questionnaire with its answers).
 * @param signature - The respondent's signature, when the questionnaire requires one.
 * @returns The QuestionnaireResponse.
 */
export function toFhirQuestionnaireResponse(values: Record<string, any>, signature?: Signature): QuestionnaireResponse {
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
    item: toSubmittedResponseItems(values, getRespondedItems(values.item ?? [])),
  };
}

function toSubmittedResponseItems(
  values: Record<string, any>,
  items: ExtendedQuestionnaireItem[]
): QuestionnaireResponseItem[] {
  return items.flatMap((item): QuestionnaireResponseItem[] => {
    const original: ExtendedQuestionnaireItem = getValueByPath(values, item.path) ?? item;
    // Items only shown when viewing answers are not filled in.
    if (original.hidden || !evaluateEnableWhen(values, item) || !isShownInMode(values, item, 'capture')) {
      return [];
    }

    // Display text is not answered, so it has no response item.
    if (original.type === 'display') {
      return [];
    }

    const base = { linkId: item.linkId, ...(original.text && { text: original.text }) };

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
      // Written with the value type of the option it was selected from.
      const option = findAnswerOption(item.answerOption, value);
      if (option && !isCodedAnswerOption(option)) {
        return { [option.valueType as string]: option.value };
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

const currentResponses = new WeakMap<Record<string, any>, QuestionnaireResponse>();

/**
 * Converts all answers in the builder form values into a QuestionnaireResponse, for expressions to evaluate against.
 * Unlike the submitted response, it has every question, including unanswered, hidden and disabled ones, as the
 * response Medplum's QuestionnaireForm evaluates expressions against does.
 * @param values - The current form values.
 * @returns The QuestionnaireResponse, the same one for the same values.
 */
function toCurrentQuestionnaireResponse(values: Record<string, any>): QuestionnaireResponse {
  let response = currentResponses.get(values);
  if (!response) {
    response = {
      resourceType: 'QuestionnaireResponse',
      status: 'in-progress',
      item: toCurrentResponseItems(values, values.item ?? []),
    };
    currentResponses.set(values, response);
  }
  return response;
}

function toCurrentResponseItems(
  values: Record<string, any>,
  items: ExtendedQuestionnaireItem[]
): QuestionnaireResponseItem[] {
  return items.flatMap((item): QuestionnaireResponseItem[] => {
    const original: ExtendedQuestionnaireItem = getValueByPath(values, item.path) ?? item;
    if (original.type === 'display') {
      return [];
    }

    const base = { linkId: item.linkId, ...(original.text && { text: original.text }) };

    if (original.type === 'group') {
      return ((item.answer ?? []) as unknown as ExtendedQuestionnaireItem[][])
        .filter(Array.isArray)
        .map((answerGroup) => ({ ...base, item: toCurrentResponseItems(values, answerGroup) }));
    }

    const answers = (item.answer ?? [])
      .filter((answer) => !isEmptyAnswerValue(answer.value))
      .map((answer) => {
        const followUpItems = toCurrentResponseItems(values, answer.item ?? []);
        return {
          ...toFhirResponseAnswer(original, answer.value),
          ...(followUpItems.length > 0 && { item: followUpItems }),
        };
      });

    return [{ ...base, ...(answers.length > 0 && { answer: answers }) }];
  });
}

/**
 * Evaluates a FHIRPath expression against the current answers, as Medplum's QuestionnaireForm does: on the
 * QuestionnaireResponse, which is also `%resource`.
 * @param values - The current form values.
 * @param expression - The FHIRPath expression.
 * @returns The result.
 */
function evaluateResponseExpression(values: Record<string, any>, expression: string): TypedValue[] {
  const response = toTypedValue(toCurrentQuestionnaireResponse(values));
  return evalFhirPathTyped(expression, [response], { '%resource': response });
}

/** An answer calculated by its question's calculatedExpression, or why it could not be. */
export interface CalculatedAnswer {
  /** The form path of the answer value. */
  readonly fieldPath: string;
  /** The calculated value, empty when the expression has no result. */
  readonly value?: any;
  readonly error?: string;
}

/**
 * Calculates the answers of questions with a calculatedExpression (sdc-questionnaire-calculatedExpression) from the
 * current answers, as Medplum's QuestionnaireForm does. An expression without a result clears the answer.
 * @param values - The current form values.
 * @returns The calculated answers, one per answered copy of each such question.
 */
export function getCalculatedAnswers(values: Record<string, any>): CalculatedAnswer[] {
  const result: CalculatedAnswer[] = [];

  const visit = (item: ExtendedQuestionnaireItem): void => {
    const original: ExtendedQuestionnaireItem = getValueByPath(values, item.path) ?? item;
    if (original.type === 'display') {
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

    const expression = getItemExpression(original, QUESTIONNAIRE_CALCULATED_EXPRESSION_URL);
    if (expression) {
      result.push(calculateAnswer(values, item, original, expression));
    }
    for (const answer of item.answer ?? []) {
      answer.item?.forEach(visit);
    }
  };

  (values.item ?? []).forEach(visit);
  return result;
}

function calculateAnswer(
  values: Record<string, any>,
  item: ExtendedQuestionnaireItem,
  original: ExtendedQuestionnaireItem,
  expression: string
): CalculatedAnswer {
  const fieldPath = `${item.answerPath}.answer.0.value`;
  let calculated: TypedValue[];
  try {
    calculated = evaluateResponseExpression(values, expression);
  } catch (err) {
    return { fieldPath, error: `Expression evaluation failed: ${normalizeErrorString(err)}` };
  }

  if (calculated.length === 0) {
    return { fieldPath, value: null };
  }
  const answer = typedValueToResponseItem({ linkId: item.linkId, type: original.type }, calculated[0]);
  if (!answer) {
    return { fieldPath, error: `The expression's result is a ${calculated[0].type}, not a ${original.type}` };
  }
  return { fieldPath, value: fromQuestionnaireResponseItemAnswer([answer], original.type)[0].value };
}

/**
 * Converts a FHIR dateTime into the local date and time of a `datetime-local` input. Builder values are local times,
 * saved as UTC instants (toISOString), so they must be read back in local time or they shift by the time zone offset.
 * @param value - The FHIR dateTime.
 * @returns The local date and time (`YYYY-MM-DDTHH:mm`, with seconds when not zero), or the value when it has no time.
 */
export function toLocalDateTime(value: string | undefined): string | undefined {
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
