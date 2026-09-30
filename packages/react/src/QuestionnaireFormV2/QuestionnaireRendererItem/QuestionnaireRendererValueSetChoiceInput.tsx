// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { ValueSetAutocomplete } from '../../ValueSetAutocomplete/ValueSetAutocomplete';
import { setChoiceAnswers, toValueSetContains } from '../QuestionnaireRenderer.utils';
import type { QuestionnaireRendererItemProps } from './QuestionnaireRendererItem';
import { getAnswerLabel } from './QuestionnaireRendererItem.utils';
import { useAnswer } from './useAnswer';

export interface QuestionnaireRendererValueSetChoiceInputProps extends QuestionnaireRendererItemProps {
  readonly values: any[];
  readonly multiple?: boolean;
}

/**
 * A choice question whose answers come from a value set (answerValueSet): the codes are searched as the respondent
 * types, as in Medplum's QuestionnaireForm. An open-choice question also takes text that is not in the value set.
 * @param props - The QuestionnaireRendererValueSetChoiceInput props.
 * @returns The QuestionnaireRendererValueSetChoiceInput React node.
 */
export function QuestionnaireRendererValueSetChoiceInput(
  props: QuestionnaireRendererValueSetChoiceInputProps
): JSX.Element {
  const { item, answersPath, readOnly, values, multiple } = props;
  const { responseForm, answerPath, setValue } = useAnswer(props);
  const errorPath = multiple ? answersPath : answerPath;
  const isOpen = item.type === 'open-choice';

  return (
    <ValueSetAutocomplete
      {...getAnswerLabel(props)}
      binding={item.answerValueSet}
      creatable={isOpen}
      clearable
      disabled={readOnly}
      maxValues={multiple ? undefined : 1}
      placeholder={isOpen ? 'Search or type an answer' : 'Search'}
      defaultValue={values.map(toValueSetContains)}
      error={responseForm.errors[errorPath]}
      onChange={(selected) => {
        // A code the respondent typed (not in the value set) has no system: it is a typed answer.
        const newValues = selected.map((entry) =>
          entry.system
            ? { system: entry.system, code: entry.code, display: entry.display }
            : (entry.display ?? entry.code)
        );
        if (multiple) {
          setChoiceAnswers(responseForm, item, answersPath, newValues);
        } else {
          setValue(newValues[0] ?? '');
        }
      }}
    />
  );
}
