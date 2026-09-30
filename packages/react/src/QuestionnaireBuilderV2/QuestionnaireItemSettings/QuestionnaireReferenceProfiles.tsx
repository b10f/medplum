// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Code, Group, Stack, Text } from '@mantine/core';
import type { StructureDefinition } from '@medplum/fhirtypes';
import { IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { getValueByPath } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { ResourceInput } from '../../ResourceInput/ResourceInput';
import type { QuestionnaireItemFieldProps } from './QuestionnaireItemSettings.utils';

/**
 * The profiles a reference question's answer must conform to (questionnaire-referenceProfile), picked from the
 * project's StructureDefinitions and saved by their canonical URL.
 * @param props - The QuestionnaireReferenceTypes React props.
 * @returns The QuestionnaireReferenceProfiles React node.
 */
export function QuestionnaireReferenceProfiles(props: QuestionnaireItemFieldProps): JSX.Element {
  const { form, path, disabled } = props;
  const context = `${path}.referenceProfile`;
  const profiles: string[] = getValueByPath(form.getValues(), context) ?? [];
  // A new key clears the picker after each pick.
  const [pickerKey, setPickerKey] = useState(0);

  return (
    <Stack gap="xs" mt="xs">
      <Text size="sm" fw={500}>
        Profiles
      </Text>
      <Text size="xs" c="dimmed">
        The answer must conform to one of these profiles. With none, any resource of the types above can be picked.
      </Text>
      {profiles.map((profile, index) => (
        <Group key={profile} gap="xs" wrap="nowrap">
          <Code flex={1}>{profile}</Code>
          <ActionIcon
            variant="filled"
            color="red"
            aria-label="Remove profile"
            disabled={disabled}
            onClick={() =>
              form.setFieldValue(
                context,
                profiles.filter((_, i) => i !== index)
              )
            }
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      ))}
      <ResourceInput<StructureDefinition>
        key={pickerKey}
        resourceType="StructureDefinition"
        name="reference-profile"
        placeholder="Add a profile"
        disabled={disabled}
        onChange={(structureDefinition) => {
          if (structureDefinition?.url && !profiles.includes(structureDefinition.url)) {
            form.setFieldValue(context, [...profiles, structureDefinition.url]);
          }
          setPickerKey((key) => key + 1);
        }}
      />
    </Stack>
  );
}
