// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Group, Paper, ScrollArea } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { Questionnaire, QuestionnaireItem, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import classes from './QuestionnaireBuilderV2.module.css';
import type { ExtendedQuestionnaireItem } from './QuestionnaireBuilderV2.utils';
import {
  addFormAnswer,
  findFormItemByLinkId,
  fromFhirQuestionnaireItem,
  toFhirQuestionnaire,
} from './QuestionnaireBuilderV2.utils';
import { QuestionnaireFormProvider, useQuestionnaireForm } from './QuestionnaireFormContext';
import { QuestionnaireGroupMenu } from './QuestionnaireGroupMenu';
import { QuestionnaireItemSettings } from './QuestionnaireItemSettings';
import { QuestionnaireItemTree } from './QuestionnaireItemTree';
import { QuestionnairePreview } from './QuestionnairePreview';

export interface QuestionnaireBuilderV2Props {
  readonly questionnaire: Partial<Questionnaire> | Reference<Questionnaire>;
  readonly onSubmit: (result: Questionnaire) => void;
}

export function QuestionnaireBuilderV2(props: QuestionnaireBuilderV2Props): JSX.Element | null {
  const defaultValue = useResource(props.questionnaire);
  const [selectedLinkId, setSelectedLinkId] = useState<string>();
  const form = useQuestionnaireForm({
    mode: 'uncontrolled',
    initialValues: { resourceType: 'Questionnaire', status: 'active' },
  });
  const { initialize } = form;

  useEffect(() => {
    if (defaultValue) {
      initialize({
        ...defaultValue,
        item: (defaultValue.item ?? []).map((item: QuestionnaireItem, index: number) =>
          fromFhirQuestionnaireItem(item, defaultValue, index)
        ),
      });
    }
  }, [defaultValue, initialize]);

  if (!form.initialized) {
    return null;
  }

  const items: ExtendedQuestionnaireItem[] = form.getValues().item ?? [];
  // Resolved from the current values on every render: paths change whenever items are added, moved or deleted.
  const selectedItem = findFormItemByLinkId(items, selectedLinkId);
  const setSelectedItem = (item: ExtendedQuestionnaireItem | undefined): void => setSelectedLinkId(item?.linkId);

  const addAnswer = (item: ExtendedQuestionnaireItem, original?: ExtendedQuestionnaireItem): void =>
    addFormAnswer(form, item, original);

  return (
    <QuestionnaireFormProvider form={form}>
      <div className={classes.root}>
        <Paper withBorder className={classes.column}>
          <Group justify="space-between" p="md" className={classes.toolbar}>
            <QuestionnaireGroupMenu onAddItem={(item) => setSelectedItem(item)} />
            <Button size="compact-sm" onClick={() => props.onSubmit(toFhirQuestionnaire(form.getValues()))}>
              Save
            </Button>
          </Group>
          <ScrollArea flex={1} p="md">
            {items.length === 0 ? (
              <Alert color="blue">No items added yet.</Alert>
            ) : (
              <QuestionnaireItemTree selectedItem={selectedItem} items={items} onSelectItem={setSelectedItem} />
            )}
          </ScrollArea>
        </Paper>
        <div className={classes.column}>
          <ScrollArea h="100%">
            {selectedItem ? (
              <QuestionnaireItemSettings key={selectedItem.linkId} selectedItem={selectedItem} addAnswer={addAnswer} />
            ) : (
              <Alert color="blue">Select an item.</Alert>
            )}
          </ScrollArea>
        </div>
        <div className={classes.preview}>
          <ScrollArea h="100%">
            <QuestionnairePreview
              items={items}
              selectedItem={selectedItem}
              addAnswer={addAnswer}
              onSubmit={() => showNotification({ color: 'green', message: 'All preview answers are valid' })}
            />
          </ScrollArea>
        </div>
      </div>
    </QuestionnaireFormProvider>
  );
}
