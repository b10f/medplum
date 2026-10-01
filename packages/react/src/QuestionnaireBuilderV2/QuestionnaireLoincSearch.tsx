// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Center, Group, Loader, Modal, Table, Text, TextInput } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import type { Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
import { IconEye, IconPlus, IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { QuestionnaireFormV2 } from '../QuestionnaireFormV2/QuestionnaireFormV2';
import type { LoincFormDefinition, LoincQuestion, LoincSearchType } from './QuestionnaireLoinc.utils';
import {
  fetchLoincFormDefinition,
  LOINC_SEARCH_LABELS,
  searchLoincPanels,
  searchLoincQuestions,
  toFhirItemFromLoincPanel,
  toFhirItemFromLoincQuestion,
  toFhirQuestionnaireFromLoincForm,
} from './QuestionnaireLoinc.utils';
import classes from './QuestionnaireLoincSearch.module.css';
import { useLoincSearch } from './useLoincSearch';

export type { LoincSearchType } from './QuestionnaireLoinc.utils';

interface LoincFormPreview {
  readonly definition: LoincFormDefinition;
  readonly questionnaire: Questionnaire;
}

export interface QuestionnaireLoincSearchProps {
  readonly type: LoincSearchType;
  /** Called with the selected question or panel, for `question` and `panel` searches. */
  readonly onAddItem?: (item: QuestionnaireItem) => void;
  /** Called with a new Questionnaire built from the selected LOINC form, for `questionnaire` searches. */
  readonly onSelectQuestionnaire?: (questionnaire: Questionnaire) => void;
}

/**
 * Searches LOINC questions, panels or questionnaires (forms). Panels and questionnaires can be previewed, rendered as
 * the respondent will see them, before they are added.
 * @param props - The QuestionnaireLoincSearch React props.
 * @returns The QuestionnaireLoincSearch React node.
 */
export function QuestionnaireLoincSearch(props: QuestionnaireLoincSearchProps): JSX.Element {
  const { type, onAddItem, onSelectQuestionnaire } = props;
  const [searchTerm, setSearchTerm] = useState('');
  // LOINC panels and forms are the same search; a form becomes a questionnaire, a panel becomes a group.
  const { loading, results, error } = useLoincSearch(
    searchTerm,
    type === 'question' ? searchLoincQuestions : searchLoincPanels
  );
  const [loadingForm, setLoadingForm] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [preview, setPreview] = useState<LoincFormPreview>();
  const actionLabel = type === 'questionnaire' ? 'Create' : 'Add';

  const loadForm = async (code: string): Promise<LoincFormPreview | undefined> => {
    setLoadingForm(code);
    setFormError(undefined);
    try {
      const definition = await fetchLoincFormDefinition(code);
      const questionnaire =
        type === 'questionnaire'
          ? toFhirQuestionnaireFromLoincForm(definition)
          : toPanelPreviewQuestionnaire(definition, toFhirItemFromLoincPanel(definition));
      return { definition, questionnaire };
    } catch (err) {
      setFormError(normalizeErrorString(err));
      return undefined;
    } finally {
      setLoadingForm(undefined);
    }
  };

  const select = (form: LoincFormPreview): void => {
    if (type === 'questionnaire') {
      onSelectQuestionnaire?.(form.questionnaire);
    } else {
      onAddItem?.(form.questionnaire.item?.[0] as QuestionnaireItem);
    }
  };

  const handleSelect = async (result: LoincQuestion): Promise<void> => {
    if (type === 'question') {
      onAddItem?.(toFhirItemFromLoincQuestion(result));
      return;
    }
    const form = await loadForm(result.code);
    if (form) {
      select(form);
    }
  };

  const handlePreview = async (result: LoincQuestion): Promise<void> => {
    const form = await loadForm(result.code);
    if (form) {
      setPreview(form);
    }
  };

  const renderResults = (): JSX.Element => {
    if (!searchTerm.trim()) {
      return (
        <Center py="md">
          <Text size="sm" c="dimmed">
            Type a keyword in the search bar above to find {LOINC_SEARCH_LABELS[type]}.
          </Text>
        </Center>
      );
    }
    if (loading) {
      return (
        <Center py="md">
          <Loader size="sm" />
        </Center>
      );
    }
    if (error) {
      return <Alert color="red">{error}</Alert>;
    }
    if (results.length === 0) {
      return (
        <Center py="md">
          <Text size="sm" c="dimmed">
            No results found for "{searchTerm}".
          </Text>
        </Center>
      );
    }
    return (
      <Table withTableBorder>
        <Table.Tbody>
          {results.map((result) => (
            <Table.Tr key={result.code}>
              <Table.Td className={classes.text}>
                <Text truncate="end">{result.text}</Text>
                <Text size="xs" c="dimmed">
                  {result.code}
                </Text>
              </Table.Td>
              <Table.Td className={classes.action}>
                <Group gap="xs" justify="flex-end" wrap="nowrap">
                  {type !== 'question' && (
                    <Button
                      variant="outline"
                      size="xs"
                      leftSection={<IconEye size={16} />}
                      disabled={!!loadingForm}
                      onClick={() => handlePreview(result)}
                    >
                      Preview
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="xs"
                    leftSection={loadingForm === result.code ? <Loader size={16} /> : <IconPlus size={16} />}
                    disabled={!!loadingForm}
                    onClick={() => handleSelect(result)}
                  >
                    {actionLabel}
                  </Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    );
  };

  return (
    <>
      <TextInput
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.currentTarget.value)}
        placeholder="Search"
        leftSection={<IconSearch size={16} />}
        mb="md"
        data-autofocus
      />
      {formError && (
        <Alert color="red" mb="md">
          {formError}
        </Alert>
      )}
      {renderResults()}
      <Modal opened={!!preview} onClose={() => setPreview(undefined)} size="xl">
        {preview && (
          <>
            <QuestionnaireFormV2 questionnaire={preview.questionnaire} excludeButtons />
            {preview.definition.copyrightNotice && (
              <Text size="xs" c="dimmed" mt="md">
                {preview.definition.copyrightNotice}
              </Text>
            )}
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setPreview(undefined)}>
                Cancel
              </Button>
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => {
                  select(preview);
                  setPreview(undefined);
                }}
              >
                {type === 'questionnaire' ? 'Create questionnaire' : 'Add panel'}
              </Button>
            </Group>
          </>
        )}
      </Modal>
    </>
  );
}

function toPanelPreviewQuestionnaire(definition: LoincFormDefinition, panel: QuestionnaireItem): Questionnaire {
  return { resourceType: 'Questionnaire', status: 'draft', title: definition.name, item: [panel] };
}
