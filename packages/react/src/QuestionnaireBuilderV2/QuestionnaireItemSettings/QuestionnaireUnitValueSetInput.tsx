// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Code, Group, Input, Stack, Text } from '@mantine/core';
import type { ValueSet } from '@medplum/fhirtypes';
import { IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { getValueByPath } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { ResourceInput } from '../../ResourceInput/ResourceInput';
import type { QuestionnaireItemFieldProps } from './QuestionnaireItemSettings.utils';

/**
 * A value set a quantity's unit is picked from (questionnaire-unitValueSet), e.g. ucum-vitals-common; it is used
 * instead of the allowed units.
 * @param props - The QuestionnaireUnitValueSetInput React props.
 * @returns The QuestionnaireUnitValueSetInput React node.
 */
export function QuestionnaireUnitValueSetInput(props: QuestionnaireItemFieldProps): JSX.Element {
  const { form, path, disabled } = props;
  const context = `${path}.unitValueSet`;
  const unitValueSet: string | null = getValueByPath(form.getValues(), context);

  if (unitValueSet) {
    return (
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Units from a value set
        </Text>
        <Group gap="xs" wrap="nowrap">
          <Code flex={1}>{unitValueSet}</Code>
          <ActionIcon
            variant="filled"
            color="red"
            aria-label="Remove unit value set"
            disabled={disabled}
            onClick={() => form.setFieldValue(context, null)}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
        <Text size="xs" c="dimmed">
          The respondent searches this value set for the unit, instead of the allowed units.
        </Text>
      </Stack>
    );
  }

  return (
    <Input.Wrapper
      label="Units from a value set"
      description="Instead of allowed units, the respondent searches a value set, e.g. ucum-vitals-common."
    >
      <ResourceInput<ValueSet>
        resourceType="ValueSet"
        name="unit-value-set"
        placeholder="Search value sets"
        disabled={disabled}
        onChange={(valueSet) => {
          if (valueSet?.url) {
            form.setFieldValue(context, valueSet.url);
          }
        }}
      />
    </Input.Wrapper>
  );
}
