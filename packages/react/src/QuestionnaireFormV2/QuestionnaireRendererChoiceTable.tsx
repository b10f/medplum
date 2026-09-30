// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Center, Checkbox, Input, Radio, Table, Text } from '@mantine/core';
import type { QuestionnaireResponse } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useContext } from 'react';
import { useQuestionnaireFormContext, useQuestionnaireResponseFormContext } from './QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem, ExtendedQuestionnaireItemAnswerOption } from './QuestionnaireFormV2.utils';
import {
  findAnswerOption,
  getAnswerOptionDisplay,
  getChoiceValueKey,
  isEmptyAnswerValue,
  isReadOnlyFormItem,
} from './QuestionnaireFormV2.utils';
import { QuestionnaireModeContext } from './QuestionnaireModeContext';
import { getAnswers, setAnswerValue, setChoiceAnswers } from './QuestionnaireRenderer.utils';
import {
  evaluateEnableWhen,
  getAnswerValue,
  getResponseItemIndexes,
  isShownInMode,
} from './QuestionnaireResponse.utils';

export interface QuestionnaireRendererChoiceTableProps {
  readonly group: ExtendedQuestionnaireItem;
  /** The response path of the response items of one repetition of the group. */
  readonly context: string;
  /** False: questions are rows and options columns (`table`, `atable`); true: the other way round (`htable`). */
  readonly transposed: boolean;
  readonly ignoreValidation?: boolean;
}

/**
 * The choice questions of a table group as a grid: one radio button (or checkbox, for a repeating question) per
 * question and option. Options are the questions' own, in the order they first appear.
 * @param props - The QuestionnaireRendererChoiceTable props.
 * @returns The QuestionnaireRendererChoiceTable React node.
 */
export function QuestionnaireRendererChoiceTable(props: QuestionnaireRendererChoiceTableProps): JSX.Element {
  const { group, context, transposed, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();
  const responseForm = useQuestionnaireResponseFormContext();
  const mode = useContext(QuestionnaireModeContext);
  const values = form.getValues();
  const response = responseForm.getValues() as QuestionnaireResponse;
  const questions = (group.item ?? [])
    .filter(
      (question) =>
        !question.hidden &&
        evaluateEnableWhen(values, response, question, context) &&
        isShownInMode(values, response, question, context, mode)
    )
    .flatMap((question) => {
      const indexes = getResponseItemIndexes(response, context, question.linkId);
      return indexes.length > 0 ? [{ question, answersPath: `${context}.${indexes[0]}.answer` }] : [];
    });

  const options: ExtendedQuestionnaireItemAnswerOption[] = [];
  for (const { question } of questions) {
    for (const option of question.answerOption ?? []) {
      if (!options.some((known) => getChoiceValueKey(known.value) === getChoiceValueKey(option.value))) {
        options.push(option);
      }
    }
  }

  const cell = (
    question: ExtendedQuestionnaireItem,
    answersPath: string,
    option: ExtendedQuestionnaireItemAnswerOption
  ): JSX.Element | null => {
    const own = findAnswerOption(question.answerOption, option.value);
    if (!own) {
      return null;
    }
    const selected = getAnswers(responseForm, answersPath)
      .map((answer) => getAnswerValue(question, answer))
      .filter((value) => !isEmptyAnswerValue(value));
    const checked = selected.some((value) => getChoiceValueKey(value) === getChoiceValueKey(own.value));
    const readOnly = isReadOnlyFormItem(values, question);
    const label = `${question.text ?? ''}: ${getAnswerOptionDisplay(own)}`;

    if (question.repeats) {
      return (
        <Checkbox
          aria-label={label}
          checked={checked}
          disabled={readOnly}
          onChange={(e) => {
            const others = selected.filter((value) => getChoiceValueKey(value) !== getChoiceValueKey(own.value));
            setChoiceAnswers(
              responseForm,
              question,
              answersPath,
              e.currentTarget.checked ? [...others, own.value] : others
            );
          }}
        />
      );
    }
    return (
      <Radio
        aria-label={label}
        checked={checked}
        disabled={readOnly}
        onChange={() => setAnswerValue(responseForm, question, `${answersPath}.0`, own.value, ignoreValidation)}
      />
    );
  };

  const questionHeader = (question: ExtendedQuestionnaireItem, answersPath: string): JSX.Element => {
    const errorPath = question.repeats ? answersPath : `${answersPath}.0`;
    return (
      <>
        {[question.prefix, question.text].filter(Boolean).join(' ')}
        {question.required && (
          <Text component="span" c="red">
            {' '}
            *
          </Text>
        )}
        {responseForm.errors[errorPath] && <Input.Error>{responseForm.errors[errorPath]}</Input.Error>}
      </>
    );
  };

  return (
    <Table withTableBorder withColumnBorders mt="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th />
          {transposed
            ? questions.map(({ question, answersPath }) => (
                <Table.Th key={answersPath}>{questionHeader(question, answersPath)}</Table.Th>
              ))
            : options.map((option) => (
                <Table.Th key={getChoiceValueKey(option.value)} ta="center">
                  {getAnswerOptionDisplay(option)}
                </Table.Th>
              ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {transposed
          ? options.map((option) => (
              <Table.Tr key={getChoiceValueKey(option.value)}>
                <Table.Th>{getAnswerOptionDisplay(option)}</Table.Th>
                {questions.map(({ question, answersPath }) => (
                  <Table.Td key={answersPath}>
                    <Center>{cell(question, answersPath, option)}</Center>
                  </Table.Td>
                ))}
              </Table.Tr>
            ))
          : questions.map(({ question, answersPath }) => (
              <Table.Tr key={answersPath}>
                <Table.Td>{questionHeader(question, answersPath)}</Table.Td>
                {options.map((option) => (
                  <Table.Td key={getChoiceValueKey(option.value)}>
                    <Center>{cell(question, answersPath, option)}</Center>
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
      </Table.Tbody>
    </Table>
  );
}
