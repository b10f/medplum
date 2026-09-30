// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Divider, Group } from '@mantine/core';
import { IconHelp, IconInfoCircle, IconLock } from '@tabler/icons-react';
import type { JSX } from 'react';
import type { ExtendedQuestionnaireItem } from './QuestionnaireFormV2.utils';
import { QuestionnaireRendererLabel } from './QuestionnaireRendererLabel';

/**
 * Display text, styled by its display category (questionnaire-displayCategory): instructions and security notices as
 * boxes, help as muted text; other text as before.
 * @param props - The QuestionnaireRendererDisplay props.
 * @param props.item - The display item.
 * @returns The QuestionnaireRendererDisplay React node.
 */
export function QuestionnaireRendererDisplay(props: { readonly item: ExtendedQuestionnaireItem }): JSX.Element {
  const { item } = props;
  const title = <QuestionnaireRendererLabel item={item} />;

  switch (item.displayCategory?.code) {
    case 'instructions':
      return (
        <Alert variant="light" color="blue" icon={<IconInfoCircle size={20} />}>
          {title}
        </Alert>
      );
    case 'security':
      return (
        <Alert variant="light" color="orange" icon={<IconLock size={20} />}>
          {title}
        </Alert>
      );
    case 'help':
      return (
        <Group gap="xs" wrap="nowrap" c="dimmed" fz="sm">
          <IconHelp size={16} />
          {title}
        </Group>
      );
    default:
      return (
        <>
          {title}
          <Divider my="md" />
        </>
      );
  }
}
