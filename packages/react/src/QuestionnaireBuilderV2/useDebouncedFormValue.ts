// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useDebouncedState } from '@mantine/hooks';
import { useEffect, useRef, useTransition } from 'react';
import type { QuestionnaireForm } from '../QuestionnaireFormV2/QuestionnaireFormContext';
import { getValueByPath } from '../QuestionnaireFormV2/QuestionnaireFormV2.utils';

/**
 * Keeps a text input's value in a debounced local state and writes it to the form after 100ms.
 * @param form - The questionnaire form.
 * @param context - The form path of the value.
 * @param onChange - Optional callback invoked after the form value is written.
 * @returns The current form value and the debounced setter.
 */
export function useDebouncedFormValue(
  form: QuestionnaireForm,
  context: string,
  onChange?: (value: string) => void
): { formValue: any; setValue: (value: any) => void } {
  const formValue = getValueByPath(form.getValues(), context) ?? '';

  const [value, setValue] = useDebouncedState(formValue, 100);
  const [, startTransition] = useTransition();
  const contextRef = useRef(context);

  useEffect(() => {
    if (contextRef.current !== context) {
      contextRef.current = context;
      setValue(formValue);
    }
  }, [context, formValue, setValue]);

  useEffect(() => {
    if (contextRef.current === context && value !== formValue) {
      startTransition(() => {
        form.setFieldValue(context, value);
        onChange?.(value);
      });
    }
    // Only a new debounced value should write to the form; formValue changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return { formValue, setValue };
}
