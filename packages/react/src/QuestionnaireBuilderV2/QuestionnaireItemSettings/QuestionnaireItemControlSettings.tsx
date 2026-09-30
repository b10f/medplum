// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Coding } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useQuestionnaireFormContext } from '../../QuestionnaireFormV2/QuestionnaireFormContext';
import { getValueByPath } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { getItemControlOptions, hasItemControls } from '../QuestionnaireBuilderV2.utils';
import { FormRadioGroup } from '../QuestionnaireFormInputs/FormRadioGroup';
import { FormSelect } from '../QuestionnaireFormInputs/FormSelect';
import { FormTextInput } from '../QuestionnaireFormInputs/FormTextInput';
import type { QuestionnaireItemSectionProps } from './QuestionnaireItemSettings.utils';
import { getDefaultItemControl, toSelectData } from './QuestionnaireItemSettings.utils';

/**
 * How an item is answered or laid out (its item control), from the controls that suit it, with a slider's step and a
 * choice's orientation.
 * @param props - The section props.
 * @returns The QuestionnaireItemControlSettings React node, or null when no item control suits the item.
 */
export function QuestionnaireItemControlSettings(props: QuestionnaireItemSectionProps): JSX.Element | null {
  const { selectedItem, disabled, codes } = props;
  const form = useQuestionnaireFormContext();
  const path = selectedItem.path;
  const item = getValueByPath(form.getValues(), path) ?? selectedItem;
  const { type, repeats, itemControl } = item;
  const options = codes.itemControlCodes ? getItemControlOptions(codes.itemControlCodes, item) : [];
  // Without the item control code system, an item that could take one says so.
  const unavailable = hasItemControls(item) ? codes.unavailable.itemControlCodes : undefined;

  if (options.length === 0 && !unavailable) {
    return null;
  }

  return (
    <>
      <FormSelect
        form={form}
        label="Item Control"
        placeholder="Item Control"
        context={`${path}.itemControl`}
        data={toSelectData(options)}
        loading={codes.loading}
        unavailable={unavailable}
        disabled={disabled}
        value={itemControl?.code ?? getDefaultItemControl(type, !!repeats)}
        onChange={(code) => {
          const coding = options.find((option: Coding) => option.code === code);
          form.setFieldValue(
            `${path}.itemControl`,
            coding ? { code: coding.code, display: coding.display, system: coding.system } : {}
          );
        }}
      />

      {(type === 'integer' || type === 'decimal') && itemControl?.code === 'slider' && (
        <FormTextInput
          form={form}
          label="Slider Step Value"
          context={`${path}.sliderStepValue`}
          type="number"
          min="1"
          disabled={disabled}
        />
      )}

      {(type === 'choice' || type === 'open-choice') && (
        <FormRadioGroup
          form={form}
          label="Choice Orientation"
          description="Desired orientation when rendering a list of choices"
          context={`${path}.choiceOrientation`}
          options={[
            { value: 'horizontal', label: 'Horizontal' },
            { value: 'vertical', label: 'Vertical' },
          ]}
          defaultValue="vertical"
          disabled={disabled}
        />
      )}
    </>
  );
}
