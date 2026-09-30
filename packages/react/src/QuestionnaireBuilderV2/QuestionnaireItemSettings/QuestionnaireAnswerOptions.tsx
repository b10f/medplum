// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Accordion, Alert, Button, Card, Code, Group, Stack, Text } from '@mantine/core';
import { LOINC } from '@medplum/core';
import type { QuestionnaireItemAnswerOption } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconList, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useQuestionnaireFormContext } from '../../QuestionnaireFormV2/QuestionnaireFormContext';
import type {
  ExtendedQuestionnaireItem,
  ExtendedQuestionnaireItemAnswerOption,
} from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import {
  fromFhirAnswerOptions,
  getAnswerOptionLabel,
  getValueByPath,
  isCodedAnswerOption,
} from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import {
  createManualAnswerOption,
  getAnswerOptionProblems,
  getLocalAnswerOptionSystem,
  isManualAnswerOption,
} from '../QuestionnaireBuilderV2.utils';
import { FormSwitch, FormTextInput } from '../QuestionnaireFormInputs';
import { getPlainOptionInputType } from './QuestionnaireItemSettings.utils';
import { QuestionnaireLoincAnswerListDrawer } from './QuestionnaireLoincAnswerListDrawer';
import { QuestionnaireValueSetAnswersDrawer } from './QuestionnaireValueSetAnswersDrawer';

export interface QuestionnaireAnswerOptionsProps {
  readonly selectedItem: ExtendedQuestionnaireItem;
  readonly disabled: boolean;
}

/**
 * A choice question's answers: its answer options, written by hand or taken from LOINC or a value set, or a value set
 * the respondent searches. Problems that would lose data (options without a code, duplicate codes) are shown.
 * @param props - The QuestionnaireAnswerOptions React props.
 * @returns The QuestionnaireAnswerOptions React node.
 */
export function QuestionnaireAnswerOptions(props: QuestionnaireAnswerOptionsProps): JSX.Element {
  const { selectedItem, disabled } = props;
  const medplum = useMedplum();
  const form = useQuestionnaireFormContext();
  const [answerListSearchOpened, setAnswerListSearchOpened] = useState(false);
  const [valueSetSearchOpened, setValueSetSearchOpened] = useState(false);
  const [openedAnswerOption, setOpenedAnswerOption] = useState<string | null>(null);

  const path = selectedItem.path;
  const type = getValueByPath(form.getValues(), `${path}.type`);
  const isChoice = type === 'choice' || type === 'open-choice';
  const repeats = getValueByPath(form.getValues(), `${path}.repeats`);
  const answerOptions = (getValueByPath(form.getValues(), `${path}.answerOption`) ||
    []) as ExtendedQuestionnaireItemAnswerOption[];
  const answerValueSet: string | undefined = getValueByPath(form.getValues(), `${path}.answerValueSet`);

  const questionnaireValues = form.getValues();
  const localAnswerSystem = getLocalAnswerOptionSystem(
    questionnaireValues.url ??
      (questionnaireValues.id ? medplum.fhirUrl('Questionnaire', questionnaireValues.id).toString() : undefined)
  );

  // FHIR allows answer options or a value set, not both: listed options replace a value set.
  const setAnswerOptions = (options: ExtendedQuestionnaireItemAnswerOption[]): void => {
    form.setFieldValue(`${path}.answerOption`, options);
    form.setFieldValue(`${path}.answerValueSet`, undefined);
  };

  const addAnswerOption = (): void => {
    setAnswerOptions([...answerOptions, createManualAnswerOption(answerOptions, localAnswerSystem)]);
    setOpenedAnswerOption(String(answerOptions.length));
  };

  const removeAnswerOption = (index: number): void => {
    form.removeListItem(`${path}.answerOption`, index);
  };

  const handleAnswerOptionSelectionChange = (value: boolean, index: number): void => {
    const answerOptionsArray: QuestionnaireItemAnswerOption[] =
      getValueByPath(form.getValues(), `${path}.answerOption`) ?? [];

    answerOptionsArray.forEach((option: QuestionnaireItemAnswerOption, i: number) => {
      option.initialSelected = value && i === index;
    });

    form.setFieldValue(`${path}.answerOption`, answerOptionsArray);
  };

  return (
    <>
      {isChoice && answerValueSet && answerOptions.length === 0 && (
        <Card withBorder>
          <Stack gap="xs">
            <Text fw={500}>Answers from a value set</Text>
            <Text size="sm">
              The respondent searches the codes of <Code>{answerValueSet}</Code>.
            </Text>
            <Group>
              <Button
                variant="default"
                size="xs"
                leftSection={<IconTrash size={16} />}
                onClick={() => form.setFieldValue(`${path}.answerValueSet`, undefined)}
                disabled={disabled}
              >
                Remove value set
              </Button>
            </Group>
          </Stack>
        </Card>
      )}
      {isChoice && !answerValueSet && answerOptions.length === 0 && (
        <Alert color="blue">No answer options added. Add at least one option for choice questions.</Alert>
      )}
      {isChoice && answerOptions.length > 0 && (
        <Card withBorder>
          <Card.Section withBorder inheritPadding py="xs">
            <Text fw={500}>Answer Options</Text>
          </Card.Section>
          <Card.Section inheritPadding py="md">
            <Accordion value={openedAnswerOption} onChange={setOpenedAnswerOption}>
              {answerOptions.map((answer: ExtendedQuestionnaireItemAnswerOption, index: number) => {
                // Coded answers (LOINC, a value set) keep their code, text and score, so they mean the same everywhere.
                const isCodedAnswer = !isManualAnswerOption(answer, localAnswerSystem);
                // A plain value (string, integer, date, time) is its own text and code.
                const isPlainValue = !isCodedAnswerOption(answer);
                return (
                  <Accordion.Item key={answer.id ?? index} value={String(index)}>
                    <Accordion.Control>{getAnswerOptionLabel(answer)}</Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="md">
                        {isPlainValue && answer.valueType === 'valueReference' && (
                          <Text size="sm">Reference to {answer.value?.reference}; it cannot be edited here.</Text>
                        )}
                        {isPlainValue && answer.valueType !== 'valueReference' && (
                          <FormTextInput
                            form={form}
                            label="Value"
                            context={`${path}.answerOption.${index}.value`}
                            type={getPlainOptionInputType(answer.valueType)}
                            required={true}
                            disabled={disabled}
                          />
                        )}
                        {!isPlainValue && isCodedAnswer && (
                          <Text size="xs" c="dimmed">
                            {answer.value?.system === LOINC ? 'LOINC answer' : 'Coded answer'}: its text, code and score
                            are fixed so it means the same everywhere.
                          </Text>
                        )}
                        {!isPlainValue && (
                          <FormTextInput
                            form={form}
                            label="Display Text"
                            context={`${path}.answerOption.${index}.value.display`}
                            required={!isCodedAnswer}
                            disabled={disabled || isCodedAnswer}
                          />
                        )}

                        <FormSwitch
                          form={form}
                          label="Initially Selected"
                          context={`${path}.answerOption.${index}.initialSelected`}
                          onChange={(value) => handleAnswerOptionSelectionChange(value, index)}
                          disabled={disabled}
                        />

                        {repeats && (
                          <FormSwitch
                            form={form}
                            label="Exclusive"
                            description="Selecting it clears the other answers, e.g. 'None of the above'."
                            context={`${path}.answerOption.${index}.exclusive`}
                            disabled={disabled}
                          />
                        )}

                        <FormTextInput
                          form={form}
                          label="Prefix"
                          description="Shown before the option, e.g. 'a)' or '1.'."
                          context={`${path}.answerOption.${index}.prefix`}
                          disabled={disabled}
                        />

                        {!isPlainValue && (
                          <>
                            <FormTextInput
                              form={form}
                              label="Code"
                              context={`${path}.answerOption.${index}.value.code`}
                              required={!isCodedAnswer}
                              disabled={disabled || isCodedAnswer}
                            />

                            <FormTextInput
                              form={form}
                              label="System"
                              context={`${path}.answerOption.${index}.value.system`}
                              disabled={true}
                            />

                            <FormTextInput
                              form={form}
                              label="Score"
                              context={`${path}.answerOption.${index}.value.score`}
                              type="number"
                              min="0"
                              disabled={disabled || isCodedAnswer}
                            />
                          </>
                        )}

                        <Button
                          variant="filled"
                          color="red"
                          onClick={() => removeAnswerOption(index)}
                          disabled={disabled}
                          leftSection={<IconTrash size={16} />}
                        >
                          Remove Answer Option
                        </Button>
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                );
              })}
            </Accordion>
          </Card.Section>
        </Card>
      )}

      {getAnswerOptionProblems(answerOptions).map((problem) => (
        <Alert key={problem} color="yellow">
          {problem}
        </Alert>
      ))}

      {isChoice && (
        <>
          <Button
            variant="default"
            leftSection={<IconSearch size={16} />}
            onClick={() => setAnswerListSearchOpened(true)}
            disabled={disabled}
          >
            {answerOptions.length > 0 ? 'Replace with LOINC answers' : 'Add answers from LOINC'}
          </Button>
          <Button
            variant="default"
            leftSection={<IconList size={16} />}
            onClick={() => setValueSetSearchOpened(true)}
            disabled={disabled}
          >
            {answerOptions.length > 0 ? 'Replace with a value set' : 'Add answers from a value set'}
          </Button>
          <Button variant="default" leftSection={<IconPlus size={16} />} onClick={addAnswerOption} disabled={disabled}>
            Add answer option
          </Button>
          <QuestionnaireLoincAnswerListDrawer
            opened={answerListSearchOpened}
            onClose={() => setAnswerListSearchOpened(false)}
            replaces={answerOptions.length > 0}
            onSelect={(answerOption) => setAnswerOptions(fromFhirAnswerOptions(answerOption))}
          />
          <QuestionnaireValueSetAnswersDrawer
            opened={valueSetSearchOpened}
            onClose={() => setValueSetSearchOpened(false)}
            replaces={answerOptions.length > 0}
            onSelect={(answerOption) => setAnswerOptions(fromFhirAnswerOptions(answerOption))}
          />
        </>
      )}
    </>
  );
}
