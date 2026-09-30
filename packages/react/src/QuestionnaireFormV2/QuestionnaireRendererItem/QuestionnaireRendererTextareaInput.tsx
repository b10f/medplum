// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Textarea } from '@mantine/core';
import type { JSX } from 'react';
import type { QuestionnaireRendererItemProps } from './QuestionnaireRendererItem';
import { getAnswerLabel } from './QuestionnaireRendererItem.utils';
import { useAnswer } from './useAnswer';

export function QuestionnaireRendererTextareaInput(props: QuestionnaireRendererItemProps): JSX.Element {
  const { item, ignoreValidation, readOnly } = props;
  const { value, error, setValue } = useAnswer(props);

  return (
    <Textarea
      {...getAnswerLabel(props)}
      disabled={readOnly}
      placeholder={item.entryFormat}
      rows={6}
      maxLength={!ignoreValidation && item.maxLength ? item.maxLength : undefined}
      value={value ?? ''}
      error={error}
      onChange={(e) => setValue(e.currentTarget.value)}
    />
  );
}
