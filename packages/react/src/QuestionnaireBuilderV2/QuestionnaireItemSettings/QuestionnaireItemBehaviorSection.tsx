// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useQuestionnaireFormContext } from '../../QuestionnaireFormV2/QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { findRootItem, getValueByPath } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { hasFixedItemControl } from '../QuestionnaireBuilderV2.utils';
import { FormSwitch } from '../QuestionnaireFormInputs/FormSwitch';
import { FormTextInput } from '../QuestionnaireFormInputs/FormTextInput';
import type { QuestionnaireItemSectionProps } from './QuestionnaireItemSettings.utils';
import { QuestionnaireSettingsSectionTitle } from './QuestionnaireSettingsSectionTitle';

/**
 * The "Settings" section: whether the item is hidden, required, repeats (and how often) and read only.
 * @param props - The section props.
 * @returns The QuestionnaireItemBehaviorSection React node.
 */
export function QuestionnaireItemBehaviorSection(props: QuestionnaireItemSectionProps): JSX.Element {
  const { selectedItem, disabled } = props;
  const form = useQuestionnaireFormContext();
  const path = selectedItem.path;
  const item: ExtendedQuestionnaireItem = getValueByPath(form.getValues(), path) ?? selectedItem;
  const { type, repeats, required } = item;
  const isDisplay = type === 'display';
  // Pages, headers and footers are what their item control makes them: it is fixed, and they do not repeat.
  const hasFixedControl = hasFixedItemControl(item);
  // An item in a read-only group is read only itself.
  const isDisabledByParent = selectedItem.parent?.type === 'group' && !!findRootItem(selectedItem).readOnly;

  // The preview's answers follow the repetitions on their own; only the initial values are kept within them.
  const handleRepeatsChange = (repeats: boolean): void => {
    const initialArray = getValueByPath(form.getValues(), `${path}.initial`) ?? [];
    if (!repeats && initialArray.length > 1) {
      form.setFieldValue(`${path}.initial`, initialArray.slice(0, 1));
    }

    if (getValueByPath(form.getValues(), `${path}.itemControl`)) {
      form.setFieldValue(`${path}.itemControl`, {});
    }
  };

  const handleMaxOccursChange = (maxOccurs: number): void => {
    // An empty or zero field means unlimited.
    if (!maxOccurs) {
      return;
    }

    const initialArray = getValueByPath(form.getValues(), `${path}.initial`) ?? [];
    if (initialArray.length > maxOccurs) {
      form.setFieldValue(`${path}.initial`, initialArray.slice(0, maxOccurs));
    }
  };

  return (
    <>
      <QuestionnaireSettingsSectionTitle icon={<IconAdjustmentsHorizontal size={22} />}>
        Settings
      </QuestionnaireSettingsSectionTitle>

      <FormSwitch form={form} label="Hidden" context={`${path}.hidden`} disabled={disabled} />

      {!isDisplay && (
        <>
          <FormSwitch form={form} label="Required" context={`${path}.required`} disabled={disabled} />

          {!hasFixedControl && selectedItem.parent?.itemControl?.code !== 'gtable' && type !== 'boolean' && (
            <FormSwitch
              form={form}
              label="Repeats"
              context={`${path}.repeats`}
              onChange={(value) => handleRepeatsChange(value)}
              disabled={disabled}
            />
          )}

          {repeats && !hasFixedControl && (
            <>
              {required && (
                <FormTextInput
                  form={form}
                  label="Minimum Occurrences"
                  context={`${path}.minOccurs`}
                  type="number"
                  min="1"
                  disabled={disabled}
                />
              )}

              <FormTextInput
                form={form}
                label="Maximum Occurrences"
                context={`${path}.maxOccurs`}
                type="number"
                min="2"
                onChange={(value) => handleMaxOccursChange(+value)}
                disabled={disabled}
              />
            </>
          )}

          {!isDisabledByParent && (
            <FormSwitch form={form} label="Read Only" context={`${path}.readOnly`} disabled={disabled} />
          )}
        </>
      )}
    </>
  );
}
