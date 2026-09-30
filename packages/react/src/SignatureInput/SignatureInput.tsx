// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PaperProps } from '@mantine/core';
import { Button, Paper } from '@mantine/core';
import type { ProfileResource } from '@medplum/core';
import { createReference, HTTP_HL7_ORG } from '@medplum/core';
import type { Reference, Signature } from '@medplum/fhirtypes';
import { useMedplum, useStabilizedCallback } from '@medplum/react-hooks';
import { IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import type { PointGroup } from 'signature_pad';
import SignaturePad from 'signature_pad';

export interface SignatureInputProps extends PaperProps {
  readonly width?: number;
  readonly height?: number;
  readonly defaultValue?: Signature;
  readonly who?: Reference<ProfileResource>;
  readonly onChange: ((value: Signature | undefined) => void) | undefined;
}

export function SignatureInput(props: SignatureInputProps): JSX.Element {
  const medplum = useMedplum();
  const { width = 500, height = 200, defaultValue, who, onChange, ...rest } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePad>(null);
  // The default value is only drawn when the input is first shown; after that, the strokes drawn are kept.
  const initialDataRef = useRef(defaultValue?.data);
  const strokesRef = useRef<PointGroup[]>([]);

  const emitChange = useStabilizedCallback(onChange);

  const handleEndStroke = useStabilizedCallback((): void => {
    strokesRef.current = signaturePadRef.current?.toData() ?? [];
    emitChange({
      type: [
        {
          system: HTTP_HL7_ORG + '/fhir/signature-type',
          code: 'ProofOfOrigin',
          display: 'Proof of Origin',
        },
      ],
      when: new Date().toISOString(),
      who: who ?? createReference(medplum.getProfile() as ProfileResource),
      data: signaturePadRef.current?.toDataURL().split(',')[1],
    });
  });

  // A new pad clears the canvas, as does resizing it, so it is only created when the canvas size changes, and then
  // redraws what was drawn.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const signaturePad = new SignaturePad(canvas);
    if (strokesRef.current.length > 0) {
      signaturePad.fromData(strokesRef.current);
    } else if (initialDataRef.current) {
      // The signature's data is base64 PNG, without the data URL prefix.
      signaturePad.fromDataURL(`data:image/png;base64,${initialDataRef.current}`).catch(console.error);
    }
    signaturePad.addEventListener('endStroke', handleEndStroke);
    signaturePadRef.current = signaturePad;

    return () => signaturePad.off();
  }, [width, height, handleEndStroke]);

  const clearSignature = (): void => {
    signaturePadRef.current?.clear();
    strokesRef.current = [];
    initialDataRef.current = undefined;
    emitChange(undefined);
  };

  return (
    <Paper withBorder p={0} w={width} h={height} pos="relative" {...rest}>
      <canvas ref={canvasRef} width={width} height={height} aria-label="Signature input area"></canvas>
      <Button
        onClick={clearSignature}
        aria-label="Clear signature"
        pos="absolute"
        top={0}
        right={0}
        size="xs"
        leftSection={<IconTrash size={16} />}
        variant="subtle"
        color="gray"
      >
        Clear
      </Button>
    </Paper>
  );
}
