// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { UseForm, UseFormReturnType } from '@mantine/form';
import { createFormContext } from '@mantine/form';
import type { FC, ReactNode } from 'react';

// Mantine form derives dotted path types 5 levels deep; on the FHIR Questionnaire type that expands through
// every reachable FHIR type (contained, extension, value[x]) and tsc never finishes. Cast at the boundaries instead.
export type QuestionnaireFormValues = Record<string, any>;
export type QuestionnaireForm = UseFormReturnType<QuestionnaireFormValues>;

const [provider, useFormContext, useForm] = createFormContext<QuestionnaireFormValues>();

export const QuestionnaireFormProvider: FC<{ readonly form: QuestionnaireForm; readonly children: ReactNode }> =
  provider;
export const useQuestionnaireFormContext: () => QuestionnaireForm = useFormContext;
export const useQuestionnaireForm: UseForm<QuestionnaireFormValues> = useForm;
