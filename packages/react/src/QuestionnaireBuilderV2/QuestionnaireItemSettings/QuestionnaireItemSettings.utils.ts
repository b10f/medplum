// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Coding } from '@medplum/fhirtypes';
import type { QuestionnaireForm } from '../../QuestionnaireFormV2/QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import type { ItemSettingsCodes } from './useItemSettingsCodes';

/** The props of each section of the settings panel. */
export interface QuestionnaireItemSectionProps {
  readonly selectedItem: ExtendedQuestionnaireItem;
  readonly disabled: boolean;
  readonly codes: ItemSettingsCodes;
}

/** The props of a settings input for one item's fields. */
export interface QuestionnaireItemFieldProps {
  readonly form: QuestionnaireForm;
  /** The form path of the item. */
  readonly path: string;
  readonly disabled?: boolean;
}

export function toSelectData(codings: Coding[]): { value: string; label: string }[] {
  return codings.map((coding) => ({ value: coding.code as string, label: coding.display ?? (coding.code as string) }));
}

export function getTitle(selectedItem: ExtendedQuestionnaireItem | undefined, type: string): string {
  if (!selectedItem) {
    return ' ';
  }
  if (type === 'display' || type === 'group') {
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  }
  return 'Question';
}

/**
 * The input type for a question's value (an initial value, or a minimum or maximum), by question type.
 * @param type - The question type.
 * @returns The input type.
 */
export function getValueInputType(type: string): 'number' | 'date' | 'datetime-local' | 'time' | 'text' {
  if (type === 'integer' || type === 'decimal' || type === 'quantity') {
    return 'number';
  }
  if (type === 'date') {
    return 'date';
  }
  if (type === 'dateTime') {
    return 'datetime-local';
  }
  if (type === 'time') {
    return 'time';
  }
  return 'text';
}

export function getPlainOptionInputType(valueType: string | undefined): 'number' | 'date' | 'time' | 'text' {
  if (valueType === 'valueInteger') {
    return 'number';
  }
  if (valueType === 'valueDate') {
    return 'date';
  }
  if (valueType === 'valueTime') {
    return 'time';
  }
  return 'text';
}

/**
 * The item control an item is rendered with when it has none: a group as a list, a number in a text box, a choice as
 * radio buttons (checkboxes when it repeats).
 * @param type - The item type.
 * @param repeats - True if the item repeats.
 * @returns The item control code, or null when the renderer's default has no item control of its own.
 */
export function getDefaultItemControl(type: string, repeats: boolean): string | null {
  if (type === 'group') {
    return 'list';
  }
  if (type === 'display') {
    return 'inline';
  }
  if (type === 'choice' || type === 'open-choice') {
    return repeats ? 'check-box' : 'radio-button';
  }
  if (type === 'integer' || type === 'decimal') {
    return 'text-box';
  }
  return null;
}

export function getEnableWhenAnswerInputType(
  type: string
): 'number' | 'date' | 'datetime-local' | 'time' | 'text' | undefined {
  if (type === 'integer' || type === 'decimal' || type === 'quantity') {
    return 'number';
  }
  if (type === 'date' || type === 'time') {
    return type;
  }
  if (type === 'dateTime') {
    return 'datetime-local';
  }
  if (type === 'string' || type === 'text' || type === 'url') {
    return 'text';
  }
  return undefined;
}
