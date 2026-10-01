// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Group, Paper, ScrollArea } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { Questionnaire, QuestionnaireItem, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import { IconSettings } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { QuestionnaireFormProvider, useQuestionnaireEditorForm } from '../QuestionnaireFormV2/QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem } from '../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import {
  findFormItemByLinkId,
  fromFhirQuestionnaireItem,
  toFhirQuestionnaire,
} from '../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { QuestionnaireRenderer } from '../QuestionnaireFormV2/QuestionnaireRenderer';
import { QuestionnaireAddItemMenu } from './QuestionnaireAddItemMenu';
import classes from './QuestionnaireBuilderV2.module.css';
import { QuestionnaireItemSettings } from './QuestionnaireItemSettings/QuestionnaireItemSettings';
import { useItemSettingsCodes } from './QuestionnaireItemSettings/useItemSettingsCodes';
import { QuestionnaireItemTree } from './QuestionnaireItemTree';
import { QuestionnaireSettingsDrawer } from './QuestionnaireSettingsDrawer';

export interface QuestionnaireBuilderV2Props {
  readonly questionnaire: Partial<Questionnaire> | Reference<Questionnaire>;
  readonly onSubmit: (result: Questionnaire) => void;
}

export function QuestionnaireBuilderV2(props: QuestionnaireBuilderV2Props): JSX.Element | null {
  const defaultValue = useResource(props.questionnaire);
  const [selectedLinkId, setSelectedLinkId] = useState<string>();
  const [settingsOpened, setSettingsOpened] = useState(false);
  const form = useQuestionnaireEditorForm({
    mode: 'uncontrolled',
    initialValues: { resourceType: 'Questionnaire', status: 'active' },
  });
  const { initialize } = form;
  // Loaded once for the builder, not each time the settings of another item are shown.
  const itemSettingsCodes = useItemSettingsCodes();

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

  return (
    <QuestionnaireFormProvider form={form}>
      <QuestionnaireSettingsDrawer
        opened={settingsOpened}
        onClose={() => setSettingsOpened(false)}
        onSave={() => {
          props.onSubmit(toFhirQuestionnaire(form.getValues()));
          setSettingsOpened(false);
        }}
      />
      <div className={classes.root}>
        <Paper withBorder className={classes.column}>
          <Group justify="space-between" p="md" className={classes.toolbar}>
            <Group gap="xs">
              <QuestionnaireAddItemMenu onAddItem={(item) => setSelectedItem(item)} />
              <Button
                variant="outline"
                size="compact-sm"
                aria-label="Questionnaire settings"
                onClick={() => setSettingsOpened(true)}
              >
                <IconSettings size={16} />
              </Button>
            </Group>
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
              <QuestionnaireItemSettings
                key={selectedItem.linkId}
                selectedItem={selectedItem}
                codes={itemSettingsCodes}
              />
            ) : (
              <Alert color="blue">Select an item.</Alert>
            )}
          </ScrollArea>
        </div>
        <div className={classes.preview}>
          <ScrollArea h="100%">
            <QuestionnaireRenderer
              items={items}
              selectedItem={selectedItem}
              onSubmit={() => showNotification({ color: 'green', message: 'All preview answers are valid' })}
            />
          </ScrollArea>
        </div>
      </div>
    </QuestionnaireFormProvider>
  );
}
