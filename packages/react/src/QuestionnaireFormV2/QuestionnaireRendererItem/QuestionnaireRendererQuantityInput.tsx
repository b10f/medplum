// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Input, NativeSelect, TextInput } from '@mantine/core';
import type { Coding, Quantity } from '@medplum/fhirtypes';
import type { JSX, WheelEvent } from 'react';
import { ValueSetAutocomplete } from '../../ValueSetAutocomplete/ValueSetAutocomplete';
import { isQuantityAnswer, toQuantityUnit } from '../QuestionnaireFormV2.utils';
import type { QuestionnaireRendererItemProps } from './QuestionnaireRendererItem';
import { getAnswerLabel } from './QuestionnaireRendererItem.utils';
import { useAnswer } from './useAnswer';

const QUANTITY_COMPARATORS = ['', '<', '<=', '>=', '>'];

/**
 * A quantity answer, as Medplum's QuantityInput: a comparator, the value and the unit. The unit is picked from the
 * question's unit options, fixed by its unit, or typed.
 * @param props - The rendered answer props.
 * @returns The QuestionnaireRendererQuantityInput React node.
 */
export function QuestionnaireRendererQuantityInput(props: QuestionnaireRendererItemProps): JSX.Element {
  const { item, readOnly } = props;
  const { answerPath, value: current, error, setValue } = useAnswer(props);
  // Always with a value key, so an answer with only a unit still counts as unanswered.
  const quantity: Quantity = isQuantityAnswer(current) ? current : { value: current === '' ? undefined : current };
  const unitOptions: Coding[] = (item.unitOption ?? []).filter(Boolean);
  // One allowed unit is the unit; with none, the question's own unit (if any) is.
  let fixedUnit: ReturnType<typeof toQuantityUnit>;
  if (item.unitValueSet) {
    fixedUnit = undefined;
  } else if (unitOptions.length === 1) {
    fixedUnit = toQuantityUnit(unitOptions[0]);
  } else if (unitOptions.length === 0) {
    fixedUnit = toQuantityUnit(item.unit);
  }
  const { label, labelProps, 'aria-label': ariaLabel } = getAnswerLabel(props);

  const setQuantity = (changes: Partial<Quantity>): void => {
    setValue({ ...quantity, ...changes });
  };

  let unitInput: JSX.Element;
  if (item.unitValueSet) {
    // Units searched in a value set (questionnaire-unitValueSet).
    unitInput = (
      <ValueSetAutocomplete
        aria-label="Unit"
        name={`${answerPath}-unit`}
        binding={item.unitValueSet}
        creatable={false}
        clearable
        maxValues={1}
        placeholder="Unit"
        disabled={readOnly}
        defaultValue={quantity.code ? [{ system: quantity.system, code: quantity.code, display: quantity.unit }] : []}
        onChange={(selected) =>
          setQuantity(
            toQuantityUnit(
              selected[0] && { system: selected[0].system, code: selected[0].code, display: selected[0].display }
            ) ?? {
              unit: undefined,
              system: undefined,
              code: undefined,
            }
          )
        }
      />
    );
  } else if (unitOptions.length > 1) {
    unitInput = (
      <NativeSelect
        aria-label="Unit"
        disabled={readOnly}
        data={[
          { value: '', label: 'Unit' },
          ...unitOptions.map((unit) => ({ value: unit.code ?? '', label: unit.display ?? unit.code ?? '' })),
        ]}
        value={quantity.code ?? ''}
        onChange={(e) => {
          const unit = unitOptions.find((option) => option.code === e.currentTarget.value);
          setQuantity(toQuantityUnit(unit) ?? { unit: undefined, system: undefined, code: undefined });
        }}
      />
    );
  } else if (fixedUnit) {
    unitInput = <TextInput aria-label="Unit" disabled value={fixedUnit.unit ?? ''} />;
  } else {
    unitInput = (
      <TextInput
        aria-label="Unit"
        placeholder="Unit"
        disabled={readOnly}
        value={quantity.unit ?? ''}
        onChange={(e) => setQuantity({ unit: e.currentTarget.value, system: undefined, code: undefined })}
      />
    );
  }

  return (
    <Input.Wrapper label={label} labelProps={labelProps} error={error}>
      <Group gap="xs" grow wrap="nowrap">
        <NativeSelect
          aria-label="Comparator"
          disabled={readOnly}
          style={{ width: 80 }}
          data={QUANTITY_COMPARATORS}
          value={quantity.comparator ?? ''}
          onChange={(e) => setQuantity({ comparator: (e.currentTarget.value || undefined) as Quantity['comparator'] })}
        />
        <TextInput
          aria-label={ariaLabel ?? 'Value'}
          disabled={readOnly}
          type="number"
          step="any"
          placeholder={item.entryFormat || 'Value'}
          // A number field keeps what is typed (e.g. "1.") while the answer holds its number.
          value={quantity.value ?? ''}
          error={!!error}
          onWheel={(e: WheelEvent<HTMLInputElement>) => e.currentTarget.blur()}
          onChange={(e) => setQuantity({ value: e.currentTarget.value as unknown as number })}
        />
        {unitInput}
      </Group>
    </Input.Wrapper>
  );
}
