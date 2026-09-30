// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack } from '@mantine/core';
import { generateId } from '@medplum/core';
import type { JSX } from 'react';
import { getValueByPath } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { FormFlatCollection, FormSwitch, FormTextInput } from '../QuestionnaireFormInputs';
import type { QuestionnaireItemFieldProps } from './QuestionnaireItemSettings.utils';
import { getValueInputType } from './QuestionnaireItemSettings.utils';

/**
 * A question's initial values: one, or several for a repeating question (up to its maximum occurrences). Choice
 * questions start from their initially selected options instead, and reference and attachment answers are picked or
 * uploaded in the form, not typed as an initial value.
 * @param props - The QuestionnaireInitialValues React props.
 * @returns The QuestionnaireInitialValues React node, or null when the question takes no initial value.
 */
export function QuestionnaireInitialValues(props: QuestionnaireItemFieldProps): JSX.Element | null {
  const { form, path, disabled } = props;
  const type = getValueByPath(form.getValues(), `${path}.type`);
  const repeats = getValueByPath(form.getValues(), `${path}.repeats`);
  const answerOptions = getValueByPath(form.getValues(), `${path}.answerOption`) ?? [];

  if (['choice', 'open-choice', 'reference', 'attachment'].includes(type) || answerOptions.length > 0) {
    return null;
  }

  const addInitial = (): void => {
    form.insertListItem(`${path}.initial`, { id: generateId(), value: '' });
  };

  // Several initial values only for a repeating question, and no more than its maximum occurrences.
  const canAddInitial = (): boolean => {
    const maxOccurs = getValueByPath(form.getValues(), `${path}.maxOccurs`);
    const initialCount = (getValueByPath(form.getValues(), `${path}.initial`) ?? []).length;
    return !maxOccurs || initialCount < +maxOccurs;
  };

  return (
    <FormFlatCollection
      form={form}
      context={`${path}.initial`}
      add={addInitial}
      addable={!!repeats}
      canAdd={canAddInitial}
      disabled={disabled}
    >
      {(index: number) => (
        <Stack gap="md">
          {type === 'boolean' && (
            <FormSwitch
              form={form}
              label="Initial Value"
              context={`${path}.initial.${index}.value`}
              disabled={disabled}
            />
          )}

          {type !== 'boolean' && (
            <FormTextInput
              form={form}
              label="Initial Value"
              context={`${path}.initial.${index}.value`}
              type={getValueInputType(type)}
              disabled={disabled}
            />
          )}
        </Stack>
      )}
    </FormFlatCollection>
  );
}
