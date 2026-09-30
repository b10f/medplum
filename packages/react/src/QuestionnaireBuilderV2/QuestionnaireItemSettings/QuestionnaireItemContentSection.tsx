// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { useQuestionnaireFormContext } from '../../QuestionnaireFormV2/QuestionnaireFormContext';
import { getValueByPath } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { hasFixedItemControl } from '../QuestionnaireBuilderV2.utils';
import { FormSelect } from '../QuestionnaireFormInputs/FormSelect';
import { FormTextarea } from '../QuestionnaireFormInputs/FormTextarea';
import { FormTextInput } from '../QuestionnaireFormInputs/FormTextInput';
import { ItemTypeIcon } from '../QuestionnaireItemTree';
import { QuestionnaireAnswerOptions } from './QuestionnaireAnswerOptions';
import { QuestionnaireAttachmentLimits } from './QuestionnaireAttachmentLimits';
import { QuestionnaireInitialValues } from './QuestionnaireInitialValues';
import { QuestionnaireItemCodes } from './QuestionnaireItemCodes';
import { QuestionnaireItemControlSettings } from './QuestionnaireItemControlSettings';
import type { QuestionnaireItemSectionProps } from './QuestionnaireItemSettings.utils';
import { getTitle, toSelectData } from './QuestionnaireItemSettings.utils';
import { QuestionnaireReferenceTypes } from './QuestionnaireReferenceTypes';
import { QuestionnaireSettingsSectionTitle } from './QuestionnaireSettingsSectionTitle';
import { QuestionnaireUnitInput } from './QuestionnaireUnitInput';
import { QuestionnaireUnitValueSetInput } from './QuestionnaireUnitValueSetInput';

/**
 * The item itself: its text and codes, and for a question its type, initial values, what its answers can be (units,
 * resource types, files, answer options) and how it is answered (item control).
 * @param props - The section props.
 * @returns The QuestionnaireItemContentSection React node.
 */
export function QuestionnaireItemContentSection(props: QuestionnaireItemSectionProps): JSX.Element {
  const { selectedItem, disabled, codes } = props;
  const form = useQuestionnaireFormContext();
  const path = selectedItem.path;
  const item = getValueByPath(form.getValues(), path) ?? selectedItem;
  const type = item.type;
  const isDisplay = type === 'display';
  const isGroup = type === 'group';
  // Pages, headers and footers are what their item control makes them: it is fixed, and they do not repeat.
  const hasFixedControl = hasFixedItemControl(item);

  return (
    <>
      <QuestionnaireSettingsSectionTitle icon={<ItemTypeIcon item={item} size={22} />}>
        {hasFixedControl ? (item.itemControl?.display ?? 'Page') : getTitle(selectedItem, type)}
      </QuestionnaireSettingsSectionTitle>

      <FormTextInput form={form} label="Prefix" context={`${path}.prefix`} disabled={disabled} />

      <FormTextarea
        form={form}
        label="Primary text for the item"
        context={`${path}.text`}
        rows={10}
        required={true}
        disabled={disabled}
      />

      {!isDisplay && <QuestionnaireItemCodes form={form} path={`${path}.code`} />}

      {isDisplay && (
        <FormSelect
          form={form}
          label="Display category"
          description="What the text is for; the form shows instructions, security notices and help each in their own style."
          placeholder="None"
          context={`${path}.displayCategory`}
          data={toSelectData(codes.displayCategories)}
          loading={codes.loading}
          unavailable={codes.unavailable.displayCategories}
          disabled={disabled}
          value={item.displayCategory?.code ?? null}
          onChange={(code) => {
            const coding = codes.displayCategories.find((category) => category.code === code);
            form.setFieldValue(
              `${path}.displayCategory`,
              coding ? { system: coding.system, code: coding.code, display: coding.display } : {}
            );
          }}
        />
      )}

      {!isDisplay && !isGroup && (
        <>
          <FormSelect
            form={form}
            label="Type"
            context={`${path}.type`}
            loading={codes.loading}
            unavailable={codes.unavailable.itemTypes}
            data={toSelectData(codes.itemTypes)}
          />

          <QuestionnaireInitialValues form={form} path={path} disabled={disabled} />

          {type === 'reference' && <QuestionnaireReferenceTypes form={form} path={path} disabled={disabled} />}

          {type === 'attachment' && <QuestionnaireAttachmentLimits form={form} path={path} disabled={disabled} />}

          {type === 'quantity' && (
            <>
              <QuestionnaireUnitInput
                form={form}
                context={`${path}.unitOption`}
                label="Allowed units"
                description="The units the respondent chooses from. With one unit, the unit is fixed; with none, the respondent types a unit."
                multiple
                disabled={disabled}
              />
              <QuestionnaireUnitValueSetInput form={form} path={path} disabled={disabled} />
            </>
          )}

          {(type === 'integer' || type === 'decimal') && (
            <QuestionnaireUnitInput
              form={form}
              context={`${path}.unit`}
              label="Unit"
              description="The unit of the number, shown next to the answer."
              disabled={disabled}
            />
          )}
        </>
      )}

      {!hasFixedControl && <QuestionnaireItemControlSettings {...props} />}

      <QuestionnaireAnswerOptions selectedItem={selectedItem} disabled={disabled} />
    </>
  );
}
