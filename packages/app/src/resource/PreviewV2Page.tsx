// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Code, Stack, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome, QuestionnaireResponse } from '@medplum/fhirtypes';
import {
  Document,
  MedplumLink,
  OperationOutcomeAlert,
  QuestionnaireFormV2,
  QuestionnaireResponseDisplay,
  useMedplum,
} from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useParams } from 'react-router';

export function PreviewV2Page(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams() as { id: string };
  const [response, setResponse] = useState<QuestionnaireResponse>();
  const [saved, setSaved] = useState<QuestionnaireResponse>();
  const [outcome, setOutcome] = useState<OperationOutcome>();

  const handleSubmit = (questionnaireResponse: QuestionnaireResponse): void => {
    setResponse(questionnaireResponse);
    setSaved(undefined);
    setOutcome(undefined);
    medplum
      .createResource(questionnaireResponse)
      .then((result) => {
        setSaved(result);
        showNotification({ color: 'green', message: 'QuestionnaireResponse saved' });
      })
      .catch((err) => {
        setOutcome(normalizeOperationOutcome(err));
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      });
  };

  const shown = saved ?? response;

  return (
    <Document>
      <QuestionnaireFormV2 questionnaire={{ reference: 'Questionnaire/' + id }} onSubmit={handleSubmit} />
      {shown && (
        <Stack mt="xl" gap="md">
          <Title order={3}>Generated QuestionnaireResponse</Title>
          {saved && (
            <Alert color="green">
              Saved as <MedplumLink to={saved}>{getReferenceString(saved)}</MedplumLink>
            </Alert>
          )}
          {outcome && <OperationOutcomeAlert outcome={outcome} />}
          <QuestionnaireResponseDisplay questionnaireResponse={shown} />
          <Code block>{JSON.stringify(shown, null, 2)}</Code>
        </Stack>
      )}
    </Document>
  );
}
