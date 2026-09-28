// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome, Questionnaire } from '@medplum/fhirtypes';
import { Document, OperationOutcomeAlert, QuestionnaireLoincSearch, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

/**
 * Creates a Questionnaire from a LOINC form and opens it in Builder v2.
 * @returns The LoincCreatePage React node.
 */
export function LoincCreatePage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<OperationOutcome>();

  const handleSelect = (questionnaire: Questionnaire): void => {
    setOutcome(undefined);
    medplum
      .createResource(questionnaire)
      // The questionnaire gets its own canonical url, derived from its new id; derivedFrom points back to LOINC.
      .then((created) =>
        medplum.updateResource({ ...created, url: medplum.fhirUrl('Questionnaire', created.id).toString() })
      )
      .then((updated) => navigate(`/Questionnaire/${updated.id}/builder-v2`))
      .catch((err) => {
        setOutcome(normalizeOperationOutcome(err));
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      });
  };

  return (
    <Document>
      {outcome && <OperationOutcomeAlert outcome={outcome} />}
      <QuestionnaireLoincSearch type="questionnaire" onSelectQuestionnaire={handleSelect} />
    </Document>
  );
}
