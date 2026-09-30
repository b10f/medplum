// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';
import type { QuestionnaireForm } from '../QuestionnaireFormContext';
import { useQuestionnaireResponseFormContext } from '../QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem } from '../QuestionnaireFormV2.utils';
import { getValueByPath } from '../QuestionnaireFormV2.utils';
import { setAnswerValue } from '../QuestionnaireRenderer.utils';
import { getAnswerValue } from '../QuestionnaireResponse.utils';

/** Which answer an input shows and writes. */
export interface AnswerProps {
  readonly item: ExtendedQuestionnaireItem;
  /** The response path of the question's answers. */
  readonly answersPath: string;
  readonly answerIndex: number;
  readonly ignoreValidation?: boolean;
}

export interface Answer {
  readonly responseForm: QuestionnaireForm;
  /** The response path of the answer. */
  readonly answerPath: string;
  /** The answer's value, as its input holds it. */
  readonly value: any;
  readonly error: ReactNode;
  /** Writes a new value, and shows its constraint error. */
  readonly setValue: (value: any) => void;
}

/**
 * Reads the answer an input shows and writes.
 * @param props - The question and the answer's position.
 * @returns The answer.
 */
export function useAnswer(props: AnswerProps): Answer {
  const { item, answersPath, answerIndex, ignoreValidation } = props;
  const responseForm = useQuestionnaireResponseFormContext();
  const answerPath = `${answersPath}.${answerIndex}`;
  return {
    responseForm,
    answerPath,
    value: getAnswerValue(item, getValueByPath(responseForm.getValues(), answerPath)),
    error: responseForm.errors[answerPath],
    setValue: (value) => setAnswerValue(responseForm, item, answerPath, value, ignoreValidation),
  };
}
