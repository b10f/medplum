// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Autocomplete, Group, NativeSelect, Radio, Select, Stack, TextInput } from '@mantine/core';
import type { JSX } from 'react';
import { useState } from 'react';
import type { ExtendedQuestionnaireItemAnswerOption } from '../QuestionnaireFormV2.utils';
import {
  getAnswerOptionDisplay,
  getAnswerOptionLabel,
  getChoiceValueKey,
  isEmptyAnswerValue,
  isHorizontalChoiceLayout,
} from '../QuestionnaireFormV2.utils';
import type { QuestionnaireRendererItemProps } from './QuestionnaireRendererItem';
import {
  OTHER_OPTION,
  findOptionValue,
  fromChoiceText,
  getAnswerLabel,
  isTypedAnswer,
  toChoiceText,
  toOptionData,
} from './QuestionnaireRendererItem.utils';
import { QuestionnaireRendererValueSetChoiceInput } from './QuestionnaireRendererValueSetChoiceInput';
import { useAnswer } from './useAnswer';
import { useTypedText } from './useTypedText';

/**
 * A non-repeating choice question: one answer, rendered as a drop-down or radio buttons based on the item control.
 * An open-choice question also takes an answer typed by the respondent.
 * @param props - The rendered answer props.
 * @returns The QuestionnaireRendererChoiceInput React node.
 */
export function QuestionnaireRendererChoiceInput(props: QuestionnaireRendererItemProps): JSX.Element {
  const { item, readOnly } = props;
  const { value, error, setValue } = useAnswer(props);
  const answerOption: ExtendedQuestionnaireItemAnswerOption[] = item.answerOption ?? [];
  const isOpen = item.type === 'open-choice';
  const isHorizontal = isHorizontalChoiceLayout(item);
  const labelProps = getAnswerLabel(props);
  const typedAnswer = isOpen && isTypedAnswer(answerOption, value);
  const [otherSelected, setOtherSelected] = useState(typedAnswer);
  // An option's label, or the typed answer, in a drop-down that takes typed answers.
  const [choiceText, setChoiceText] = useTypedText(toChoiceText(answerOption, value), (text) =>
    setValue(fromChoiceText(answerOption, text))
  );
  const [otherText, setOtherText] = useTypedText(typeof value === 'string' ? value : '', setValue);

  if (item.answerValueSet && answerOption.length === 0) {
    return <QuestionnaireRendererValueSetChoiceInput {...props} values={isEmptyAnswerValue(value) ? [] : [value]} />;
  }

  if (item.itemControl?.code === 'drop-down' || item.itemControl?.code === 'autocomplete') {
    if (isOpen) {
      // Suggests the options, and takes any other text as the answer.
      return (
        <Autocomplete
          {...labelProps}
          disabled={readOnly}
          placeholder="Select or type an answer"
          data={[...new Set(answerOption.map(getAnswerOptionLabel))]}
          value={choiceText}
          error={error}
          onChange={setChoiceText}
        />
      );
    }
    if (item.itemControl?.code === 'autocomplete') {
      return (
        <Select
          {...labelProps}
          disabled={readOnly}
          searchable
          clearable
          placeholder="Type to search"
          data={toOptionData(answerOption)}
          value={isEmptyAnswerValue(value) ? null : getChoiceValueKey(value)}
          error={error}
          onChange={(key) => setValue(findOptionValue(answerOption, key))}
        />
      );
    }
    return (
      <NativeSelect
        {...labelProps}
        disabled={readOnly}
        data={[{ value: '', label: 'Select an option' }, ...toOptionData(answerOption)]}
        value={isEmptyAnswerValue(value) ? '' : getChoiceValueKey(value)}
        error={error}
        onChange={(e) => setValue(findOptionValue(answerOption, e.currentTarget.value))}
      />
    );
  }

  const radios = [
    ...answerOption.map((option) => (
      <Radio
        key={getChoiceValueKey(option.value)}
        value={getChoiceValueKey(option.value)}
        label={getAnswerOptionDisplay(option)}
        disabled={readOnly}
      />
    )),
    ...(isOpen ? [<Radio key={OTHER_OPTION} value={OTHER_OPTION} label="Other" disabled={readOnly} />] : []),
  ];
  let radioValue: string | null = null;
  if (otherSelected || typedAnswer) {
    radioValue = OTHER_OPTION;
  } else if (!isEmptyAnswerValue(value)) {
    radioValue = getChoiceValueKey(value);
  }

  return (
    <Stack gap="xs">
      <Radio.Group
        {...labelProps}
        value={radioValue}
        error={error}
        onChange={(key) => {
          setOtherSelected(key === OTHER_OPTION);
          setValue(key === OTHER_OPTION ? '' : findOptionValue(answerOption, key));
        }}
      >
        <Stack gap={isHorizontal ? 'md' : 'xs'} mt="xs">
          {isHorizontal ? <Group gap="xl">{radios}</Group> : radios}
        </Stack>
      </Radio.Group>
      {radioValue === OTHER_OPTION && (
        <TextInput
          aria-label="Other"
          placeholder="Please specify"
          disabled={readOnly}
          value={otherText}
          onChange={(e) => setOtherText(e.currentTarget.value)}
        />
      )}
    </Stack>
  );
}
