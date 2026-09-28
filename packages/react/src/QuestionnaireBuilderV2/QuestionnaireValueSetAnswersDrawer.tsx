// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Card, Center, Drawer, Group, Loader, Stack, Text } from '@mantine/core';
import { getDisplayString, normalizeErrorString } from '@medplum/core';
import type { QuestionnaireItemAnswerOption, ValueSet } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import { forwardRef, useEffect, useRef, useState } from 'react';
import type { AsyncAutocompleteOption } from '../AsyncAutocomplete/AsyncAutocomplete';
import { ResourceInput } from '../ResourceInput/ResourceInput';
import { toFhirAnswerOptionsFromValueSet } from './QuestionnaireBuilderV2.utils';

/** The most codes copied from one value set; answer options are meant for short lists. */
const MAX_ANSWER_OPTIONS = 1000;

interface Expansion {
  readonly valueSet: ValueSet;
  readonly answerOption?: QuestionnaireItemAnswerOption[];
  readonly total?: number;
  readonly error?: string;
}

export interface QuestionnaireValueSetAnswersDrawerProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly onSelect: (answerOption: QuestionnaireItemAnswerOption[]) => void;
  /** True when the question already has answer options, which the value set's codes replace. */
  readonly replaces?: boolean;
}

/**
 * A drawer to pick a ValueSet (e.g. one of the project's own) for a choice question. Its codes are copied into the
 * question's answer options, so the answers share the value set's codes.
 * @param props - The QuestionnaireValueSetAnswersDrawer React props.
 * @returns The QuestionnaireValueSetAnswersDrawer React node.
 */
export function QuestionnaireValueSetAnswersDrawer(props: QuestionnaireValueSetAnswersDrawerProps): JSX.Element {
  const { opened, onClose, onSelect, replaces } = props;
  const contentRef = useRef<HTMLDivElement>(null);
  // A new key after the drawer has closed starts the next opening with an empty search.
  const [session, setSession] = useState(0);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={800}
      title="Answers from a value set"
      transitionProps={{
        // ResourceInput has no autofocus option; focus its input once the drawer has opened.
        onEntered: () => contentRef.current?.querySelector('input')?.focus(),
        onExited: () => setSession((current) => current + 1),
      }}
    >
      <div ref={contentRef}>
        <ValueSetAnswersPicker key={session} onClose={onClose} onSelect={onSelect} replaces={replaces} />
      </div>
    </Drawer>
  );
}

interface ValueSetAnswersPickerProps {
  readonly onClose: () => void;
  readonly onSelect: (answerOption: QuestionnaireItemAnswerOption[]) => void;
  readonly replaces?: boolean;
}

function ValueSetAnswersPicker(props: ValueSetAnswersPickerProps): JSX.Element {
  const { onClose, onSelect, replaces } = props;
  const medplum = useMedplum();
  const [valueSet, setValueSet] = useState<ValueSet>();
  const [expansion, setExpansion] = useState<Expansion>();
  const loading = !!valueSet?.url && expansion?.valueSet !== valueSet;

  useEffect(() => {
    if (!valueSet?.url) {
      return undefined;
    }

    const controller = new AbortController();
    medplum
      .valueSetExpand({ url: valueSet.url, count: MAX_ANSWER_OPTIONS }, { signal: controller.signal })
      .then((expanded) =>
        setExpansion({
          valueSet,
          answerOption: toFhirAnswerOptionsFromValueSet(expanded),
          total: expanded.expansion?.total,
        })
      )
      .catch((err) => {
        if (!controller.signal.aborted) {
          setExpansion({ valueSet, error: normalizeErrorString(err) });
        }
      });

    return () => controller.abort();
  }, [medplum, valueSet]);

  const renderExpansion = (): JSX.Element | null => {
    if (!valueSet) {
      return (
        <Center py="md">
          <Text size="sm" c="dimmed">
            Search for a value set by name, e.g. one of your project's own.
          </Text>
        </Center>
      );
    }
    if (!valueSet.url) {
      return <Alert color="red">This value set has no url, so it cannot be expanded.</Alert>;
    }
    if (loading) {
      return (
        <Center py="md">
          <Loader size="sm" />
        </Center>
      );
    }
    if (expansion?.error) {
      return <Alert color="red">{expansion.error}</Alert>;
    }

    const answerOption = expansion?.answerOption ?? [];
    if (answerOption.length === 0) {
      return <Alert color="yellow">This value set has no codes.</Alert>;
    }

    return (
      <Card withBorder padding="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            {answerOption.map((option) => (
              <Group key={`${option.valueCoding?.system}|${option.valueCoding?.code}`} gap="xs" wrap="nowrap">
                <Text size="sm">{option.valueCoding?.display}</Text>
                <Text size="xs" c="dimmed">
                  {option.valueCoding?.code}
                </Text>
              </Group>
            ))}
          </Stack>
          <Button
            variant="outline"
            size="xs"
            leftSection={<IconCheck size={16} />}
            onClick={() => {
              onSelect(answerOption);
              onClose();
            }}
          >
            Use
          </Button>
        </Group>
        {(expansion?.total ?? 0) > answerOption.length && (
          <Text size="xs" c="dimmed" mt="xs">
            Showing the first {answerOption.length} of {expansion?.total} codes.
          </Text>
        )}
      </Card>
    );
  };

  return (
    <Stack gap="md">
      <ResourceInput<ValueSet>
        resourceType="ValueSet"
        name="answer-value-set"
        placeholder="Search value sets"
        itemComponent={ValueSetItem}
        onChange={setValueSet}
      />
      {replaces && <Alert color="yellow">The value set's codes replace the question's current answer options.</Alert>}
      {renderExpansion()}
    </Stack>
  );
}

const ValueSetItem = forwardRef<HTMLDivElement, AsyncAutocompleteOption<ValueSet>>(
  ({ resource, active: _active, ...others }: AsyncAutocompleteOption<ValueSet>, ref) => (
    <div ref={ref} {...others}>
      <Text size="sm">{getDisplayString(resource)}</Text>
      <Text size="xs" c="dimmed">
        {resource.url ?? resource.id}
      </Text>
    </div>
  )
);

ValueSetItem.displayName = 'ValueSetItem';
