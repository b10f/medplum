// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { TextInputProps } from '@mantine/core';
import { Text } from '@mantine/core';
import type { JSX } from 'react';
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

export const OTHER_OPTION = '__other__';
