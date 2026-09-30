// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { QuestionnaireResponse } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useContext } from 'react';
import { useQuestionnaireFormContext, useQuestionnaireResponseFormContext } from './QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem } from './QuestionnaireFormV2.utils';
import { evaluateEnableWhen, isShownInMode } from './QuestionnaireFormV2.utils';
import { QuestionnaireModeContext } from './QuestionnaireModeContext';
import { QuestionnaireRendererDisplay } from './QuestionnaireRendererDisplay';
import { QuestionnaireRendererGroup } from './QuestionnaireRendererGroup';
import { QuestionnaireRendererRepeatableItem } from './QuestionnaireRendererRepeatableItem';
import { QuestionnaireRendererSelectedItem } from './QuestionnaireRendererSelectedItem';

export interface QuestionnaireRendererItemArrayProps {
  readonly items: ExtendedQuestionnaireItem[];
  /** The response path of the response items the items are answered in, e.g. `item` or `item.0.item`. */
  readonly context: string;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly ignoreValidation?: boolean;
}

/**
 * A list of items, as shown: a group with its items, display text, or a question with its answers. Hidden items, items
 * disabled by their conditions and items not used in the mode are left out.
 * @param props - The QuestionnaireRendererItemArray props.
 * @returns The QuestionnaireRendererItemArray React node.
 */
export function QuestionnaireRendererItemArray(props: QuestionnaireRendererItemArrayProps): JSX.Element {
  const { items, context, selectedItem, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();
  const responseForm = useQuestionnaireResponseFormContext();
  const mode = useContext(QuestionnaireModeContext);
  const values = form.getValues();
  const response = responseForm.getValues() as QuestionnaireResponse;

  return (
    <>
      {items.map((item, index) => {
        if (
          item.hidden ||
          !evaluateEnableWhen(values, response, item, context) ||
          !isShownInMode(values, response, item, context, mode)
        ) {
          return null;
        }
        const key = `${context}-${item.linkId}`;
        const itemProps = { item, context, selectedItem, index, ignoreValidation };
        if (item.type === 'group') {
          return <QuestionnaireRendererGroup key={key} {...itemProps} />;
        }
        if (item.type === 'display') {
          return (
            <QuestionnaireRendererSelectedItem key={key} item={item} selectedItem={selectedItem} index={index}>
              <QuestionnaireRendererDisplay item={item} />
            </QuestionnaireRendererSelectedItem>
          );
        }
        return <QuestionnaireRendererRepeatableItem key={key} {...itemProps} />;
      })}
    </>
  );
}
