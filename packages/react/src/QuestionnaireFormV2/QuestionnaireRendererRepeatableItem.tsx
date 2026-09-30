// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack } from '@mantine/core';
import type { QuestionnaireResponse } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { Fragment } from 'react';
import { useQuestionnaireFormContext, useQuestionnaireResponseFormContext } from './QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem } from './QuestionnaireFormV2.utils';
import { getChoiceValueKey, isChoiceItemType, isReadOnlyFormItem } from './QuestionnaireFormV2.utils';
import { getAnswers, toChoiceText } from './QuestionnaireRenderer.utils';
import { QuestionnaireRendererAttachedTexts } from './QuestionnaireRendererAttachedTexts';
import { QuestionnaireRendererFollowUpItems } from './QuestionnaireRendererFollowUpItems';
import { QuestionnaireRendererItem } from './QuestionnaireRendererItem/QuestionnaireRendererItem';
import { QuestionnaireRendererRepeatingChoiceInput } from './QuestionnaireRendererItem/QuestionnaireRendererRepeatingChoiceInput';
import { QuestionnaireRendererSelectedItem } from './QuestionnaireRendererSelectedItem';
import { getAnswerValue, getNewAnswer, getResponseItemIndexes } from './QuestionnaireResponse.utils';

export interface QuestionnaireRendererRepeatableItemProps {
  readonly item: ExtendedQuestionnaireItem;
  /** The response path of the response items the question is answered in. */
  readonly context: string;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly index: number;
  readonly ignoreValidation?: boolean;
}

/**
 * A question with its answers: one input per answer, each with its follow-up items; a repeating choice question has one
 * input for all its answers, and follow-up items per selected option.
 * @param props - The QuestionnaireRendererRepeatableItem props.
 * @returns The QuestionnaireRendererRepeatableItem React node, or null until the draft response has the question.
 */
export function QuestionnaireRendererRepeatableItem(
  props: QuestionnaireRendererRepeatableItemProps
): JSX.Element | null {
  const { item, context, selectedItem, index, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();
  const responseForm = useQuestionnaireResponseFormContext();
  const response = responseForm.getValues() as QuestionnaireResponse;

  const indexes = getResponseItemIndexes(response, context, item.linkId);
  if (indexes.length === 0) {
    // A question added in the builder, until useSyncedResponse adds it to the draft response.
    return null;
  }
  const answersPath = `${context}.${indexes[0]}.answer`;
  const answers = getAnswers(responseForm, answersPath);
  const followUpProps = { item, selectedItem, ignoreValidation };
  const readOnly = isReadOnlyFormItem(form.getValues(), item);

  if (isChoiceItemType(item.type) && item.repeats) {
    return (
      <QuestionnaireRendererSelectedItem item={item} selectedItem={selectedItem} index={index}>
        <Stack gap="md">
          <Stack gap={4}>
            <QuestionnaireRendererRepeatingChoiceInput
              item={item}
              answersPath={answersPath}
              answerIndex={0}
              readOnly={readOnly}
            />
            <QuestionnaireRendererAttachedTexts item={item} />
          </Stack>
          {/* Each selected option has its own follow-up items. */}
          {answers.map((answer, answerIndex) => (
            <QuestionnaireRendererFollowUpItems
              key={`${item.linkId}-${getChoiceValueKey(getAnswerValue(item, answer))}-${answerIndex}`}
              answerPath={`${answersPath}.${answerIndex}`}
              label={toChoiceText(item.answerOption ?? [], getAnswerValue(item, answer))}
              {...followUpProps}
            />
          ))}
        </Stack>
      </QuestionnaireRendererSelectedItem>
    );
  }

  return (
    <QuestionnaireRendererSelectedItem item={item} selectedItem={selectedItem} index={index}>
      <Stack gap="md">
        {answers.map((_answer, answerIndex: number) => (
          <Fragment key={`${item.linkId}-${answerIndex}`}>
            <Stack gap={4}>
              <QuestionnaireRendererItem
                item={item}
                answersPath={answersPath}
                answerIndex={answerIndex}
                ignoreValidation={ignoreValidation}
                readOnly={readOnly}
                repeat={{
                  index: answerIndex,
                  count: answers.length,
                  onAdd: () =>
                    responseForm.insertListItem(answersPath, getNewAnswer(item, answers.length), answers.length),
                  onRemove: () => responseForm.removeListItem(answersPath, answerIndex),
                }}
              />
              <QuestionnaireRendererAttachedTexts item={item} />
            </Stack>
            <QuestionnaireRendererFollowUpItems answerPath={`${answersPath}.${answerIndex}`} {...followUpProps} />
          </Fragment>
        ))}
      </Stack>
    </QuestionnaireRendererSelectedItem>
  );
}
