// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Button, Group, Stack, Text } from '@mantine/core';
import type { ResourceType } from '@medplum/fhirtypes';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { getReferenceFilterError, getValueByPath } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { ResourceTypeInput } from '../../ResourceTypeInput/ResourceTypeInput';
import { FormTextInput } from '../QuestionnaireFormInputs/FormTextInput';
import type { QuestionnaireItemFieldProps } from './QuestionnaireItemSettings.utils';
import { QuestionnaireReferenceProfiles } from './QuestionnaireReferenceProfiles';

/**
 * The resource types a reference question can point to, one ResourceTypeInput each, as in Medplum's
 * QuestionnaireBuilder. With none, any resource can be referenced.
 * @param props - The QuestionnaireReferenceTypes React props.
 * @returns The QuestionnaireReferenceTypes React node.
 */
export function QuestionnaireReferenceTypes(props: QuestionnaireItemFieldProps): JSX.Element {
  const { form, path, disabled } = props;
  const context = `${path}.referenceResource`;
  const targetTypes: string[] = getValueByPath(form.getValues(), context) ?? [];
  const setTargetTypes = (types: string[]): void => form.setFieldValue(context, types);

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Resource types
      </Text>
      <Text size="xs" c="dimmed">
        The kinds of resource the answer can point to. With none, any resource can be picked.
      </Text>
      {targetTypes.map((targetType, index) => (
        <Group key={`${index}-${targetType}`} gap="xs" wrap="nowrap">
          <Box flex={1}>
            <ResourceTypeInput
              name={`resourceType-${index}`}
              placeholder="Resource Type"
              defaultValue={(targetType || undefined) as ResourceType | undefined}
              disabled={disabled}
              onChange={(value) => setTargetTypes(targetTypes.map((type, i) => (i === index ? (value ?? '') : type)))}
            />
          </Box>
          <ActionIcon
            variant="filled"
            color="red"
            size="input-sm"
            aria-label="Remove resource type"
            disabled={disabled}
            onClick={() => setTargetTypes(targetTypes.filter((_, i) => i !== index))}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      ))}
      <Group>
        <Button
          variant="default"
          size="xs"
          leftSection={<IconPlus size={16} />}
          disabled={disabled}
          onClick={() => setTargetTypes([...targetTypes, ''])}
        >
          Add resource type
        </Button>
      </Group>
      <QuestionnaireReferenceProfiles form={form} path={path} disabled={disabled} />
      <FormTextInput
        form={form}
        label="Search filter"
        description="FHIR search parameters the answer is searched with, e.g. active=true. $subj and $encounter stand for the form's subject and encounter."
        placeholder="name=value&name=value"
        context={`${path}.referenceFilter`}
        error={getReferenceFilterError(getValueByPath(form.getValues(), `${path}.referenceFilter`))}
        disabled={disabled}
      />
    </Stack>
  );
}
