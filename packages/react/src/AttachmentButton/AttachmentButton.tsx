// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, normalizeOperationOutcome } from '@medplum/core';
import type { Attachment, OperationOutcome, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { ChangeEvent, JSX, MouseEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { killEvent } from '../utils/dom';

export interface AttachmentButtonProps {
  readonly securityContext?: Reference;
  readonly onUpload: (attachment: Attachment) => void;
  readonly onUploadStart?: () => void;
  readonly onUploadProgress?: (e: ProgressEvent) => void;
  readonly onUploadError?: (outcome: OperationOutcome) => void;
  children(props: { disabled?: boolean; onClick(e: MouseEvent): void }): ReactNode;
  readonly disabled?: boolean;
  /**
   * The allowed file types, as MIME types (e.g. `image/png`) or wildcards (e.g. `image/*`). Other files are not uploaded:
   * they are reported to `onUploadError`.
   */
  readonly accept?: string[];
  /** The maximum file size, in bytes. Larger files are not uploaded: they are reported to `onUploadError`. */
  readonly maxSize?: number;
}

export function AttachmentButton(props: AttachmentButtonProps): JSX.Element {
  const medplum = useMedplum();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onClick(e: MouseEvent): void {
    killEvent(e);
    fileInputRef.current?.click();
  }

  function onFileChange(e: ChangeEvent): void {
    killEvent(e);
    const files = (e.target as HTMLInputElement).files;
    if (files) {
      Array.from(files).forEach(processFile);
    }
  }

  /**
   * Processes a single file.
   * @param file - The file descriptor.
   */
  function processFile(file: File): void {
    if (!file) {
      return;
    }

    const fileName = file.name;
    if (!fileName) {
      return;
    }

    // The file picker only suggests the allowed types, so they are checked here too.
    const rejection = getFileRejection(file, props.accept, props.maxSize);
    if (rejection) {
      props.onUploadError?.(badRequest(rejection));
      return;
    }

    if (props.onUploadStart) {
      props.onUploadStart();
    }

    medplum
      .createAttachment({
        data: file,
        contentType: file.type || 'application/octet-stream',
        filename: file.name,
        securityContext: props.securityContext,
        onProgress: props.onUploadProgress,
      })
      .then((attachment: Attachment) => props.onUpload(attachment))
      .catch((err) => {
        if (props.onUploadError) {
          props.onUploadError(normalizeOperationOutcome(err));
        }
      });
  }

  return (
    <>
      <input
        disabled={props.disabled}
        type="file"
        data-testid="upload-file-input"
        accept={props.accept?.length ? props.accept.join(',') : undefined}
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={(e) => onFileChange(e)}
      />
      {/* eslint-disable-next-line react-hooks/refs */}
      {props.children({ onClick, disabled: props.disabled })}
    </>
  );
}

/**
 * Returns why a file cannot be uploaded: a type that is not allowed, or a size over the limit.
 * @param file - The file.
 * @param accept - The allowed MIME types or wildcards (e.g. `image/*`).
 * @param maxSize - The maximum size, in bytes.
 * @returns The reason, or undefined when the file can be uploaded.
 */
function getFileRejection(file: File, accept: string[] | undefined, maxSize: number | undefined): string | undefined {
  if (accept?.length) {
    const type = (file.type || '').toLowerCase();
    const allowed = accept.some((pattern) => {
      const lower = pattern.trim().toLowerCase();
      return lower.endsWith('/*') ? type.startsWith(lower.slice(0, -1)) : type === lower;
    });
    if (!allowed) {
      return `${file.name} is not an allowed file type (${accept.join(', ')})`;
    }
  }
  if (maxSize !== undefined && file.size > maxSize) {
    return `${file.name} is larger than ${formatFileSize(maxSize)}`;
  }
  return undefined;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
  }
  if (bytes >= 1024) {
    return `${Number((bytes / 1024).toFixed(1))} KB`;
  }
  return `${bytes} bytes`;
}
