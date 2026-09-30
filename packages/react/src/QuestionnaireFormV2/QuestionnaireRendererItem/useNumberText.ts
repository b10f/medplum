// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';

/**
 * Keeps what is typed into a number field, e.g. "1." on the way to "1.5", while the answer holds its number.
 * @param value - The answer's number.
 * @returns The field's value, and the setter for what is typed.
 */
export function useNumberText(value: number | undefined): [string | number, (text: string | number) => void] {
  const [text, setText] = useState<string | number>(value ?? '');
  const typed = text !== '' && (Number(text) === value || (value === undefined && Number.isNaN(Number(text))));
  return [typed ? text : (value ?? ''), setText];
}
