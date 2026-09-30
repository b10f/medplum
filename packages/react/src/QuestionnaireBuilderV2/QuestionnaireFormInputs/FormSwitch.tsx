// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Switch } from '@mantine/core';
import type { JSX } from 'react';
import type { QuestionnaireForm } from '../../QuestionnaireFormV2/QuestionnaireFormContext';

export interface FormSwitchProps {
  readonly form: QuestionnaireForm;
  readonly label: string;
  readonly description?: string;
  readonly context: string;
  readonly disabled?: boolean;
  readonly onChange?: (value: boolean) => void;
}

export function FormSwitch(props: FormSwitchProps): JSX.Element {
  const { form, label, description, context, disabled = false, onChange } = props;

  return (
    <Switch
      key={context}
      label={label}
      description={description}
      disabled={disabled}
      {...form.getInputProps(context, { withError: true, withFocus: true, type: 'checkbox' })}
      onChange={(e) => {
        const checked = e.currentTarget.checked;
        form.setFieldValue(context, checked);
        onChange?.(checked);
      }}
    />
  );
}
