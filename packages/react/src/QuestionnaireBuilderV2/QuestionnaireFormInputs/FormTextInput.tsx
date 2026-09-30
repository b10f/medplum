// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { TextInput } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import type { QuestionnaireForm } from '../../QuestionnaireFormV2/QuestionnaireFormContext';
import { useDebouncedFormValue } from './useDebouncedFormValue';

export interface FormTextInputProps {
  readonly form: QuestionnaireForm;
  readonly label: string;
  readonly description?: string;
  readonly context: string;
  readonly type?: 'text' | 'number' | 'date' | 'time' | 'datetime-local' | 'email' | 'url';
  readonly placeholder?: string;
  /** An error about the value; defaults to the form's error for it. */
  readonly error?: ReactNode;
  readonly step?: string;
  readonly min?: string;
  readonly max?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly onChange?: (value: string) => void;
}

export function FormTextInput(props: FormTextInputProps): JSX.Element {
  const {
    form,
    label,
    description,
    placeholder,
    error,
    type = 'text',
    step = '1',
    min = '1',
    max,
    context,
    required = false,
    disabled = false,
    onChange,
  } = props;
  const { formValue, setValue } = useDebouncedFormValue(form, context, onChange);
  const hasRange = type === 'number' || type === 'date' || type === 'time' || type === 'datetime-local';

  return (
    <TextInput
      key={context}
      label={label}
      description={description}
      placeholder={placeholder}
      type={type}
      step={type === 'number' ? step : undefined}
      min={hasRange ? min : undefined}
      max={hasRange ? max : undefined}
      disabled={disabled}
      withAsterisk={required}
      defaultValue={formValue}
      error={error ?? form.errors[context]}
      onChange={(e) => setValue(e.currentTarget.value)}
    />
  );
}
