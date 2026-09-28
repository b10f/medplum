// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Card, Center, Drawer, Group, Loader, Stack, Text, TextInput } from '@mantine/core';
import type { QuestionnaireItemAnswerOption } from '@medplum/fhirtypes';
import { IconCheck, IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { LoincAnswerList } from './QuestionnaireLoinc.utils';
import { searchLoincAnswerLists, toFhirAnswerOptionsFromLoincAnswerList } from './QuestionnaireLoinc.utils';
import { useLoincSearch } from './useLoincSearch';

export interface QuestionnaireLoincAnswerListDrawerProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly onSelect: (answerOption: QuestionnaireItemAnswerOption[]) => void;
  /** True when the question already has answer options, which the selected list replaces. */
  readonly replaces?: boolean;
}

/**
 * A drawer to pick a LOINC answer list for a choice question. Its answers are copied into the question's answer
 * options with their LOINC answer codes and scores, so answers mean the same across questionnaires.
 * @param props - The QuestionnaireLoincAnswerListDrawer React props.
 * @returns The QuestionnaireLoincAnswerListDrawer React node.
 */
export function QuestionnaireLoincAnswerListDrawer(props: QuestionnaireLoincAnswerListDrawerProps): JSX.Element {
  const { opened, onClose, onSelect, replaces } = props;
  const [searchTerm, setSearchTerm] = useState('');
  const { loading, results, error } = useLoincSearch(searchTerm, searchLoincAnswerLists);

  const renderResults = (): JSX.Element => {
    if (!searchTerm.trim()) {
      return (
        <Center py="md">
          <Text size="sm" c="dimmed">
            Search by the wording of a question that uses the answers, e.g. "how often" or "satisfied".
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
            No answer lists found for "{searchTerm}".
          </Text>
        </Center>
      );
    }
    return (
      <Stack gap="sm">
        {results.map((list) => (
          <AnswerListCard
            key={list.key}
            list={list}
            onSelect={() => {
              onSelect(toFhirAnswerOptionsFromLoincAnswerList(list));
              onClose();
            }}
          />
        ))}
      </Stack>
    );
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={800}
      title="Search LOINC answer lists"
      transitionProps={{ onExited: () => setSearchTerm('') }}
    >
      <TextInput
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.currentTarget.value)}
        placeholder="Search"
        leftSection={<IconSearch size={16} />}
        mb="md"
        data-autofocus
      />
      {replaces && (
        <Alert color="yellow" mb="md">
          The selected answer list replaces the question's current answer options.
        </Alert>
      )}
      {renderResults()}
    </Drawer>
  );
}

interface AnswerListCardProps {
  readonly list: LoincAnswerList;
  readonly onSelect: () => void;
}

function AnswerListCard(props: AnswerListCardProps): JSX.Element {
  const { list, onSelect } = props;
  const { exampleQuestion, questionCount } = list;

  return (
    <Card withBorder padding="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2}>
          {list.answers.map((answer) => (
            <Group key={answer.AnswerStringID} gap="xs" wrap="nowrap">
              <Text size="sm">{answer.DisplayText}</Text>
              <Text size="xs" c="dimmed">
                {answer.AnswerStringID}
              </Text>
            </Group>
          ))}
        </Stack>
        <Button variant="outline" size="xs" leftSection={<IconCheck size={16} />} onClick={onSelect}>
          Use
        </Button>
      </Group>
      <Text size="xs" c="dimmed" mt="xs">
        Used by "{exampleQuestion.text}" ({exampleQuestion.code})
        {questionCount > 1 && ` and ${questionCount - 1} more question${questionCount > 2 ? 's' : ''}`}
      </Text>
    </Card>
  );
}
