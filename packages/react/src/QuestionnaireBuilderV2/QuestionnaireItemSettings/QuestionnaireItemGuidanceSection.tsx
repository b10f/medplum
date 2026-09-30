// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconBulb } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useQuestionnaireFormContext } from '../../QuestionnaireFormV2/QuestionnaireFormContext';
import { getValueByPath } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { FormRadioGroup } from '../QuestionnaireFormInputs/FormRadioGroup';
import { FormTextarea } from '../QuestionnaireFormInputs/FormTextarea';
import { FormTextInput } from '../QuestionnaireFormInputs/FormTextInput';
import { QuestionnaireAnswerConstraints } from './QuestionnaireAnswerConstraints';
import type { QuestionnaireItemSectionProps } from './QuestionnaireItemSettings.utils';
import { QuestionnaireSettingsSectionTitle } from './QuestionnaireSettingsSectionTitle';

/**
 * The question types whose answer field shows an entry format (entryFormat). Date and time fields are the browser's own
 * pickers, which show their own format.
 */
const ENTRY_FORMAT_TYPES = ['string', 'text', 'url', 'integer', 'decimal', 'quantity'];

/**
 * The "Guidance" section: what helps the respondent answer (entry format, help, texts shown with the answer, a support
 * link), a note for authors, and the limits an answer is checked against.
 * @param props - The section props.
 * @returns The QuestionnaireItemGuidanceSection React node.
 */
export function QuestionnaireItemGuidanceSection(props: QuestionnaireItemSectionProps): JSX.Element {
  const { selectedItem, disabled } = props;
  const form = useQuestionnaireFormContext();
  const path = selectedItem.path;
  const type = getValueByPath(form.getValues(), `${path}.type`);
  const itemControl = getValueByPath(form.getValues(), `${path}.itemControl`);
  const isDisplay = type === 'display';
  const isGroup = type === 'group';

  return (
    <>
      <QuestionnaireSettingsSectionTitle icon={<IconBulb size={22} />}>Guidance</QuestionnaireSettingsSectionTitle>

      {!isDisplay && (
        <>
          {ENTRY_FORMAT_TYPES.includes(type) && itemControl?.code !== 'slider' && (
            <FormTextInput
              form={form}
              label="Entry Format"
              description="Shown in the empty answer field, e.g. nnn-nnn-nnnn"
              context={`${path}.entryFormat`}
              disabled={disabled}
            />
          )}

          <FormTextarea form={form} label="Help Text" context={`${path}.help`} disabled={disabled} />

          <FormRadioGroup
            form={form}
            label="Show help as"
            context={`${path}.helpDisplay`}
            options={[
              { value: 'help', label: 'Help button' },
              { value: 'flyover', label: 'On hover' },
              { value: 'inline', label: 'Below the question' },
            ]}
            defaultValue="help"
            disabled={disabled}
          />

          {/* Texts shown with the answer, each saved as a display item with that control. */}
          {!isGroup && (
            <FormTextInput
              form={form}
              label="Prompt"
              description="Shown below the answer, e.g. 'Drag the slider'."
              context={`${path}.displayTexts.prompt`}
              disabled={disabled}
            />
          )}
          {['string', 'integer', 'decimal'].includes(type) && (
            <FormTextInput
              form={form}
              label="Unit label"
              description="Shown next to the answer, e.g. 'per day'. A coded Unit is shown instead, when set."
              context={`${path}.displayTexts.unit`}
              disabled={disabled}
            />
          )}
          {['integer', 'decimal', 'choice', 'open-choice'].includes(type) && (
            <>
              <FormTextInput
                form={form}
                label="Lower label"
                description="Shown at the start of a scale, e.g. 'No pain'."
                context={`${path}.displayTexts.lower`}
                disabled={disabled}
              />
              <FormTextInput
                form={form}
                label="Upper label"
                description="Shown at the end of a scale, e.g. 'Worst pain'."
                context={`${path}.displayTexts.upper`}
                disabled={disabled}
              />
            </>
          )}
        </>
      )}

      <FormTextInput form={form} label="Support Link" context={`${path}.supportLink`} type="url" disabled={disabled} />

      <FormTextarea
        form={form}
        label="Design Note"
        description="For the people building this questionnaire; never shown to respondents."
        context={`${path}.designNote`}
        disabled={disabled}
      />

      <QuestionnaireAnswerConstraints form={form} path={path} disabled={disabled} />
    </>
  );
}
