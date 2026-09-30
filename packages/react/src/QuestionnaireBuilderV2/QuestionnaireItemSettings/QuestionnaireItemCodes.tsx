// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group } from '@mantine/core';
import { generateId } from '@medplum/core';
import type { JSX } from 'react';
import type { QuestionnaireForm } from '../../QuestionnaireFormV2/QuestionnaireFormContext';
import { FormFlatCollection } from '../QuestionnaireFormInputs/FormFlatCollection';
import { FormTextInput } from '../QuestionnaireFormInputs/FormTextInput';

export interface QuestionnaireItemCodesProps {
  readonly form: QuestionnaireForm;
  readonly path: string;
  readonly mutable?: boolean;
  readonly disabled?: boolean;
}

export function QuestionnaireItemCodes(props: QuestionnaireItemCodesProps): JSX.Element {
  const { form, path, mutable = false, disabled = false } = props;

  const addCode = (): void => {
    form.insertListItem(path, {
      id: generateId(),
      code: '',
      display: '',
      system: '',
    });
  };

  const canAddCode = (): boolean => {
    return true;
  };

  return (
    <FormFlatCollection form={form} context={path} add={addCode} canAdd={canAddCode} disabled={disabled || !mutable}>
      {(index: number) => (
        <Group grow align="flex-start">
          <FormTextInput form={form} label="Code" context={`${path}.${index}.code`} disabled={disabled || !mutable} />
          <FormTextInput
            form={form}
            label="Display"
            context={`${path}.${index}.display`}
            disabled={disabled || !mutable}
          />
          <FormTextInput
            form={form}
            label="System"
            context={`${path}.${index}.system`}
            disabled={disabled || !mutable}
          />
        </Group>
      )}
    </FormFlatCollection>
  );
}
