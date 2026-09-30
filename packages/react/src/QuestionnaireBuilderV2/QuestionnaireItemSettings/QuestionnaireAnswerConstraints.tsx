// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { getValueByPath } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { FormTextInput } from '../QuestionnaireFormInputs';
import type { QuestionnaireItemFieldProps } from './QuestionnaireItemSettings.utils';
import { getValueInputType } from './QuestionnaireItemSettings.utils';

/**
 * The limits a question's answer is checked against, by question type: its length and pattern for text, its range for
 * numbers, dates and times, and its decimal places.
 * @param props - The QuestionnaireAnswerConstraints React props.
 * @returns The QuestionnaireAnswerConstraints React node, or null for a type without limits.
 */
export function QuestionnaireAnswerConstraints(props: QuestionnaireItemFieldProps): JSX.Element | null {
  const { form, path, disabled } = props;
  const type = getValueByPath(form.getValues(), `${path}.type`);
  const isText = type === 'string' || type === 'text';
  const hasRange = ['integer', 'decimal', 'quantity', 'date', 'dateTime', 'time'].includes(type);

  if (!isText && !hasRange && type !== 'url') {
    return null;
  }

  return (
    <>
      {isText && (
        <FormTextInput form={form} label="Min Length" context={`${path}.minLength`} type="number" disabled={disabled} />
      )}

      {(isText || type === 'url') && (
        <FormTextInput form={form} label="Max Length" context={`${path}.maxLength`} type="number" disabled={disabled} />
      )}

      {hasRange && (
        <>
          <FormTextInput
            form={form}
            label="Min Value"
            context={`${path}.minValue`}
            type={getValueInputType(type)}
            disabled={disabled}
          />

          <FormTextInput
            form={form}
            label="Max Value"
            context={`${path}.maxValue`}
            type={getValueInputType(type)}
            disabled={disabled}
          />

          {(type === 'decimal' || type === 'quantity') && (
            <FormTextInput
              form={form}
              label="Maximum decimal places"
              description="E.g. 1 for 36.6; 0 for whole numbers. Empty for no limit."
              context={`${path}.maxDecimalPlaces`}
              type="number"
              min="0"
              disabled={disabled}
            />
          )}
        </>
      )}

      {isText && <FormTextInput form={form} label="Regex Pattern" context={`${path}.regex`} disabled={disabled} />}
    </>
  );
}
