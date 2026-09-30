// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Group, Stack, Text } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useQuestionnaireResponseFormContext } from './QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem } from './QuestionnaireFormV2.utils';
import { QuestionnaireRendererItemArray } from './QuestionnaireRendererItemArray';
import { QuestionnaireRendererRequiredGroupError } from './QuestionnaireRendererRequiredGroupError';
import { getResponseItemIndexes } from './QuestionnaireResponse.utils';

export interface QuestionnaireRendererPageProps {
  readonly page: ExtendedQuestionnaireItem;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly ignoreValidation?: boolean;
}

/**
 * A page's items, rendered without the group header and border: the stepper shows the page title.
 * @param props - The QuestionnaireRendererPage props.
 * @returns The QuestionnaireRendererPage React node.
 */
export function QuestionnaireRendererPage(props: QuestionnaireRendererPageProps): JSX.Element {
  const { page, selectedItem, ignoreValidation } = props;
  const responseForm = useQuestionnaireResponseFormContext();
  const repetitions = getResponseItemIndexes(responseForm.getValues(), 'item', page.linkId);

  return (
    <Stack gap="md" mt="md">
      <QuestionnaireRendererRequiredGroupError item={page} context="item" />
      {/* The stepper shows the page title; the page's guidance goes above its items. */}
      {(page.help || page.supportLink) && (
        <Stack gap={4}>
          {page.help && (
            <Text size="sm" c="dimmed">
              {page.help}
            </Text>
          )}
          {page.supportLink && (
            <Anchor href={page.supportLink} target="_blank" rel="noopener noreferrer" size="sm">
              <Group gap={4}>
                More information
                <IconExternalLink size={14} />
              </Group>
            </Anchor>
          )}
        </Stack>
      )}
      {repetitions.map((repetition) => (
        <QuestionnaireRendererItemArray
          key={repetition}
          items={page.item ?? []}
          context={`item.${repetition}.item`}
          selectedItem={selectedItem}
          ignoreValidation={ignoreValidation}
        />
      ))}
    </Stack>
  );
}
