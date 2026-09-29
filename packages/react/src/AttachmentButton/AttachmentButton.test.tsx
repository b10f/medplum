// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button } from '@mantine/core';
import type { Attachment } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { AttachmentButton } from './AttachmentButton';

const medplum = new MockClient();

describe('AttachmentButton', () => {
  const setup = (children: ReactNode): void => {
    render(<MedplumProvider medplum={medplum}>{children}</MedplumProvider>);
  };

  test('Null files', async () => {
    const results: Attachment[] = [];

    setup(
      <AttachmentButton onUpload={(attachment: Attachment) => results.push(attachment)}>
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    await act(async () => {
      fireEvent.change(screen.getByText('Upload'), { target: {} });
    });

    expect(results.length).toEqual(0);
  });

  test('Null file element', async () => {
    const results: Attachment[] = [];

    setup(
      <AttachmentButton onUpload={(attachment: Attachment) => results.push(attachment)}>
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    await act(async () => {
      fireEvent.change(screen.getByText('Upload'), {
        target: { files: [null] },
      });
    });

    expect(results.length).toEqual(0);
  });

  test('File without filename', async () => {
    const results: Attachment[] = [];

    setup(
      <AttachmentButton onUpload={(attachment: Attachment) => results.push(attachment)}>
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    await act(async () => {
      fireEvent.change(screen.getByText('Upload'), {
        target: { files: [{}] },
      });
    });

    expect(results.length).toEqual(0);
  });

  test('Upload media', async () => {
    const results: Attachment[] = [];

    setup(
      <AttachmentButton onUpload={(attachment: Attachment) => results.push(attachment)}>
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    await act(async () => {
      const files = [new File(['hello'], 'hello.txt', { type: 'text/plain' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    expect(results.length).toEqual(1);
  });

  test('Click button', async () => {
    const results: Attachment[] = [];

    setup(
      <AttachmentButton onUpload={(attachment: Attachment) => results.push(attachment)}>
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Upload'));
    });
  });

  test('Error handling', async () => {
    const errorFn = vi.fn();

    setup(
      <AttachmentButton onUpload={console.log} onUploadError={errorFn}>
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    await act(async () => {
      const files = [new File(['exe'], 'hello.exe', { type: 'application/exe' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    expect(errorFn).toHaveBeenCalledWith({
      resourceType: 'OperationOutcome',
      issue: [{ code: 'invalid', details: { text: 'Invalid file type' }, severity: 'error' }],
    });
  });

  test('Custom text', async () => {
    setup(
      <AttachmentButton onUpload={console.log}>{(props) => <Button {...props}>My button</Button>}</AttachmentButton>
    );

    expect(screen.getByText('My button')).toBeInTheDocument();
  });

  test('Allowed file types', async () => {
    const results: Attachment[] = [];
    const errorFn = vi.fn();

    setup(
      <AttachmentButton
        accept={['image/*', 'application/pdf']}
        onUpload={(attachment: Attachment) => results.push(attachment)}
        onUploadError={errorFn}
      >
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    const input = screen.getByTestId('upload-file-input');
    expect(input).toHaveAttribute('accept', 'image/*,application/pdf');

    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['hello'], 'hello.txt', { type: 'text/plain' })] } });
    });
    expect(results.length).toEqual(0);
    expect(errorFn.mock.calls[0][0].issue[0].details.text).toBe(
      'hello.txt is not an allowed file type (image/*, application/pdf)'
    );

    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['png'], 'photo.png', { type: 'image/png' })] } });
    });
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['pdf'], 'card.pdf', { type: 'application/pdf' })] } });
    });
    expect(results.length).toEqual(2);
  });

  test('Maximum size', async () => {
    const results: Attachment[] = [];
    const errorFn = vi.fn();

    setup(
      <AttachmentButton
        maxSize={4}
        onUpload={(attachment: Attachment) => results.push(attachment)}
        onUploadError={errorFn}
      >
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files: [new File(['hello'], 'hello.txt', { type: 'text/plain' })] },
      });
    });
    expect(results.length).toEqual(0);
    expect(errorFn.mock.calls[0][0].issue[0].details.text).toBe('hello.txt is larger than 4 bytes');

    await act(async () => {
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files: [new File(['hi'], 'hi.txt', { type: 'text/plain' })] },
      });
    });
    expect(results.length).toEqual(1);
  });
});
