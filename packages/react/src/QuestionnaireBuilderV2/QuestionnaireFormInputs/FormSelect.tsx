// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ComboboxItem } from '@mantine/core';
import { Skeleton } from '@mantine/core';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { AsyncAutocompleteOption } from '../../AsyncAutocomplete/AsyncAutocomplete';
import { AsyncAutocomplete } from '../../AsyncAutocomplete/AsyncAutocomplete';
import type { QuestionnaireForm } from '../../QuestionnaireFormV2/QuestionnaireFormContext';
import { getValueByPath } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { UnavailableNote } from '../../UnavailableNote/UnavailableNote';

export interface FormSelectProps {
  readonly form: QuestionnaireForm;
  readonly label: string;
  readonly description?: string;
  readonly context: string;
  readonly data: ComboboxItem[];
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  /** Why the options could not be loaded, e.g. their value set is not on the server; the select is then disabled. */
  readonly unavailable?: string;
  /** Overrides the form value shown in the select, for values that are not stored as a plain string. */
  readonly value?: string | null;
  /** Overrides writing the selected value to the form. */
  readonly onChange?: (value: string | null) => void;
}

/**
 * A single-value select over a fixed option list, rendered with Medplum's AsyncAutocomplete so it matches
 * CodeInput and CodingInput.
 * @param props - The FormSelect React props.
 * @returns The FormSelect React node.
 */
export function FormSelect(props: FormSelectProps): JSX.Element {
  const {
    form,
    label,
    description,
    context,
    data,
    placeholder,
    required = false,
    disabled = false,
    loading = false,
    unavailable,
    value,
    onChange,
  } = props;
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const loadOptions = useCallback(async (input: string): Promise<ComboboxItem[]> => {
    const search = input.toLowerCase();
    return dataRef.current.filter((item) => item.label.toLowerCase().includes(search));
  }, []);

  if (loading) {
    return <Skeleton height={36} />;
  }

  const currentValue = value === undefined ? getValueByPath(form.getValues(), context) : value;
  const selected = data.find((item) => item.value === currentValue);

  return (
    <AsyncAutocomplete<ComboboxItem>
      key={context}
      name={context}
      label={label}
      description={description}
      placeholder={placeholder}
      disabled={disabled || !!unavailable}
      withAsterisk={required}
      error={
        unavailable ? (
          <UnavailableNote text="This field is unavailable." color="red" message={unavailable} />
        ) : (
          form.errors[context]
        )
      }
      maxValues={1}
      clearable
      defaultValue={selected}
      toOption={toComboboxOption}
      loadOptions={loadOptions}
      onChange={(items) => {
        const newValue = items[0]?.value ?? null;
        if (onChange) {
          onChange(newValue);
        } else {
          form.setFieldValue(context, newValue);
        }
      }}
    />
  );
}

function toComboboxOption(item: ComboboxItem): AsyncAutocompleteOption<ComboboxItem> {
  return { ...item, resource: item };
}
