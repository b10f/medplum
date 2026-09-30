// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Input } from '@mantine/core';
import type { QuestionnaireResponse } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useQuestionnaireFormContext, useQuestionnaireResponseFormContext } from './QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem } from './QuestionnaireFormV2.utils';
import { getGroupErrorKey, getRequiredGroupError } from './QuestionnaireFormV2.utils';

/**
 * Shows a required group's error once validation has found it, until the group is answered.
 * @param props - The QuestionnaireRendererRequiredGroupError props.
 * @param props.item - The group.
 * @param props.context - The response path of the response items the group is answered in.
 * @returns The error, or null.
 */
export function QuestionnaireRendererRequiredGroupError(props: {
  readonly item: ExtendedQuestionnaireItem;
  readonly context: string;
}): JSX.Element | null {
  const { item, context } = props;
  const form = useQuestionnaireFormContext();
  const responseForm = useQuestionnaireResponseFormContext();
  const message =
    responseForm.errors[getGroupErrorKey(context, item.linkId)] &&
    getRequiredGroupError(form.getValues(), responseForm.getValues() as QuestionnaireResponse, item, context);
  return message ? <Input.Error mt="xs">{message}</Input.Error> : null;
}
