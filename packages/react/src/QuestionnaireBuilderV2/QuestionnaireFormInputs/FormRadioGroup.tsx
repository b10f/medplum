// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Radio, Stack } from '@mantine/core';
import type { JSX } from 'react';
import type { QuestionnaireForm } from '../../QuestionnaireFormV2/QuestionnaireFormContext';
import { getValueByPath } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';

export interface FormRadioGroupProps {
  readonly form: QuestionnaireForm;
  readonly label: string;
  readonly description?: string;
  readonly context: string;
  readonly options: { value: string; label: string }[];
  /** The option shown as selected while the form has no value. */
  readonly defaultValue?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly onChange?: (value: string) => void;
}

export function FormRadioGroup(props: FormRadioGroupProps): JSX.Element {
  const {
    form,
    label,
    description,
    context,
    options,
    defaultValue,
    required = false,
    disabled = false,
    onChange,
  } = props;
  const { defaultValue: _formDefaultValue, ...inputProps } = form.getInputProps(context, {
    withError: true,
    withFocus: true,
  });
  // An uncontrolled form gives no `value`; read the current one, so the default applies only while there is none.
  const value = getValueByPath(form.getValues(), context);

  return (
    <Radio.Group
      key={context}
      label={label}
      description={description}
      withAsterisk={required}
      {...inputProps}
      value={value || defaultValue || null}
      onChange={(value) => {
        form.setFieldValue(context, value);
        onChange?.(value);
      }}
    >
      <Stack gap="xs" mt="xs">
        {options.map((option) => (
          <Radio key={`${context}-${option.value}`} value={option.value} label={option.label} disabled={disabled} />
        ))}
      </Stack>
    </Radio.Group>
  );
}
