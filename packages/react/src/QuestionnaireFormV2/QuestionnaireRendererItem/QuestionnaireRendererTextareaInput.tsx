// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Textarea } from '@mantine/core';
import type { JSX } from 'react';
import type { QuestionnaireRendererItemProps } from './QuestionnaireRendererItem';
import { getAnswerLabel } from './QuestionnaireRendererItem.utils';
import { useAnswer } from './useAnswer';
import { useTypedText } from './useTypedText';

export function QuestionnaireRendererTextareaInput(props: QuestionnaireRendererItemProps): JSX.Element {
  const { item, ignoreValidation, readOnly } = props;
  const { value, error, setValue } = useAnswer(props);
  const [text, setText] = useTypedText(value, setValue);

  return (
    <Textarea
      {...getAnswerLabel(props)}
      disabled={readOnly}
      placeholder={item.entryFormat}
      rows={6}
      maxLength={!ignoreValidation && item.maxLength ? item.maxLength : undefined}
      value={text}
      error={error}
      onChange={(e) => setText(e.currentTarget.value)}
    />
  );
}
