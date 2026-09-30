// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { TextInput } from '@mantine/core';
import type { JSX } from 'react';
import type { QuestionnaireRendererItemProps } from './QuestionnaireRendererItem';
import { getAnswerLabel } from './QuestionnaireRendererItem.utils';
import { useAnswer } from './useAnswer';

export function QuestionnaireRendererDateTimeInput(props: QuestionnaireRendererItemProps): JSX.Element {
  const { item, readOnly } = props;
  const { value, error, setValue } = useAnswer(props);
  const inputType = item.type === 'dateTime' ? 'datetime-local' : item.type;

  return (
    <TextInput
      {...getAnswerLabel(props)}
      disabled={readOnly}
      type={inputType}
      value={value ?? ''}
      error={error}
      onChange={(e) => setValue(e.currentTarget.value)}
    />
  );
}
