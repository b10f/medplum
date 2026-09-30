// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Textarea } from '@mantine/core';
import type { JSX } from 'react';
import type { QuestionnaireForm } from '../../QuestionnaireFormV2/QuestionnaireFormContext';
import { useDebouncedFormValue } from './useDebouncedFormValue';

export interface FormTextareaProps {
  readonly form: QuestionnaireForm;
  readonly label: string;
  readonly description?: string;
  readonly context: string;
  readonly placeholder?: string;
  readonly rows?: number;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly onChange?: (value: string) => void;
}

export function FormTextarea(props: FormTextareaProps): JSX.Element {
  const {
    form,
    label,
    description,
    placeholder,
    context,
    rows = 3,
    required = false,
    disabled = false,
    onChange,
  } = props;
  const { formValue, setValue } = useDebouncedFormValue(form, context, onChange);

  return (
    <Textarea
      key={context}
      label={label}
      description={description}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      withAsterisk={required}
      defaultValue={formValue}
      error={form.errors[context]}
      onChange={(e) => setValue(e.currentTarget.value)}
    />
  );
}
