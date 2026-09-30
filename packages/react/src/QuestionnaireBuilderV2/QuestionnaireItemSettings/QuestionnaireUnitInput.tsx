// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { UCUM } from '@medplum/core';
import type { Coding } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import type { QuestionnaireForm } from '../../QuestionnaireFormV2/QuestionnaireFormContext';
import { getValueByPath } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { ValueSetAutocomplete } from '../../ValueSetAutocomplete/ValueSetAutocomplete';

/** Common UCUM units, the unit codes Medplum uses (UCUM); units not in it can be typed as UCUM codes. */
const UCUM_COMMON_VALUE_SET = 'http://hl7.org/fhir/ValueSet/ucum-common';

export interface QuestionnaireUnitInputProps {
  readonly form: QuestionnaireForm;
  readonly context: string;
  readonly label: string;
  readonly description: string;
  /** Several units (questionnaire-unitOption) rather than one (questionnaire-unit). */
  readonly multiple?: boolean;
  readonly disabled?: boolean;
}

/**
 * Picks UCUM units for a question: searched in the common UCUM units, or typed as a UCUM code (e.g. mm[Hg]).
 * @param props - The QuestionnaireUnitInput React props.
 * @returns The QuestionnaireUnitInput React node.
 */
export function QuestionnaireUnitInput(props: QuestionnaireUnitInputProps): JSX.Element {
  const { form, context, label, description, multiple, disabled } = props;
  const value = getValueByPath(form.getValues(), context);
  const units: Coding[] = (multiple ? (value ?? []) : [value]).filter(Boolean);

  return (
    <ValueSetAutocomplete
      key={context}
      label={label}
      description={description}
      binding={UCUM_COMMON_VALUE_SET}
      creatable
      clearable
      disabled={disabled}
      maxValues={multiple ? undefined : 1}
      placeholder="Search units, or type a UCUM code"
      defaultValue={units.map((unit) => ({ system: UCUM, code: unit.code, display: unit.display ?? unit.code }))}
      onChange={(selected) => {
        const codings = selected.map((entry) => ({
          system: UCUM,
          code: entry.code,
          display: entry.display ?? entry.code,
        }));
        form.setFieldValue(context, multiple ? codings : (codings[0] ?? null));
      }}
    />
  );
}
