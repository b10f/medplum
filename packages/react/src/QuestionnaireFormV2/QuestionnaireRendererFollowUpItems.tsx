// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text } from '@mantine/core';
import type { QuestionnaireResponse } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useContext } from 'react';
import { useQuestionnaireFormContext, useQuestionnaireResponseFormContext } from './QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem } from './QuestionnaireFormV2.utils';
import {
  evaluateEnableWhen,
  getAnswerValue,
  getValueByPath,
  isEmptyAnswerValue,
  isShownInMode,
} from './QuestionnaireFormV2.utils';
import { QuestionnaireModeContext } from './QuestionnaireModeContext';
import classes from './QuestionnaireRenderer.module.css';
import { QuestionnaireRendererItemArray } from './QuestionnaireRendererItemArray';

export interface QuestionnaireRendererFollowUpItemsProps {
  /** The question the items are follow-up items of. */
  readonly item: ExtendedQuestionnaireItem;
  /** The response path of the answer the items belong to. */
  readonly answerPath: string;
  /** Names the answer the items belong to, when a question has several answers. */
  readonly label?: string;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly ignoreValidation?: boolean;
}

/**
 * The follow-up items of one answer of a question, shown once the question is answered.
 * @param props - The QuestionnaireRendererFollowUpItems props.
 * @returns The QuestionnaireRendererFollowUpItems React node, or null when none are shown.
 */
export function QuestionnaireRendererFollowUpItems(props: QuestionnaireRendererFollowUpItemsProps): JSX.Element | null {
  const { item, answerPath, label, selectedItem, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();
  const responseForm = useQuestionnaireResponseFormContext();
  const mode = useContext(QuestionnaireModeContext);
  const values = form.getValues();
  const response = responseForm.getValues() as QuestionnaireResponse;

  if (isEmptyAnswerValue(getAnswerValue(item, getValueByPath(response, answerPath)))) {
    return null;
  }

  const context = `${answerPath}.item`;
  const shownItems = (item.item ?? []).filter(
    (child) =>
      !child.hidden &&
      evaluateEnableWhen(values, response, child, context) &&
      isShownInMode(values, response, child, context, mode)
  );

  if (shownItems.length === 0) {
    return null;
  }

  return (
    <div className={classes.groupAnswers}>
      {label && (
        <Text size="sm" c="dimmed" mb="xs">
          {label}
        </Text>
      )}
      <QuestionnaireRendererItemArray
        items={shownItems}
        context={context}
        selectedItem={selectedItem}
        ignoreValidation={ignoreValidation}
      />
    </div>
  );
}
