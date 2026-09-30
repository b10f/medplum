// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Checkbox, Group, Radio, Stack, Switch } from '@mantine/core';
import type { JSX } from 'react';
import type { QuestionnaireRendererItemProps } from './QuestionnaireRendererItem';
import { getAnswerLabel } from './QuestionnaireRendererItem.utils';
import { useAnswer } from './useAnswer';

export function QuestionnaireRendererBooleanInput(props: QuestionnaireRendererItemProps): JSX.Element {
  const { item, readOnly } = props;
  const { value, error, setValue } = useAnswer(props);
  const labelProps = getAnswerLabel(props);

  if (item.itemControl?.code === 'check-box') {
    return (
      <Stack gap="xs">
        {labelProps.label}
        <Checkbox
          aria-label={labelProps['aria-label'] ?? item.text}
          disabled={readOnly}
          checked={value === true}
          onChange={(e) => setValue(e.currentTarget.checked)}
        />
      </Stack>
    );
  }

  if (item.itemControl?.code === 'radio-button') {
    // Yes and No as buttons: until one is picked, the question is unanswered.
    return (
      <Radio.Group
        {...labelProps}
        value={typeof value === 'boolean' ? String(value) : null}
        error={error}
        onChange={(picked) => setValue(picked === 'true')}
      >
        <Group gap="xl" mt="xs">
          <Radio value="true" label="Yes" disabled={readOnly} />
          <Radio value="false" label="No" disabled={readOnly} />
        </Group>
      </Radio.Group>
    );
  }

  return (
    <Group justify="space-between">
      {labelProps.label}
      <Switch
        aria-label={labelProps['aria-label']}
        disabled={readOnly}
        checked={Boolean(value)}
        onChange={(e) => setValue(e.currentTarget.checked)}
      />
    </Group>
  );
}
