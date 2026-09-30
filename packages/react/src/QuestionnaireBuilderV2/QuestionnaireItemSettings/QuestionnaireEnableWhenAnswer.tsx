// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text } from '@mantine/core';
import type { JSX } from 'react';
import type { QuestionnaireForm } from '../../QuestionnaireFormV2/QuestionnaireFormContext';
import type {
  ExtendedQuestionnaireItem,
  ExtendedQuestionnaireItemAnswerOption,
} from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import {
  getAnswerOptionLabel,
  getChoiceValueKey,
  getValueByPath,
} from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { ValueSetAutocomplete } from '../../ValueSetAutocomplete/ValueSetAutocomplete';
import { FormSelect, FormTextInput } from '../QuestionnaireFormInputs';
import { getEnableWhenAnswerInputType } from './QuestionnaireItemSettings.utils';

export interface QuestionnaireEnableWhenAnswerProps {
  readonly form: QuestionnaireForm;
  readonly context: string;
  /** The question the condition checks (its current definition). */
  readonly question: ExtendedQuestionnaireItem;
  readonly disabled?: boolean;
}

/**
 * The answer a condition compares the question's answer with, entered as the question is answered: one of its
 * options, yes or no, a number, a date or time, or text.
 * @param props - The QuestionnaireEnableWhenAnswer React props.
 * @returns The QuestionnaireEnableWhenAnswer React node.
 */
export function QuestionnaireEnableWhenAnswer(props: QuestionnaireEnableWhenAnswerProps): JSX.Element {
  const { form, context, question, disabled } = props;
  const answer = getValueByPath(form.getValues(), context);
  const type = question.type;

  if (type === 'choice' || type === 'open-choice') {
    const options: ExtendedQuestionnaireItemAnswerOption[] = question.answerOption ?? [];
    if (question.answerValueSet && options.length === 0) {
      return (
        <ValueSetAutocomplete
          label="Answer"
          binding={question.answerValueSet}
          maxValues={1}
          creatable={false}
          disabled={disabled}
          defaultValue={answer?.code ? [{ system: answer.system, code: answer.code, display: answer.display }] : []}
          onChange={(selected) =>
            form.setFieldValue(
              context,
              selected[0] ? { system: selected[0].system, code: selected[0].code, display: selected[0].display } : ''
            )
          }
        />
      );
    }
    return (
      <FormSelect
        form={form}
        label="Answer"
        context={context}
        required={true}
        disabled={disabled}
        data={options.map((option) => ({
          value: getChoiceValueKey(option.value),
          label: getAnswerOptionLabel(option),
        }))}
        value={answer === '' || answer === undefined || answer === null ? null : getChoiceValueKey(answer)}
        onChange={(key) =>
          form.setFieldValue(context, options.find((option) => getChoiceValueKey(option.value) === key)?.value ?? '')
        }
      />
    );
  }

  if (type === 'boolean') {
    return (
      <FormSelect
        form={form}
        label="Answer"
        context={context}
        disabled={disabled}
        data={[
          { value: 'true', label: 'Yes' },
          { value: 'false', label: 'No' },
        ]}
        value={answer === false ? 'false' : 'true'}
        onChange={(value) => form.setFieldValue(context, value !== 'false')}
      />
    );
  }

  const inputType = getEnableWhenAnswerInputType(type);
  if (!inputType) {
    return (
      <Text size="sm" c="dimmed">
        A condition on this type of question can only check whether it is answered.
      </Text>
    );
  }
  return (
    <FormTextInput form={form} label="Answer" context={context} type={inputType} required={true} disabled={disabled} />
  );
}
