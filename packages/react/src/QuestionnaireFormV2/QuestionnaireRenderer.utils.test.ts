// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useForm } from '@mantine/form';
import type { Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
import { QUESTIONNAIRE_OPTION_EXCLUSIVE_URL } from '@medplum/react-hooks';
import { act, renderHook } from '@testing-library/react';
import type { QuestionnaireForm } from './QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem } from './QuestionnaireFormV2.utils';
import { fromFhirQuestionnaireItem } from './QuestionnaireFormV2.utils';
import {
  addRepetition,
  getAnswers,
  getAttachedText,
  isChoiceTable,
  isGroupTable,
  setAnswerValue,
  setChoiceAnswers,
} from './QuestionnaireRenderer.utils';
import { toDraftResponse } from './QuestionnaireResponse.utils';

const coding = (code: string): { system: string; code: string; display: string } => ({
  system: 'urn:test',
  code,
  display: code.toUpperCase(),
});

function toItems(items: QuestionnaireItem[]): ExtendedQuestionnaireItem[] {
  const questionnaire: Questionnaire = { resourceType: 'Questionnaire', status: 'active', item: items };
  return items.map((item, index) => fromFhirQuestionnaireItem(item, questionnaire, index));
}

/**
 * Renders the draft response form of the items, as QuestionnaireRenderer holds it.
 * @param items - The form items.
 * @returns The draft response form.
 */
function setup(items: ExtendedQuestionnaireItem[]): { current: QuestionnaireForm } {
  const { result } = renderHook(() =>
    // Not typed as a QuestionnaireResponse: Mantine's path types on FHIR types do not finish type-checking.
    useForm({ mode: 'uncontrolled', initialValues: toDraftResponse(items) as Record<string, any> })
  );
  return result;
}

describe('QuestionnaireRenderer.utils', () => {
  test('getAnswers returns the answers at a response path, or none', () => {
    const form = setup(toItems([{ linkId: 'name', type: 'string', initial: [{ valueString: 'Ada' }] }]));
    expect(getAnswers(form.current, 'item.0.answer')).toStrictEqual([{ valueString: 'Ada' }]);
    expect(getAnswers(form.current, 'item.1.answer')).toStrictEqual([]);
  });

  test('addRepetition adds a repetition after the last one of its group', () => {
    const form = setup(
      toItems([
        { linkId: 'contact', type: 'group', repeats: true, item: [{ linkId: 'email', type: 'string' }] },
        { linkId: 'note', type: 'string' },
      ])
    );
    act(() => addRepetition(form.current, 'item', 'contact'));
    act(() => addRepetition(form.current, 'item', 'contact'));
    expect(form.current.getValues().item.map((responseItem: any) => responseItem.linkId)).toStrictEqual([
      'contact',
      'contact',
      'contact',
      'note',
    ]);
    // useSyncedResponse fills it with the group's items.
    expect(form.current.getValues().item[2]).toStrictEqual({ linkId: 'contact' });
  });

  test('setAnswerValue writes the answer, keeps its follow-up items and shows its constraint error', () => {
    const [item] = toItems([
      {
        linkId: 'name',
        type: 'string',
        maxLength: 3,
        item: [{ linkId: 'why', type: 'string', text: 'Why?' }],
      },
    ]);
    const form = setup([item]);
    const followUps = form.current.getValues().item[0].answer[0].item;
    expect(followUps).toHaveLength(1);

    act(() => setAnswerValue(form.current, item, 'item.0.answer.0', 'Ada'));
    expect(form.current.getValues().item[0].answer[0]).toStrictEqual({ item: followUps, valueString: 'Ada' });
    expect(form.current.errors).toStrictEqual({});

    act(() => setAnswerValue(form.current, item, 'item.0.answer.0', 'Grace'));
    expect(form.current.getValues().item[0].answer[0].valueString).toBe('Grace');
    expect(form.current.errors['item.0.answer.0']).toBe('This field cannot exceed 3 characters');
  });

  test('setAnswerValue writes an empty answer, and skips validation when asked', () => {
    const [item] = toItems([{ linkId: 'age', type: 'integer', text: 'Age', extension: [] }]);
    item.maxValue = 120;
    const form = setup([item]);

    act(() => setAnswerValue(form.current, item, 'item.0.answer.0', '200', true));
    expect(form.current.getValues().item[0].answer[0]).toStrictEqual({ valueInteger: 200 });
    expect(form.current.errors).toStrictEqual({});

    act(() => setAnswerValue(form.current, item, 'item.0.answer.0', ''));
    expect(form.current.getValues().item[0].answer[0]).toStrictEqual({});
  });

  test('setChoiceAnswers keeps the answers that stay selected, with their follow-up items', () => {
    const [item] = toItems([
      {
        linkId: 'fruit',
        type: 'choice',
        repeats: true,
        answerOption: [{ valueCoding: coding('a') }, { valueCoding: coding('b') }, { valueCoding: coding('c') }],
        item: [{ linkId: 'how', type: 'string' }],
      },
    ]);
    const form = setup([item]);
    const answersPath = 'item.0.answer';

    act(() => setChoiceAnswers(form.current, item, answersPath, [coding('a'), coding('b')]));
    const [a] = getAnswers(form.current, answersPath);
    // Answered as useSyncedResponse lays out the follow-up items of an answer.
    act(() =>
      form.current.setFieldValue(`${answersPath}.0.item`, [{ linkId: 'how', answer: [{ valueString: 'Fresh' }] }])
    );

    act(() => setChoiceAnswers(form.current, item, answersPath, [coding('a'), coding('c')]));
    const answers = getAnswers(form.current, answersPath);
    expect(answers.map((answer) => answer.valueCoding?.code)).toStrictEqual(['a', 'c']);
    expect(answers[0].valueCoding).toStrictEqual(a.valueCoding);
    expect(answers[0].item?.[0].answer).toStrictEqual([{ valueString: 'Fresh' }]);
  });

  test('setChoiceAnswers clears the other answers when an exclusive option is selected, and the other way round', () => {
    const exclusive = [{ url: QUESTIONNAIRE_OPTION_EXCLUSIVE_URL, valueBoolean: true }];
    const [item] = toItems([
      {
        linkId: 'symptoms',
        type: 'choice',
        repeats: true,
        answerOption: [
          { valueCoding: coding('cough') },
          { valueCoding: coding('fever') },
          { valueCoding: coding('none'), extension: exclusive },
        ],
      },
    ]);
    const form = setup([item]);
    const codes = (): (string | undefined)[] =>
      getAnswers(form.current, 'item.0.answer').map((answer) => answer.valueCoding?.code);

    act(() => setChoiceAnswers(form.current, item, 'item.0.answer', [coding('cough'), coding('fever')]));
    expect(codes()).toStrictEqual(['cough', 'fever']);

    act(() =>
      setChoiceAnswers(form.current, item, 'item.0.answer', [coding('cough'), coding('fever'), coding('none')])
    );
    expect(codes()).toStrictEqual(['none']);

    act(() => setChoiceAnswers(form.current, item, 'item.0.answer', [coding('none'), coding('cough')]));
    expect(codes()).toStrictEqual(['cough']);
  });

  test('getAttachedText returns a display text of the question, or undefined', () => {
    const [item] = toItems([{ linkId: 'q', type: 'string' }]);
    item.displayTexts = { prompt: 'Type here', unit: '' };
    expect(getAttachedText(item, 'prompt')).toBe('Type here');
    expect(getAttachedText(item, 'unit')).toBeUndefined();
    expect(getAttachedText(item, 'lower')).toBeUndefined();
  });

  test('isChoiceTable needs a table item control and only choice questions with answer options', () => {
    const table = (control: string, item: QuestionnaireItem[]): ExtendedQuestionnaireItem => {
      const [group] = toItems([{ linkId: 'g', type: 'group', item }]);
      group.itemControl = { code: control };
      return group;
    };
    const choice: QuestionnaireItem = { linkId: 'c', type: 'choice', answerOption: [{ valueCoding: coding('a') }] };

    expect(isChoiceTable(table('table', [choice]))).toBe(true);
    expect(isChoiceTable(table('atable', [choice]))).toBe(true);
    expect(isChoiceTable(table('htable', [choice]))).toBe(true);
    expect(isChoiceTable(table('gtable', [choice]))).toBe(false);
    expect(isChoiceTable(table('table', []))).toBe(false);
    expect(isChoiceTable(table('table', [choice, { linkId: 's', type: 'string' }]))).toBe(false);
    expect(isChoiceTable(table('table', [{ linkId: 'v', type: 'choice', answerValueSet: 'urn:vs' }]))).toBe(false);
  });

  test('isGroupTable needs the gtable item control and only questions', () => {
    const table = (control: string, item: QuestionnaireItem[]): ExtendedQuestionnaireItem => {
      const [group] = toItems([{ linkId: 'g', type: 'group', item }]);
      group.itemControl = { code: control };
      return group;
    };
    const question: QuestionnaireItem = { linkId: 'q', type: 'string' };

    expect(isGroupTable(table('gtable', [question, { linkId: 'n', type: 'integer' }]))).toBe(true);
    expect(isGroupTable(table('table', [question]))).toBe(false);
    expect(isGroupTable(table('gtable', []))).toBe(false);
    expect(isGroupTable(table('gtable', [question, { linkId: 'd', type: 'display' }]))).toBe(false);
    expect(isGroupTable(table('gtable', [question, { linkId: 'sub', type: 'group' }]))).toBe(false);
  });
});
