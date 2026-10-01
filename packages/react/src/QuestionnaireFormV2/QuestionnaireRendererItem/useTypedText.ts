// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { startTransition, useState } from 'react';

/**
 * Keeps a text field's text, so what is typed is shown straight away, and writes it as the answer in a transition:
 * the form re-renders on every answer (its conditions, calculated answers and other questions), and that no longer holds
 * up typing. The field follows the answer when it changes otherwise, e.g. when it is calculated or reset.
 * @param value - The answer's value, as the field shows it.
 * @param write - Writes the typed text as the answer.
 * @param numeric - True for a number field, whose text (e.g. "1." on the way to "1.5") stands for its number.
 * @returns The field's text, and the setter for what is typed.
 */
export function useTypedText(
  value: string | number | undefined | null,
  write: (text: string) => void,
  numeric = false
): [string, (text: string) => void] {
  const answerText = value === undefined || value === null ? '' : String(value);
  const [text, setText] = useState(answerText);
  const [previousAnswerText, setPreviousAnswerText] = useState(answerText);

  if (answerText !== previousAnswerText) {
    setPreviousAnswerText(answerText);
    if (!isTextOf(text, answerText, numeric)) {
      setText(answerText);
    }
  }

  const type = (typed: string): void => {
    setText(typed);
    startTransition(() => write(typed));
  };

  return [text, type];
}

/**
 * Returns true if the typed text stands for the answer: the same text, or for a number field the same number (or no
 * number yet, e.g. "-").
 * @param text - The typed text.
 * @param answerText - The answer, as text.
 * @param numeric - True for a number field.
 * @returns True if the text is the answer.
 */
function isTextOf(text: string, answerText: string, numeric: boolean): boolean {
  if (!numeric) {
    return text === answerText;
  }
  if (answerText === '') {
    return text.trim() === '' || Number.isNaN(Number(text));
  }
  return text.trim() !== '' && Number(text) === Number(answerText);
}
