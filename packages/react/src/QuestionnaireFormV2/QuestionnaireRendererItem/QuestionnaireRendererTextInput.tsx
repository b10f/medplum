// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { NumberInput, Slider, Stack, Text, TextInput } from '@mantine/core';
import type { JSX } from 'react';
import { startTransition } from 'react';
import { getAttachedText } from '../QuestionnaireRenderer.utils';
import type { QuestionnaireRendererItemProps } from './QuestionnaireRendererItem';
import { getAnswerLabel, getDecimalPlaces, getUnitSection } from './QuestionnaireRendererItem.utils';
import { useAnswer } from './useAnswer';
import { useNumberText } from './useNumberText';
import { useTypedText } from './useTypedText';

export function QuestionnaireRendererTextInput(props: QuestionnaireRendererItemProps): JSX.Element {
  const { item, ignoreValidation, readOnly } = props;
  const { value, error, setValue } = useAnswer(props);
  const [numberText, setNumberText] = useNumberText(typeof value === 'number' ? value : undefined);
  const type = item.type;
  const isNumber = type === 'integer' || type === 'decimal';
  const isSlider = isNumber && item.itemControl?.code === 'slider';
  const minValue = Number(item.minValue ?? 0);
  const maxValue = Number(item.maxValue ?? 100);
  const sliderStepValue = Number(item.sliderStepValue ?? 1);
  const unit = item.unit;
  const labelProps = getAnswerLabel(props);
  const [text, setText] = useTypedText(value, setValue, isNumber);

  if (isSlider) {
    return (
      <Stack gap="xs">
        {labelProps.label}
        <Slider
          aria-label={labelProps['aria-label']}
          disabled={readOnly}
          value={Number(value) || minValue}
          min={minValue}
          max={maxValue}
          step={sliderStepValue}
          onChange={setValue}
        />
      </Stack>
    );
  }

  if (isNumber && item.itemControl?.code === 'spinner') {
    return (
      <NumberInput
        {...labelProps}
        disabled={readOnly}
        // Typing is limited to the decimal places (maxDecimalPlaces); other inputs are checked by validateAnswerValue.
        allowDecimal={type === 'decimal' && getDecimalPlaces(item) !== 0}
        decimalScale={type === 'decimal' ? getDecimalPlaces(item) : undefined}
        {...getUnitSection(unit ? (unit.display ?? unit.code) : getAttachedText(item, 'unit'))}
        min={item.minValue === null || item.minValue === '' ? undefined : Number(item.minValue)}
        max={item.maxValue === null || item.maxValue === '' ? undefined : Number(item.maxValue)}
        placeholder={item.entryFormat}
        value={numberText}
        error={error}
        onChange={(val) => {
          setNumberText(val);
          // The rest of the form follows in a transition, so it does not hold up typing.
          startTransition(() => setValue(val));
        }}
      />
    );
  }

  if (isNumber && unit) {
    return (
      <TextInput
        {...labelProps}
        disabled={readOnly}
        type="number"
        rightSection={<Text size="sm">{unit.display ?? unit.code}</Text>}
        rightSectionWidth="auto"
        rightSectionProps={{ style: { paddingInline: 'var(--mantine-spacing-sm)' } }}
        step="any"
        placeholder={item.entryFormat}
        value={text}
        error={error}
        onChange={(e) => setText(e.currentTarget.value)}
      />
    );
  }

  return (
    <TextInput
      {...labelProps}
      disabled={readOnly}
      type={isNumber ? 'number' : 'text'}
      // A URL keyboard on mobile, without the browser's own URL check: validateAnswerValue checks the value.
      inputMode={type === 'url' ? 'url' : undefined}
      step={type === 'decimal' ? 'any' : undefined}
      placeholder={item.entryFormat}
      maxLength={!ignoreValidation && item.maxLength ? item.maxLength : undefined}
      {...getUnitSection(getAttachedText(item, 'unit'))}
      value={text}
      error={error}
      onChange={(e) => setText(e.currentTarget.value)}
    />
  );
}
