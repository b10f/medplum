// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Group } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import type { QuestionnaireForm } from '../../QuestionnaireFormV2/QuestionnaireFormContext';
import { getValueByPath } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';

export interface FormFlatCollectionProps {
  readonly form: QuestionnaireForm;
  readonly context: string;
  readonly add: () => void;
  /** Shows the add button; false for a single value. */
  readonly addable?: boolean;
  readonly canAdd?: () => boolean;
  readonly disabled?: boolean;
  readonly children: (index: number) => ReactNode;
}

export function FormFlatCollection(props: FormFlatCollectionProps): JSX.Element {
  const { form, context, add, addable = true, canAdd = () => true, disabled = false, children } = props;
  const fields: any[] = getValueByPath(form.getValues(), context) || [];

  return (
    <>
      {fields.map((item: any, index: number) => (
        // The buttons line up with the (last) input: same height, bottom aligned.
        <Group key={item?.id ? `${context}-${item.id}` : `${context}-${index}`} align="flex-end" gap="xs">
          <Box flex={1}>{children(index)}</Box>
          <Group gap="xs">
            {addable && index === fields.length - 1 && (
              <ActionIcon
                variant="outline"
                size="input-sm"
                aria-label="Add"
                onClick={add}
                disabled={!canAdd() || disabled}
              >
                <IconPlus size={16} />
              </ActionIcon>
            )}
            {fields.length > 1 && (
              <ActionIcon
                variant="filled"
                color="red"
                size="input-sm"
                aria-label="Remove"
                onClick={() => form.removeListItem(context, index)}
                disabled={disabled}
              >
                <IconTrash size={16} />
              </ActionIcon>
            )}
          </Group>
        </Group>
      ))}
    </>
  );
}
