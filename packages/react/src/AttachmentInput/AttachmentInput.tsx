// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button } from '@mantine/core';
import type { Attachment, OperationOutcome, Reference } from '@medplum/fhirtypes';
import type { JSX, MouseEvent } from 'react';
import { useState } from 'react';
import { AttachmentButton } from '../AttachmentButton/AttachmentButton';
import { AttachmentDisplay } from '../AttachmentDisplay/AttachmentDisplay';
import type { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import { killEvent } from '../utils/dom';

export interface AttachmentInputProps extends ComplexTypeInputProps<Attachment> {
  readonly arrayElement?: boolean;
  readonly securityContext?: Reference;
  readonly onChange?: (value: Attachment | undefined) => void;
  /** The allowed file types, as MIME types or wildcards (e.g. `image/*`). */
  readonly accept?: string[];
  /** The maximum file size, in bytes. */
  readonly maxSize?: number;
  /** Called when a file is not uploaded: not allowed, too large, or the upload failed. */
  readonly onUploadError?: (outcome: OperationOutcome) => void;
}

export function AttachmentInput(props: AttachmentInputProps): JSX.Element {
  const [value, setValue] = useState(props.defaultValue);

  function setValueWrapper(newValue: Attachment | undefined): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  if (value) {
    return (
      <>
        <AttachmentDisplay value={value} maxWidth={200} />
        <Button
          disabled={props.disabled}
          onClick={(e: MouseEvent) => {
            killEvent(e);
            setValueWrapper(undefined);
          }}
        >
          Remove
        </Button>
      </>
    );
  }

  return (
    <AttachmentButton
      disabled={props.disabled}
      securityContext={props.securityContext}
      accept={props.accept}
      maxSize={props.maxSize}
      onUpload={setValueWrapper}
      onUploadError={props.onUploadError}
    >
      {(props) => <Button {...props}>Upload...</Button>}
    </AttachmentButton>
  );
}
