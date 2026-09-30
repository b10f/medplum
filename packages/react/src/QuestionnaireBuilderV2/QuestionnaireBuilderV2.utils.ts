// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { generateId } from '@medplum/core';
import type {
  Coding,
  Extension,
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
  ValueSet,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import { QUESTIONNAIRE_SIGNATURE_REQUIRED_URL } from '@medplum/react-hooks';
import type { QuestionnaireForm } from '../QuestionnaireFormV2/QuestionnaireFormContext';
import type {
  ExtendedQuestionnaireItem,
  ExtendedQuestionnaireItemAnswerOption,
  ExtendedQuestionnaireItemEnableWhen,
} from '../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import {
  EXTENSION_URLS,
  findFormItemByLinkId,
  FOOTER_ITEM_CONTROL,
  getChoiceValueKey,
  hasFollowUpItems,
  HEADER_ITEM_CONTROL,
  isCodedAnswerOption,
  isHeaderOrFooterItem,
  isPageItem,
  rebuildFormItems,
  toFhirAnswerOption,
} from '../QuestionnaireFormV2/QuestionnaireFormV2.utils';

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

/** The signature type Medplum's documentation uses for a signature-required questionnaire. */
export const DEFAULT_SIGNATURE_TYPE: Coding = {
  system: 'urn:iso-astm:E1762-95:2013',
  code: '1.2.840.10065.1.12.1.1',
  display: "Author's Signature",
};

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
