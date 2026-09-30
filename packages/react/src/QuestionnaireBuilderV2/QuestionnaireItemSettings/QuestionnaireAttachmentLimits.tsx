// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { NumberInput, TagsInput } from '@mantine/core';
import type { JSX } from 'react';
import { useState } from 'react';
import { getValueByPath } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import type { QuestionnaireItemFieldProps } from './QuestionnaireItemSettings.utils';

const MEGABYTE = 1024 * 1024;

/**
 * Common file types, suggested for attachments; others can be typed. The mimeType extension is bound (required) to all
 * MIME types (BCP 13), which cannot be listed, and wildcards such as image/* are not MIME types.
 */
const COMMON_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/heic',
  'application/pdf',
  'text/plain',
  'audio/mpeg',
  'video/mp4',
];

/** A MIME type: type/subtype, without wildcards or parameters. */
const MIME_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

/**
 * The file types and maximum size an attachment question accepts (mimeType, maxSize). Other files are not uploaded.
 * @param props - The QuestionnaireAttachmentLimits React props.
 * @returns The QuestionnaireAttachmentLimits React node.
 */
export function QuestionnaireAttachmentLimits(props: QuestionnaireItemFieldProps): JSX.Element {
  const { form, path, disabled } = props;
  const mimeTypes: string[] = getValueByPath(form.getValues(), `${path}.mimeType`) ?? [];
  const maxSize: number | null = getValueByPath(form.getValues(), `${path}.maxSize`);
  const [invalidType, setInvalidType] = useState<string>();

  return (
    <>
      <TagsInput
        label="Allowed file types"
        description="MIME types, e.g. image/png or application/pdf. With none, any file can be uploaded."
        placeholder="Add a file type"
        data={COMMON_FILE_TYPES}
        disabled={disabled}
        value={mimeTypes}
        error={invalidType && `${invalidType} is not a MIME type (type/subtype, e.g. image/png)`}
        onChange={(types) => {
          const cleaned = types.map((type) => type.trim().toLowerCase());
          setInvalidType(cleaned.find((type) => !MIME_TYPE_PATTERN.test(type)));
          form.setFieldValue(
            `${path}.mimeType`,
            cleaned.filter((type) => MIME_TYPE_PATTERN.test(type))
          );
        }}
      />
      <NumberInput
        label="Maximum size (MB)"
        description="Larger files are not uploaded. With none, any size can be uploaded."
        min={0}
        decimalScale={2}
        disabled={disabled}
        value={maxSize ? Number((maxSize / MEGABYTE).toFixed(2)) : ''}
        onChange={(megabytes) =>
          form.setFieldValue(`${path}.maxSize`, megabytes ? Math.round(Number(megabytes) * MEGABYTE) : null)
        }
      />
    </>
  );
}
