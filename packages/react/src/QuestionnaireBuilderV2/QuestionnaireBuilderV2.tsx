// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Group, Paper, ScrollArea, useTree } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { Questionnaire, QuestionnaireItem, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import { IconChevronsDown, IconChevronsUp, IconSettings } from '@tabler/icons-react';
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
import { getExpandableLinkIds } from './QuestionnaireBuilderV2.utils';
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
  const tree = useTree();

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
  const expandableLinkIds = getExpandableLinkIds(items);
  const allExpanded = expandableLinkIds.length > 0 && expandableLinkIds.every((linkId) => tree.expandedState[linkId]);
  const toggleAllExpanded = (): void =>
    tree.setExpandedState(allExpanded ? {} : Object.fromEntries(expandableLinkIds.map((linkId) => [linkId, true])));

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
              <Button
                variant="outline"
                size="compact-sm"
                aria-label={allExpanded ? 'Collapse all' : 'Expand all'}
                disabled={expandableLinkIds.length === 0}
                onClick={toggleAllExpanded}
              >
                {allExpanded ? <IconChevronsUp size={16} /> : <IconChevronsDown size={16} />}
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
              <QuestionnaireItemTree
                selectedItem={selectedItem}
                items={items}
                tree={tree}
                onSelectItem={setSelectedItem}
              />
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
