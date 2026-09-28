// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Questionnaire } from '@medplum/fhirtypes';
import { Container, Panel, QuestionnaireBuilderV2, useAppShell, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect } from 'react';
import { useParams } from 'react-router';
import classes from './BuilderV2Page.module.css';
import { cleanResource } from './utils';

export function BuilderV2Page(): JSX.Element {
  const medplum = useMedplum();
  const { navbarOpen, setNavbarOpen } = useAppShell();
  const { id } = useParams() as { id: string };

  useEffect(() => {
    if (!navbarOpen) {
      return undefined;
    }
    setNavbarOpen(false);
    return () => setNavbarOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = useCallback(
    (questionnaire: Questionnaire): void => {
      medplum
        .updateResource(cleanResource(questionnaire))
        .then(() => showNotification({ color: 'green', message: 'Success' }))
        .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
    },
    [medplum]
  );

  return (
    <Container fluid>
      <Panel className={classes.panel}>
        <QuestionnaireBuilderV2 questionnaire={{ reference: 'Questionnaire/' + id }} onSubmit={handleSubmit} />
      </Panel>
    </Container>
  );
}
