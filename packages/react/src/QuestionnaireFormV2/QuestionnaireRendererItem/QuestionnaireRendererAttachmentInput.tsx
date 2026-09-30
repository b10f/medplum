// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Input } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import type { JSX } from 'react';
import { AttachmentInput } from '../../AttachmentInput/AttachmentInput';
import type { QuestionnaireRendererItemProps } from './QuestionnaireRendererItem';
import { getAnswerLabel } from './QuestionnaireRendererItem.utils';
import { useAnswer } from './useAnswer';

/**
 * An attachment answer, uploaded with Medplum's AttachmentInput: the file is stored as a Binary and the answer holds
 * its URL, as in Medplum's QuestionnaireForm.
 * @param props - The rendered answer props.
 * @returns The QuestionnaireRendererAttachmentInput React node.
 */
export function QuestionnaireRendererAttachmentInput(props: QuestionnaireRendererItemProps): JSX.Element {
  const { item, readOnly } = props;
  const { responseForm, answerPath, value, error, setValue } = useAnswer(props);
  const { label, labelProps } = getAnswerLabel(props);

  return (
    <Input.Wrapper label={label} labelProps={labelProps} error={error}>
      <Group py={4}>
        <AttachmentInput
          path=""
          name={answerPath}
          disabled={readOnly}
          // Files of another type, or too large, are not uploaded (mimeType, maxSize).
          accept={item.mimeType?.length ? item.mimeType : undefined}
          maxSize={item.maxSize ? Number(item.maxSize) : undefined}
          onUploadError={(outcome) => responseForm.setFieldError(answerPath, normalizeErrorString(outcome))}
          defaultValue={value && typeof value === 'object' ? value : undefined}
          onChange={(attachment) => setValue(attachment ?? '')}
        />
      </Group>
    </Input.Wrapper>
  );
}
