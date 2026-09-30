// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider } from '@mantine/core';
import type { JSX } from 'react';
import { Fragment } from 'react';
import { useQuestionnaireResponseFormContext } from './QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem } from './QuestionnaireFormV2.utils';
import { getResponseItemIndexes } from './QuestionnaireFormV2.utils';
import classes from './QuestionnaireRenderer.module.css';
import { addRepetition, isChoiceTable, isGroupTable } from './QuestionnaireRenderer.utils';
import { QuestionnaireRendererChoiceTable } from './QuestionnaireRendererChoiceTable';
import { QuestionnaireRendererGroupTable } from './QuestionnaireRendererGroupTable';
import { QuestionnaireRendererItemArray } from './QuestionnaireRendererItemArray';
import { QuestionnaireRendererLabel } from './QuestionnaireRendererLabel';
import { QuestionnaireRendererRequiredGroupError } from './QuestionnaireRendererRequiredGroupError';
import { QuestionnaireRendererSelectedItem } from './QuestionnaireRendererSelectedItem';

export interface QuestionnaireRendererGroupProps {
  readonly item: ExtendedQuestionnaireItem;
  /** The response path of the response items the group is answered in. */
  readonly context: string;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly index: number;
  readonly ignoreValidation?: boolean;
}

export function QuestionnaireRendererGroup(props: QuestionnaireRendererGroupProps): JSX.Element {
  const { item, context, selectedItem, index, ignoreValidation } = props;
  const responseForm = useQuestionnaireResponseFormContext();

  if (isGroupTable(item)) {
    return <QuestionnaireRendererGroupTable {...props} />;
  }

  const repetitions = getResponseItemIndexes(responseForm.getValues(), context, item.linkId);
  const hasItems = (item.item ?? []).length > 0;

  return (
    <QuestionnaireRendererSelectedItem item={item} selectedItem={selectedItem} index={index}>
      {!hasItems && (
        <>
          <QuestionnaireRendererLabel item={item} />
          <Divider my="xs" />
        </>
      )}

      {repetitions.map((repetition, repetitionIndex) => {
        const repetitionContext = `${context}.${repetition}.item`;
        return (
          <Fragment key={`${item.linkId}-${repetitionIndex}`}>
            {hasItems && (
              <>
                <QuestionnaireRendererLabel
                  item={item}
                  repeat={{
                    index: repetitionIndex,
                    count: repetitions.length,
                    onAdd: () => addRepetition(responseForm, context, item.linkId),
                    onRemove: () => responseForm.removeListItem(context, repetition),
                  }}
                />
                <Divider my="xs" />
              </>
            )}

            {isChoiceTable(item) ? (
              <QuestionnaireRendererChoiceTable
                group={item}
                context={repetitionContext}
                transposed={item.itemControl?.code === 'htable'}
                ignoreValidation={ignoreValidation}
              />
            ) : (
              <div className={classes.groupAnswers}>
                <QuestionnaireRendererItemArray
                  items={item.item ?? []}
                  context={repetitionContext}
                  selectedItem={selectedItem}
                  ignoreValidation={ignoreValidation}
                />
              </div>
            )}
          </Fragment>
        );
      })}
      <QuestionnaireRendererRequiredGroupError item={item} context={context} />
    </QuestionnaireRendererSelectedItem>
  );
}
