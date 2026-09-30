// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { deepEquals } from '@medplum/core';
import type { QuestionnaireResponse, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import type { QuestionnaireForm } from './QuestionnaireFormContext';
import { getCalculatedAnswers, getValueByPath } from './QuestionnaireFormV2.utils';

export interface CalculationState {
  /** The form values the answers were last calculated from. */
  values?: Record<string, any>;
  /** The draft response the answers were last calculated from. */
  evaluated?: Record<string, any>;
  /** The draft response after the calculated answers were last written. */
  written?: Record<string, any>;
  /** How many calculations in a row were caused only by calculated answers. */
  rounds: number;
  /** Expressions that failed, by the response path of their answer. */
  errors: Record<string, string>;
}

/** Stops calculated answers that depend on each other in a loop from being recalculated forever. */
const MAX_CALCULATION_ROUNDS = 10;

/**
 * Keeps the answers of questions with a calculatedExpression up to date: after every change, recalculates them and
 * writes those that changed. Answers calculated from other calculated answers follow in the next round. Failed
 * expressions are shown as their answer's error.
 * @param form - The questionnaire form.
 * @param responseForm - The draft response form.
 * @param enabled - False to leave the answers as they are.
 * @returns The calculation state, with the current expression errors.
 */
export function useCalculatedAnswers(
  form: QuestionnaireForm,
  responseForm: QuestionnaireForm,
  enabled: boolean
): RefObject<CalculationState> {
  const state = useRef<CalculationState>({ rounds: 0, errors: {} });

  useEffect(() => {
    const current = state.current;
    const values = form.getValues();
    const response = responseForm.getValues();
    if (!enabled || (values === current.values && response === current.evaluated)) {
      return;
    }
    current.rounds = values === current.values && response === current.written ? current.rounds + 1 : 0;
    current.values = values;
    current.evaluated = response;
    if (current.rounds >= MAX_CALCULATION_ROUNDS) {
      return;
    }

    const errors: Record<string, string> = {};
    for (const { answerPath, answer, error } of getCalculatedAnswers(values, response as QuestionnaireResponse)) {
      if (error) {
        errors[answerPath] = error;
        continue;
      }
      const existing: QuestionnaireResponseItemAnswer | undefined = getValueByPath(
        responseForm.getValues(),
        answerPath
      );
      const calculated = { ...(existing?.item && { item: existing.item }), ...answer };
      if (!deepEquals(existing ?? {}, calculated)) {
        responseForm.setFieldValue(answerPath, calculated);
      }
    }
    for (const answerPath of Object.keys(current.errors)) {
      if (!errors[answerPath]) {
        responseForm.clearFieldError(answerPath);
      }
    }
    for (const [answerPath, error] of Object.entries(errors)) {
      if (responseForm.errors[answerPath] !== error) {
        responseForm.setFieldError(answerPath, error);
      }
    }
    current.errors = errors;
    if (responseForm.getValues() !== response) {
      current.written = responseForm.getValues();
    }
  });

  return state;
}
