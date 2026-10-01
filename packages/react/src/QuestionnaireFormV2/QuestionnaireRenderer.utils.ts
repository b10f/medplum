// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { QuestionnaireResponseItem, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';
import { applyOptionExclusive } from '@medplum/react-hooks';
import type { QuestionnaireForm } from './QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem, QuestionDisplayText } from './QuestionnaireFormV2.utils';
import {
  getChoiceValueKey,
  getValueByPath,
  isChoiceItemType,
  isQuestionItem,
  toFhirQuestionnaireItem,
} from './QuestionnaireFormV2.utils';
import { getAnswerValue, toDraftAnswer, validateAnswerValue } from './QuestionnaireResponse.utils';

/**
 * Returns the answers at a response path of the draft response.
 * @param responseForm - The draft response form.
 * @param answersPath - The response path of a question's answers.
 * @returns The answers.
 */
export function getAnswers(responseForm: QuestionnaireForm, answersPath: string): QuestionnaireResponseItemAnswer[] {
  return getValueByPath(responseForm.getValues(), answersPath) ?? [];
}

/**
 * Adds a repetition of a group, after its last one. useSyncedResponse fills it with the group's items.
 * @param responseForm - The draft response form.
 * @param context - The response path of the response items the group is answered in.
 * @param linkId - The group's linkId.
 */
export function addRepetition(responseForm: QuestionnaireForm, context: string, linkId: string): void {
  const responseItems: QuestionnaireResponseItem[] = getValueByPath(responseForm.getValues(), context) ?? [];
  const lastRepetition = responseItems.map((responseItem) => responseItem.linkId).lastIndexOf(linkId);
  responseForm.insertListItem(context, { linkId }, lastRepetition + 1);
}

/**
 * Writes an answer value and shows its constraint error (length, regex, range) right away. The answer keeps its
 * follow-up items.
 * @param responseForm - The draft response form.
 * @param item - The question.
 * @param answerPath - The response path of the answer.
 * @param value - The new value.
 * @param ignoreValidation - Skips validation when true.
 */
export function setAnswerValue(
  responseForm: QuestionnaireForm,
  item: ExtendedQuestionnaireItem,
  answerPath: string,
  value: any,
  ignoreValidation?: boolean
): void {
  const existing: QuestionnaireResponseItemAnswer | undefined = getValueByPath(responseForm.getValues(), answerPath);
  const answer = { ...(existing?.item && { item: existing.item }), ...toDraftAnswer(item, value) };
  responseForm.setFieldValue(answerPath, answer);
  const message = ignoreValidation ? undefined : validateAnswerValue(item, getAnswerValue(item, answer));
  if (message) {
    responseForm.setFieldError(answerPath, message);
  }
}

/**
 * Sets the selected options (or typed answers) of a repeating choice question. Answers that stay selected keep their
 * follow-up items. As in Medplum's QuestionnaireForm, "None of the above" and other exclusive options clear the other
 * answers, and the other way round (questionnaire-optionExclusive).
 * @param responseForm - The draft response form.
 * @param item - The question.
 * @param answersPath - The response path of its answers.
 * @param values - The selected values.
 */
export function setChoiceAnswers(
  responseForm: QuestionnaireForm,
  item: ExtendedQuestionnaireItem,
  answersPath: string,
  values: any[]
): void {
  const answers = getAnswers(responseForm, answersPath);
  const requested = values.map(
    (value) =>
      answers.find((answer) => getChoiceValueKey(getAnswerValue(item, answer)) === getChoiceValueKey(value)) ??
      toDraftAnswer(item, value)
  );
  responseForm.setFieldValue(answersPath, applyOptionExclusive(toFhirQuestionnaireItem(item), answers, requested));
}

/**
 * Returns the text of a display item that belongs to a question by its item control (prompt, unit, lower, upper,
 * flyover): shown with the question, rather than as an item of its own.
 * @param item - The question.
 * @param code - The item control code.
 * @returns The text, or undefined.
 */
export function getAttachedText(item: ExtendedQuestionnaireItem, code: QuestionDisplayText): string | undefined {
  return item.displayTexts?.[code] || undefined;
}

/**
 * A choice table (`table`, `atable` or `htable` item control) has only choice questions with answer options: their
 * answers are picked in a grid of questions and options.
 * @param group - The group.
 * @returns True if the group is rendered as a choice table.
 */
export function isChoiceTable(group: ExtendedQuestionnaireItem): boolean {
  const code = group.itemControl?.code;
  return (
    (code === 'table' || code === 'atable' || code === 'htable') &&
    (group.item ?? []).length > 0 &&
    group.item.every((child) => isChoiceItemType(child.type) && (child.answerOption ?? []).length > 0)
  );
}

/**
 * A group table (`gtable` item control) has only questions: each question is a column, each repetition a row.
 * @param group - The group.
 * @returns True if the group is rendered as a table.
 */
export function isGroupTable(group: ExtendedQuestionnaireItem): boolean {
  return group.itemControl?.code === 'gtable' && (group.item ?? []).length > 0 && group.item.every(isQuestionItem);
}
