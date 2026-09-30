// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import type { Signature } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { SignatureInput } from '../SignatureInput/SignatureInput';
import classes from './QuestionnaireRenderer.module.css';

export interface QuestionnaireRendererSignatureProps {
  readonly defaultValue: Signature | undefined;
  readonly missing: boolean;
  readonly onChange: (value: Signature | undefined) => void;
}

/**
 * The respondent's signature, with Medplum's SignatureInput, as wide as the questions above it.
 * @param props - The QuestionnaireRendererSignature React props.
 * @returns The QuestionnaireRendererSignature React node.
 */
export function QuestionnaireRendererSignature(props: QuestionnaireRendererSignatureProps): JSX.Element {
  const { defaultValue, missing, onChange } = props;
  const { ref, width } = useElementSize();

  return (
    <Stack gap={4} className={classes.item}>
      <Text size="sm" fw={500}>
        Signature
      </Text>
      <div ref={ref}>
        {width > 0 && <SignatureInput width={Math.floor(width)} defaultValue={defaultValue} onChange={onChange} />}
      </div>
      {missing && (
        <Text c="red" size="sm">
          Signature is required.
        </Text>
      )}
    </Stack>
  );
}
