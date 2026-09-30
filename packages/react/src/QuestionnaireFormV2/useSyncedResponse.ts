// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { deepEquals } from '@medplum/core';
import type { QuestionnaireResponseItem } from '@medplum/fhirtypes';
import { useLayoutEffect, useRef } from 'react';
import type { QuestionnaireForm } from './QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem } from './QuestionnaireFormV2.utils';
import { getInitialAnswerKeys, removeResponseItems, syncResponseItems } from './QuestionnaireResponse.utils';

/**
 * Keeps the draft response in line with the items it answers (see syncResponseItems) as they are edited in the
 * builder, before the form is painted. A question whose initial answers change starts over from them.
 * @param responseForm - The draft response form.
 * @param items - The form items.
 */
export function useSyncedResponse(responseForm: QuestionnaireForm, items: ExtendedQuestionnaireItem[]): void {
  const initialAnswerKeys = useRef<Map<string, string>>(undefined);

  useLayoutEffect(() => {
    const keys = getInitialAnswerKeys(items);
    const previous = initialAnswerKeys.current;
    initialAnswerKeys.current = keys;
    const changed = new Set(
      [...keys].filter(([linkId, key]) => previous?.has(linkId) && previous.get(linkId) !== key).map(([id]) => id)
    );

    const current: QuestionnaireResponseItem[] = responseForm.getValues().item ?? [];
    const synced = syncResponseItems(items, changed.size > 0 ? removeResponseItems(current, changed) : current);
    if (!deepEquals(synced, current)) {
      responseForm.setFieldValue('item', synced);
    }
  });
}
