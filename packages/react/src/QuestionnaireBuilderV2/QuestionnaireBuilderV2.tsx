// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Drawer, Group, Paper, ScrollArea, Stack, Switch, Textarea } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import type { Questionnaire, QuestionnaireItem, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import { IconSettings } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { CodingInput } from '../CodingInput/CodingInput';
import {
  QuestionnaireFormProvider,
  useQuestionnaireForm,
  useQuestionnaireFormContext,
} from '../QuestionnaireFormV2/QuestionnaireFormContext';
import { QuestionnairePreview } from '../QuestionnaireFormV2/QuestionnairePreview';
import classes from './QuestionnaireBuilderV2.module.css';
import type { ExtendedQuestionnaireItem } from './QuestionnaireBuilderV2.utils';
import {
  addFormAnswer,
  DEFAULT_SIGNATURE_TYPE,
  findFormItemByLinkId,
  fromFhirQuestionnaireItem,
  getQuestionnaireDesignNote,
  getRequiredSignatureType,
  setQuestionnaireDesignNote,
  setRequiredSignatureType,
  toFhirQuestionnaire,
} from './QuestionnaireBuilderV2.utils';
import { QuestionnaireGroupMenu } from './QuestionnaireGroupMenu';
import { QuestionnaireItemSettings } from './QuestionnaireItemSettings';
import { QuestionnaireItemTree } from './QuestionnaireItemTree';

export interface QuestionnaireBuilderV2Props {
  readonly questionnaire: Partial<Questionnaire> | Reference<Questionnaire>;
  readonly onSubmit: (result: Questionnaire) => void;
}

export function QuestionnaireBuilderV2(props: QuestionnaireBuilderV2Props): JSX.Element | null {
  const defaultValue = useResource(props.questionnaire);
  const [selectedLinkId, setSelectedLinkId] = useState<string>();
  const [settingsOpened, setSettingsOpened] = useState(false);
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
              <QuestionnaireGroupMenu onAddItem={(item) => setSelectedItem(item)} />
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

const SIGNATURE_TYPE_VALUE_SET = 'http://hl7.org/fhir/ValueSet/signature-type';

interface QuestionnaireSettingsDrawerProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  /** Saves the questionnaire, as the Save button above the item tree does. */
  readonly onSave: () => void;
}

/**
 * Settings of the questionnaire itself, rather than of one item. Like item changes, they apply once saved.
 * @param props - The QuestionnaireSettingsDrawer React props.
 * @returns The QuestionnaireSettingsDrawer React node.
 */
function QuestionnaireSettingsDrawer(props: QuestionnaireSettingsDrawerProps): JSX.Element {
  const { opened, onClose, onSave } = props;
  return (
    <Drawer opened={opened} onClose={onClose} position="left" title="Questionnaire settings">
      {/* Remounted on every opening, so it starts from the current values. */}
      {opened && <QuestionnaireSettings onSave={onSave} />}
    </Drawer>
  );
}

function QuestionnaireSettings(props: { readonly onSave: () => void }): JSX.Element {
  const form = useQuestionnaireFormContext();
  const signatureType = getRequiredSignatureType(form.getValues());
  // Typed text is kept here and written to the form shortly after typing stops, not on every keystroke.
  const [designNote, setDesignNote] = useState(() => getQuestionnaireDesignNote(form.getValues()));
  const writeDesignNote = useDebouncedCallback((note: string) => setQuestionnaireDesignNote(form, note), 300);

  return (
    <Stack gap="md">
      <Switch
        label="Signature required"
        description="The respondent signs below the form, and cannot submit it unsigned."
        checked={!!signatureType}
        onChange={(e) => setRequiredSignatureType(form, e.currentTarget.checked ? DEFAULT_SIGNATURE_TYPE : undefined)}
      />
      {signatureType && (
        <CodingInput
          // A new signature requirement starts from its default type.
          key={signatureType.code ?? 'none'}
          label="Signature type"
          name="signature-type"
          path=""
          binding={SIGNATURE_TYPE_VALUE_SET}
          creatable={false}
          defaultValue={signatureType.code ? signatureType : undefined}
          onChange={(coding) => setRequiredSignatureType(form, coding ?? DEFAULT_SIGNATURE_TYPE)}
        />
      )}
      <Textarea
        label="Design note"
        description="For the people building this questionnaire; never shown to respondents."
        autosize
        minRows={4}
        value={designNote}
        onChange={(e) => {
          setDesignNote(e.currentTarget.value);
          writeDesignNote(e.currentTarget.value);
        }}
      />
      <Group justify="flex-end">
        <Button
          onClick={() => {
            // The note typed last may not be written yet.
            setQuestionnaireDesignNote(form, designNote);
            props.onSave();
          }}
        >
          Save
        </Button>
      </Group>
    </Stack>
  );
}
