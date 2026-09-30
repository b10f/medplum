// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ComboboxItem } from '@mantine/core';
import { ActionIcon, Box, Group, Radio, Skeleton, Stack, Switch, Textarea, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { AsyncAutocompleteOption } from '../AsyncAutocomplete/AsyncAutocomplete';
import { AsyncAutocomplete } from '../AsyncAutocomplete/AsyncAutocomplete';
import { getValueByPath } from './QuestionnaireBuilderV2.utils';
import type { QuestionnaireForm } from './QuestionnaireFormContext';
import { useDebouncedFormValue } from './useDebouncedFormValue';

export interface FormTextInputProps {
  readonly form: QuestionnaireForm;
  readonly label: string;
  readonly description?: string;
  readonly context: string;
  readonly type?: 'text' | 'number' | 'date' | 'time' | 'datetime-local' | 'email' | 'url';
  readonly placeholder?: string;
  /** An error about the value; defaults to the form's error for it. */
  readonly error?: ReactNode;
  readonly step?: string;
  readonly min?: string;
  readonly max?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly onChange?: (value: string) => void;
}

export function FormTextInput(props: FormTextInputProps): JSX.Element {
  const {
    form,
    label,
    description,
    placeholder,
    error,
    type = 'text',
    step = '1',
    min = '1',
    max,
    context,
    required = false,
    disabled = false,
    onChange,
  } = props;
  const { formValue, setValue } = useDebouncedFormValue(form, context, onChange);
  const hasRange = type === 'number' || type === 'date' || type === 'time' || type === 'datetime-local';

  return (
    <TextInput
      key={context}
      label={label}
      description={description}
      placeholder={placeholder}
      type={type}
      step={type === 'number' ? step : undefined}
      min={hasRange ? min : undefined}
      max={hasRange ? max : undefined}
      disabled={disabled}
      withAsterisk={required}
      defaultValue={formValue}
      error={error ?? form.errors[context]}
      onChange={(e) => setValue(e.currentTarget.value)}
    />
  );
}

export interface FormTextareaProps {
  readonly form: QuestionnaireForm;
  readonly label: string;
  readonly description?: string;
  readonly context: string;
  readonly placeholder?: string;
  readonly rows?: number;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly onChange?: (value: string) => void;
}

export function FormTextarea(props: FormTextareaProps): JSX.Element {
  const {
    form,
    label,
    description,
    placeholder,
    context,
    rows = 3,
    required = false,
    disabled = false,
    onChange,
  } = props;
  const { formValue, setValue } = useDebouncedFormValue(form, context, onChange);

  return (
    <Textarea
      key={context}
      label={label}
      description={description}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      withAsterisk={required}
      defaultValue={formValue}
      error={form.errors[context]}
      onChange={(e) => setValue(e.currentTarget.value)}
    />
  );
}

export interface FormSwitchProps {
  readonly form: QuestionnaireForm;
  readonly label: string;
  readonly description?: string;
  readonly context: string;
  readonly disabled?: boolean;
  readonly onChange?: (value: boolean) => void;
}

export function FormSwitch(props: FormSwitchProps): JSX.Element {
  const { form, label, description, context, disabled = false, onChange } = props;

  return (
    <Switch
      key={context}
      label={label}
      description={description}
      disabled={disabled}
      {...form.getInputProps(context, { withError: true, withFocus: true, type: 'checkbox' })}
      onChange={(e) => {
        const checked = e.currentTarget.checked;
        form.setFieldValue(context, checked);
        onChange?.(checked);
      }}
    />
  );
}

export interface FormRadioGroupProps {
  readonly form: QuestionnaireForm;
  readonly label: string;
  readonly description?: string;
  readonly context: string;
  readonly options: { value: string; label: string }[];
  /** The option shown as selected while the form has no value. */
  readonly defaultValue?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly onChange?: (value: string) => void;
}

export function FormRadioGroup(props: FormRadioGroupProps): JSX.Element {
  const {
    form,
    label,
    description,
    context,
    options,
    defaultValue,
    required = false,
    disabled = false,
    onChange,
  } = props;
  const { defaultValue: _formDefaultValue, ...inputProps } = form.getInputProps(context, {
    withError: true,
    withFocus: true,
  });
  // An uncontrolled form gives no `value`; read the current one, so the default applies only while there is none.
  const value = getValueByPath(form.getValues(), context);

  return (
    <Radio.Group
      key={context}
      label={label}
      description={description}
      withAsterisk={required}
      {...inputProps}
      value={value || defaultValue || null}
      onChange={(value) => {
        form.setFieldValue(context, value);
        onChange?.(value);
      }}
    >
      <Stack gap="xs" mt="xs">
        {options.map((option) => (
          <Radio key={`${context}-${option.value}`} value={option.value} label={option.label} disabled={disabled} />
        ))}
      </Stack>
    </Radio.Group>
  );
}

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
      disabled={disabled}
      withAsterisk={required}
      error={form.errors[context]}
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

export interface FormFlatCollectionProps {
  readonly form: QuestionnaireForm;
  readonly context: string;
  readonly add: () => void;
  /** Shows the add button; false for a single value. */
  readonly addable?: boolean;
  readonly canAdd?: () => boolean;
  readonly disabled?: boolean;
  readonly children: (index: number) => ReactNode;
}

export function FormFlatCollection(props: FormFlatCollectionProps): JSX.Element {
  const { form, context, add, addable = true, canAdd = () => true, disabled = false, children } = props;
  const fields: any[] = getValueByPath(form.getValues(), context) || [];

  return (
    <>
      {fields.map((item: any, index: number) => (
        // The buttons line up with the (last) input: same height, bottom aligned.
        <Group key={item?.id ? `${context}-${item.id}` : `${context}-${index}`} align="flex-end" gap="xs">
          <Box flex={1}>{children(index)}</Box>
          <Group gap="xs">
            {addable && index === fields.length - 1 && (
              <ActionIcon
                variant="outline"
                size="input-sm"
                aria-label="Add"
                onClick={add}
                disabled={!canAdd() || disabled}
              >
                <IconPlus size={16} />
              </ActionIcon>
            )}
            {fields.length > 1 && (
              <ActionIcon
                variant="filled"
                color="red"
                size="input-sm"
                aria-label="Remove"
                onClick={() => form.removeListItem(context, index)}
                disabled={disabled}
              >
                <IconTrash size={16} />
              </ActionIcon>
            )}
          </Group>
        </Group>
      ))}
    </>
  );
}
