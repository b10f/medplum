// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { TextInputProps } from '@mantine/core';
import { Text } from '@mantine/core';
import type { ValueSetExpansionContains } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import type { ExtendedQuestionnaireItem, ExtendedQuestionnaireItemAnswerOption } from '../QuestionnaireFormV2.utils';
import {
  findAnswerOption,
  getAnswerOptionDisplay,
  getAnswerOptionLabel,
  getChoiceValueKey,
} from '../QuestionnaireFormV2.utils';
import classes from '../QuestionnaireRenderer.module.css';
import { QuestionnaireRendererLabel } from '../QuestionnaireRendererLabel';
import type { QuestionnaireRendererItemProps } from './QuestionnaireRendererItem';

/**
 * Shows a unit at the end of a text field, e.g. "kg".
 * @param unit - The unit.
 * @returns The text field's right section props, or none without a unit.
 */
export function getUnitSection(
  unit: string | undefined
): Pick<TextInputProps, 'rightSection' | 'rightSectionWidth' | 'rightSectionProps'> {
  if (!unit) {
    return {};
  }
  return {
    rightSection: <Text size="sm">{unit}</Text>,
    rightSectionWidth: 'auto',
    rightSectionProps: { style: { paddingInline: 'var(--mantine-spacing-sm)' } },
  };
}

/**
 * The question label of an answer input, or none for an inline input.
 * @param props - The rendered answer props.
 * @returns The label and the input's accessible name.
 */
export function getAnswerLabel(props: QuestionnaireRendererItemProps): {
  label?: JSX.Element;
  labelProps?: { className: string };
  'aria-label'?: string;
} {
  const { item, repeat, inline } = props;
  if (inline) {
    return { 'aria-label': item.text };
  }
  return {
    label: <QuestionnaireRendererLabel item={item} repeat={repeat} />,
    // Full width, so the question's buttons sit on the right as in a group header.
    labelProps: { className: classes.answerLabel },
  };
}

/** The option of an open-choice question that lets the respondent type their own answer. */
export const OTHER_OPTION = '__other__';

/**
 * Returns the most decimal places a decimal or quantity answer may have (maxDecimalPlaces).
 * @param item - The question.
 * @returns The decimal places, or undefined for no limit.
 */
export function getDecimalPlaces(item: ExtendedQuestionnaireItem): number | undefined {
  const places = item.maxDecimalPlaces;
  return places === null || places === undefined || (places as any) === '' ? undefined : Number(places);
}

/**
 * Converts a choice answer value into the value set entry a value set input holds.
 * @param value - The answer value: a coding, or a plain value.
 * @returns The value set entry.
 */
export function toValueSetContains(value: any): ValueSetExpansionContains {
  if (value && typeof value === 'object') {
    return { system: value.system, code: value.code, display: value.display };
  }
  return { code: String(value), display: String(value) };
}

/**
 * Returns true if an answer was typed by the respondent (an open-choice answer that is none of the options).
 * @param answerOption - The item's answer options.
 * @param value - The answer value.
 * @returns True for a typed answer.
 */
export function isTypedAnswer(answerOption: ExtendedQuestionnaireItemAnswerOption[], value: any): boolean {
  return typeof value === 'string' && value !== '' && !findAnswerOption(answerOption, value);
}

/**
 * Returns the value of the answer option a select option stands for.
 * @param answerOption - The item's answer options.
 * @param key - The select option's value (see toOptionData).
 * @returns The option's value, or an empty answer when none matches.
 */
export function findOptionValue(answerOption: ExtendedQuestionnaireItemAnswerOption[], key: string | null): any {
  return answerOption.find((option) => getChoiceValueKey(option.value) === key)?.value ?? '';
}

/**
 * The text of a choice answer in a free-text field: the selected option's label, or the typed answer.
 * @param answerOption - The item's answer options.
 * @param value - The answer value.
 * @returns The text.
 */
export function toChoiceText(answerOption: ExtendedQuestionnaireItemAnswerOption[], value: any): string {
  const option = findAnswerOption(answerOption, value);
  if (option) {
    return getAnswerOptionLabel(option);
  }
  return typeof value === 'string' ? value : String(value?.display ?? value?.code ?? '');
}

/**
 * The answer for text entered in a free-text field: the option with that label, or the text itself.
 * @param answerOption - The item's answer options.
 * @param text - The text.
 * @returns The answer value.
 */
export function fromChoiceText(answerOption: ExtendedQuestionnaireItemAnswerOption[], text: string): any {
  return answerOption.find((option) => getAnswerOptionLabel(option) === text)?.value ?? text;
}

/**
 * Converts answer options into the options of a select: keyed by their value, listed with their prefix and label.
 * @param answerOption - The item's answer options.
 * @returns The select options.
 */
export function toOptionData(
  answerOption: ExtendedQuestionnaireItemAnswerOption[]
): { value: string; label: string }[] {
  return answerOption.map((option) => ({
    value: getChoiceValueKey(option.value),
    label: getAnswerOptionDisplay(option),
  }));
}
