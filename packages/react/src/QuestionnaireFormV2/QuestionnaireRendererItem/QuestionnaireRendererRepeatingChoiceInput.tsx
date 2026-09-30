// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Checkbox, MultiSelect, Stack, TagsInput, TextInput } from '@mantine/core';
import type { JSX } from 'react';
import { useState } from 'react';
import { useQuestionnaireResponseFormContext } from '../QuestionnaireFormContext';
import type { ExtendedQuestionnaireItemAnswerOption } from '../QuestionnaireFormV2.utils';
import {
  getAnswerOptionDisplay,
  getAnswerOptionLabel,
  getChoiceValueKey,
  isEmptyAnswerValue,
} from '../QuestionnaireFormV2.utils';
import {
  findOptionValue,
  fromChoiceText,
  getAnswers,
  isTypedAnswer,
  setChoiceAnswers,
  toChoiceText,
  toOptionData,
} from '../QuestionnaireRenderer.utils';
import { getAnswerValue } from '../QuestionnaireResponse.utils';
import type { QuestionnaireRendererItemProps } from './QuestionnaireRendererItem';
import { OTHER_OPTION, getAnswerLabel } from './QuestionnaireRendererItem.utils';
import { QuestionnaireRendererValueSetChoiceInput } from './QuestionnaireRendererValueSetChoiceInput';

/**
 * A repeating choice question: multiple answers are allowed, one per selected option. Rendered as a multi-select
 * drop-down or checkboxes based on the item control. An open-choice question also takes answers typed by the
 * respondent.
 * @param props - The rendered answer props.
 * @returns The QuestionnaireRendererRepeatingChoiceInput React node.
 */
export function QuestionnaireRendererRepeatingChoiceInput(props: QuestionnaireRendererItemProps): JSX.Element {
  const { item, answersPath, readOnly } = props;
  const responseForm = useQuestionnaireResponseFormContext();
  const answerOption: ExtendedQuestionnaireItemAnswerOption[] = item.answerOption ?? [];
  const isOpen = item.type === 'open-choice';
  const labelProps = getAnswerLabel({ ...props, answerIndex: 0 });
  const values = getAnswers(responseForm, answersPath)
    .map((answer) => getAnswerValue(item, answer))
    .filter((value) => !isEmptyAnswerValue(value));
  const typedValues = values.filter((value) => isTypedAnswer(answerOption, value));
  const [otherChecked, setOtherChecked] = useState(typedValues.length > 0);
  const error = responseForm.errors[answersPath];

  const setValues = (requestedValues: any[]): void =>
    setChoiceAnswers(responseForm, item, answersPath, requestedValues);

  if (item.answerValueSet && answerOption.length === 0) {
    return <QuestionnaireRendererValueSetChoiceInput {...props} values={values} multiple />;
  }

  if (['drop-down', 'multi-select', 'autocomplete'].includes(item.itemControl?.code as string)) {
    if (isOpen) {
      return (
        <TagsInput
          {...labelProps}
          disabled={readOnly}
          placeholder="Select or type answers"
          data={[...new Set(answerOption.map(getAnswerOptionLabel))]}
          value={values.map((value) => toChoiceText(answerOption, value))}
          error={error}
          onChange={(texts) => setValues(texts.map((text) => fromChoiceText(answerOption, text)))}
        />
      );
    }
    return (
      <MultiSelect
        {...labelProps}
        disabled={readOnly}
        searchable={item.itemControl?.code === 'autocomplete'}
        placeholder={item.itemControl?.code === 'autocomplete' ? 'Type to search' : 'Select items'}
        data={toOptionData(answerOption)}
        value={values.map(getChoiceValueKey)}
        error={error}
        onChange={(keys) => setValues(keys.map((key) => findOptionValue(answerOption, key)))}
      />
    );
  }

  const selectedKeys = values.filter((value) => !isTypedAnswer(answerOption, value)).map(getChoiceValueKey);
  const typedValue = typedValues[0] ?? '';

  return (
    <Stack gap="xs">
      <Checkbox.Group
        {...labelProps}
        value={[...selectedKeys, ...(otherChecked ? [OTHER_OPTION] : [])]}
        error={error}
        onChange={(keys) => {
          const checkOther = keys.includes(OTHER_OPTION);
          setOtherChecked(checkOther);
          const optionValues = keys
            .filter((key) => key !== OTHER_OPTION)
            .map((key) => findOptionValue(answerOption, key));
          setValues([...optionValues, ...(checkOther && typedValue ? [typedValue] : [])]);
        }}
      >
        <Stack gap="xs" mt="xs">
          {answerOption.map((option) => (
            <Checkbox
              key={getChoiceValueKey(option.value)}
              value={getChoiceValueKey(option.value)}
              label={getAnswerOptionDisplay(option)}
              disabled={readOnly}
            />
          ))}
          {isOpen && <Checkbox value={OTHER_OPTION} label="Other" disabled={readOnly} />}
        </Stack>
      </Checkbox.Group>
      {isOpen && otherChecked && (
        <TextInput
          aria-label="Other"
          placeholder="Please specify"
          disabled={readOnly}
          value={typedValue}
          onChange={(e) => {
            const text = e.currentTarget.value;
            const optionValues = values.filter((value) => !isTypedAnswer(answerOption, value));
            setValues([...optionValues, ...(text ? [text] : [])]);
          }}
        />
      )}
    </Stack>
  );
}
