// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Text } from '@mantine/core';
import type { JSX } from 'react';
import type { ExtendedQuestionnaireItem } from './QuestionnaireFormV2.utils';
import { getAttachedText } from './QuestionnaireRenderer.utils';

/**
 * A question's lower and upper bound labels (e.g. "Strongly disagree" / "Strongly agree"), at either end below its
 * answer, and its prompt below them.
 * @param props - The QuestionnaireRendererAttachedTexts props.
 * @param props.item - The question.
 * @returns The texts, or null without any.
 */
export function QuestionnaireRendererAttachedTexts(props: {
  readonly item: ExtendedQuestionnaireItem;
}): JSX.Element | null {
  const { item } = props;
  const lower = getAttachedText(item, 'lower');
  const upper = getAttachedText(item, 'upper');
  const prompt = getAttachedText(item, 'prompt');
  if (!lower && !upper && !prompt) {
    return null;
  }
  return (
    <>
      {(lower || upper) && (
        <Group justify="space-between" gap="md" wrap="nowrap">
          <Text size="sm" c="dimmed">
            {lower}
          </Text>
          <Text size="sm" c="dimmed" ta="right">
            {upper}
          </Text>
        </Group>
      )}
      {prompt && (
        <Text size="sm" c="dimmed">
          {prompt}
        </Text>
      )}
    </>
  );
}
