// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
} from '@medplum/fhirtypes';
import { applyOptionExclusive } from '@medplum/react-hooks';
import type { ExtendedQuestionnaireItem } from './QuestionnaireFormV2.utils';
import {
  findFormItemByLinkId,
  fromFhirQuestionnaireItem,
  getValueByPath,
  isEmptyAnswerValue,
  isReadOnlyFormItem,
  isUsedInMode,
  rebuildFormItems,
  toFhirQuestionnaire,
  toFhirQuestionnaireItem,
} from './QuestionnaireFormV2.utils';
import {
  evaluateEnableWhen,
  getAnswerValue,
  getCalculatedAnswers,
  getGroupErrorKey,
  getInitialAnswerKeys,
  getRequiredGroupError,
  getResponseSignature,
  isShownInMode,
  removeResponseItems,
  syncResponseItems,
  toDraftAnswer,
  toDraftResponse,
  toFhirQuestionnaireResponse,
  validateFormAnswers,
} from './QuestionnaireResponse.utils';

function toFormValues(questionnaire: Questionnaire): Record<string, any> {
  return {
    ...questionnaire,
    item: (questionnaire.item ?? []).map((item: QuestionnaireItem, index: number) =>
      fromFhirQuestionnaireItem(item, questionnaire, index)
    ),
  };
}

/** The questionnaire, as the builder holds it, and the draft response of its answers. */
interface TestForm {
  values: Record<string, any>;
  response: QuestionnaireResponse;
}

function toForm(questionnaire: Questionnaire, response?: QuestionnaireResponse): TestForm {
  const values = toFormValues(questionnaire);
  return { values, response: toDraftResponse(values.item, response) };
}

function findResponseItem(
  responseItems: QuestionnaireResponseItem[] | undefined,
  linkId: string
): QuestionnaireResponseItem | undefined {
  for (const responseItem of responseItems ?? []) {
    if (responseItem.linkId === linkId) {
      return responseItem;
    }
    const found =
      findResponseItem(responseItem.item, linkId) ??
      responseItem.answer?.map((answer) => findResponseItem(answer.item, linkId)).find(Boolean);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function getItem(form: TestForm, linkId: string): ExtendedQuestionnaireItem {
  return findFormItemByLinkId(form.values.item, linkId) as ExtendedQuestionnaireItem;
}

/**
 * Answers a question, as its input would: its first response item, or the one at a response path (e.g. in the second
 * repetition of a group). The draft response is replaced, as the form replaces it.
 * @param form - The test form.
 * @param target - The question's linkId, or the response path of its response item.
 * @param values - The answer values.
 */
function answer(form: TestForm, target: string, ...values: any[]): void {
  const response = structuredClone(form.response);
  const responseItem = target.startsWith('item.')
    ? (getValueByPath(response, target) as QuestionnaireResponseItem)
    : (findResponseItem(response.item, target) as QuestionnaireResponseItem);
  const item = getItem(form, responseItem.linkId);
  responseItem.answer = values.map((value) => toDraftAnswer(item, value));
  form.response = { ...response, item: syncResponseItems(form.values.item, response.item) };
}

function isEnabled(form: TestForm, linkId: string, context = 'item'): boolean {
  return evaluateEnableWhen(form.values, form.response, getItem(form, linkId), context);
}

function validate(form: TestForm): Record<string, string> {
  return validateFormAnswers(form.values, form.response);
}

function submit(form: TestForm): QuestionnaireResponse {
  return toFhirQuestionnaireResponse(form.values, form.response);
}

describe('QuestionnaireResponse.utils', () => {
  test('the draft response answers each question, in each repetition of a group', () => {
    const { response } = toForm({
      resourceType: 'Questionnaire',
      status: 'active',
      item: [
        {
          linkId: 'g1',
          type: 'group',
          item: [
            { linkId: 'q1', type: 'string' },
            { linkId: 'note', type: 'display', text: 'Display text has no response item' },
          ],
        },
      ],
    });
    expect(response).toStrictEqual({
      resourceType: 'QuestionnaireResponse',
      status: 'in-progress',
      item: [{ linkId: 'g1', item: [{ linkId: 'q1', answer: [{}] }] }],
    });
  });

  describe('the draft response follows the questionnaire', () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      item: [
        { linkId: 'name', type: 'string' },
        { linkId: 'agree', type: 'boolean' },
        {
          linkId: 'colors',
          type: 'choice',
          repeats: true,
          answerOption: [{ valueCoding: { code: 'red' } }, { valueCoding: { code: 'blue' } }],
        },
        { linkId: 'g1', type: 'group', repeats: true, item: [{ linkId: 'inner', type: 'integer' }] },
      ],
    };

    test('answers are kept by linkId as items are reordered; removed items leave the response', () => {
      const form = toForm(questionnaire);
      answer(form, 'name', 'Alice');
      answer(form, 'agree', true);
      answer(form, 'colors', { code: 'red' }, { code: 'blue' });
      answer(form, 'inner', 7);

      const [name, agree, colors, group] = form.values.item;
      const reordered = rebuildFormItems({ ...form.values, item: [group, colors, agree, name] });
      expect(syncResponseItems(reordered, form.response.item)).toStrictEqual([
        { linkId: 'g1', item: [{ linkId: 'inner', answer: [{ valueInteger: 7 }] }] },
        { linkId: 'colors', answer: [{ valueCoding: { code: 'red' } }, { valueCoding: { code: 'blue' } }] },
        { linkId: 'agree', answer: [{ valueBoolean: true }] },
        { linkId: 'name', answer: [{ valueString: 'Alice' }] },
      ]);
      expect(syncResponseItems([name], form.response.item)).toStrictEqual([
        { linkId: 'name', answer: [{ valueString: 'Alice' }] },
      ]);
    });

    test('each repetition of a group keeps its answers', () => {
      const form = toForm(questionnaire, {
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [
          { linkId: 'g1', item: [{ linkId: 'inner', answer: [{ valueInteger: 3 }] }] },
          { linkId: 'g1', item: [{ linkId: 'inner', answer: [{ valueInteger: 9 }] }] },
        ],
      });
      expect(form.response.item?.filter((responseItem) => responseItem.linkId === 'g1')).toStrictEqual([
        { linkId: 'g1', item: [{ linkId: 'inner', answer: [{ valueInteger: 3 }] }] },
        { linkId: 'g1', item: [{ linkId: 'inner', answer: [{ valueInteger: 9 }] }] },
      ]);
    });

    test('a new question starts with its initial answers', () => {
      const form = toForm(questionnaire);
      const added = fromFhirQuestionnaireItem(
        { linkId: 'new', type: 'string', initial: [{ valueString: 'x' }] },
        null,
        4
      );
      expect(syncResponseItems([...form.values.item, added], form.response.item).at(-1)).toStrictEqual({
        linkId: 'new',
        answer: [{ valueString: 'x' }],
      });
    });

    test('repetitions and answers are kept within their minimum and maximum occurrences', () => {
      const form = toForm(questionnaire);
      const [name, , , group] = form.values.item;
      const repetitions = (): number =>
        syncResponseItems(form.values.item, form.response.item).filter((responseItem) => responseItem.linkId === 'g1')
          .length;

      group.minOccurs = 3;
      expect(repetitions()).toBe(3);
      form.response = toDraftResponse(form.values.item, form.response);
      group.minOccurs = 1;
      group.maxOccurs = 2;
      expect(repetitions()).toBe(2);

      name.repeats = true;
      name.minOccurs = 2;
      expect(syncResponseItems(form.values.item, form.response.item)[0].answer).toStrictEqual([{}, {}]);
      answer(form, 'name', 'Alice', 'Bob');
      name.repeats = false;
      expect(syncResponseItems(form.values.item, form.response.item)[0].answer).toStrictEqual([
        { valueString: 'Alice' },
      ]);
    });

    test('a question whose initial answers change can start over from them', () => {
      const form = toForm(questionnaire);
      answer(form, 'name', 'Alice');
      const before = getInitialAnswerKeys(form.values.item);
      form.values.item[0].initial = [{ value: 'Bob' }];
      const after = getInitialAnswerKeys(form.values.item);
      expect(after.get('name')).not.toBe(before.get('name'));
      expect(after.get('agree')).toBe(before.get('agree'));

      const reset = syncResponseItems(form.values.item, removeResponseItems(form.response.item, new Set(['name'])));
      expect(reset[0]).toStrictEqual({ linkId: 'name', answer: [{ valueString: 'Bob' }] });
    });
  });

  describe('evaluateEnableWhen', () => {
    function setup(enableWhen: any[], extraItems: QuestionnaireItem[] = []): TestForm {
      return toForm({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'num', type: 'integer' },
          {
            linkId: 'color',
            type: 'choice',
            repeats: true,
            answerOption: [
              { valueCoding: { code: 'red', display: 'Red' } },
              { valueCoding: { code: 'blue', display: 'Blue' } },
            ],
          },
          { linkId: 'g1', type: 'group', item: [{ linkId: 'inner', type: 'string' }] },
          ...extraItems,
          { linkId: 'target', type: 'string', enableWhen },
        ],
      });
    }

    test('numeric comparison', () => {
      const form = setup([{ question: 'num', operator: '>', answerInteger: 5 }]);
      expect(isEnabled(form, 'target')).toBe(false);
      answer(form, 'num', '7');
      expect(isEnabled(form, 'target')).toBe(true);
    });

    test('choice comparison with single and multiple selections', () => {
      const form = setup([{ question: 'color', operator: '=', answerCoding: { code: 'blue' } }]);
      answer(form, 'color', { code: 'red' });
      expect(isEnabled(form, 'target')).toBe(false);
      answer(form, 'color', { code: 'red' }, { code: 'blue' });
      expect(isEnabled(form, 'target')).toBe(true);
    });

    test('question inside a group', () => {
      const form = setup([{ question: 'inner', operator: '=', answerString: 'yes' }]);
      expect(isEnabled(form, 'target')).toBe(false);
      answer(form, 'inner', 'yes');
      expect(isEnabled(form, 'target')).toBe(true);
    });

    test('exists and empty', () => {
      const exists = setup([{ question: 'num', operator: 'exists', answerBoolean: true }]);
      expect(isEnabled(exists, 'target')).toBe(false);
      answer(exists, 'num', 3);
      expect(isEnabled(exists, 'target')).toBe(true);

      const empty = setup([{ question: 'num', operator: 'exists', answerBoolean: false }]);
      expect(getItem(empty, 'target').enableWhen[0].operator).toBe('empty');
      expect(isEnabled(empty, 'target')).toBe(true);
      // A repeating choice question with nothing selected has no answers at all
      const noColor = setup([{ question: 'color', operator: 'exists', answerBoolean: false }]);
      expect(isEnabled(noColor, 'target')).toBe(true);
    });

    test('incomplete conditions are ignored', () => {
      const form = setup([]);
      getItem(form, 'target').enableWhen = [{ question: null, operator: '', answer: '' }] as any;
      expect(isEnabled(form, 'target')).toBe(true);
    });
  });

  describe('QuestionnaireResponse', () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      id: 'q-1',
      status: 'active',
      item: [
        { linkId: 'name', type: 'string', text: 'Name' },
        { linkId: 'age', type: 'integer', text: 'Age' },
        {
          linkId: 'colors',
          type: 'choice',
          text: 'Colors',
          repeats: true,
          answerOption: [
            { valueCoding: { system: 'urn:x', code: 'red', display: 'Red' } },
            { valueCoding: { system: 'urn:x', code: 'blue', display: 'Blue' } },
          ],
        },
        {
          linkId: 'address',
          type: 'group',
          text: 'Address',
          repeats: true,
          item: [{ linkId: 'city', type: 'string', text: 'City' }],
        },
        {
          linkId: 'hidden',
          type: 'string',
          extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-hidden', valueBoolean: true }],
        },
        {
          linkId: 'follow-up',
          type: 'string',
          text: 'Follow up',
          enableWhen: [{ question: 'age', operator: '>', answerInteger: 60 }],
        },
      ],
    };

    const response: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [
        { linkId: 'name', text: 'Name', answer: [{ valueString: 'Alice' }] },
        { linkId: 'age', text: 'Age', answer: [{ valueInteger: 42 }] },
        {
          linkId: 'colors',
          text: 'Colors',
          answer: [
            { valueCoding: { system: 'urn:x', code: 'red', display: 'Red' } },
            { valueCoding: { system: 'urn:x', code: 'blue', display: 'Blue' } },
          ],
        },
        {
          linkId: 'address',
          text: 'Address',
          item: [{ linkId: 'city', text: 'City', answer: [{ valueString: 'Budapest' }] }],
        },
        {
          linkId: 'address',
          text: 'Address',
          item: [{ linkId: 'city', text: 'City', answer: [{ valueString: 'Vienna' }] }],
        },
      ],
    };

    function prefill(): TestForm {
      return toForm(questionnaire, response);
    }

    test('prefill reads group repetitions as sibling items', () => {
      const { response: draft } = prefill();
      expect(draft.item?.filter((responseItem) => responseItem.linkId === 'address')).toStrictEqual(
        response.item?.slice(3)
      );
    });

    test('round trip produces standard FHIR', () => {
      const result = submit(prefill());
      expect(result.questionnaire).toBe('Questionnaire/q-1');
      expect(result.status).toBe('completed');
      // Hidden and disabled (age is not > 60) items are left out; groups repeat as sibling items with nested `item`
      expect(result.item).toStrictEqual(response.item);
    });

    test('top-level items outside pages are left out of a paginated response', () => {
      const form = toForm({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'outside', type: 'string', initial: [{ valueString: 'not shown' }] },
          {
            linkId: 'page',
            type: 'group',
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                valueCodeableConcept: { coding: [{ code: 'page' }] },
              },
            ],
            item: [{ linkId: 'inside', type: 'string', initial: [{ valueString: 'shown' }] }],
          },
        ],
      });
      expect(submit(form).item).toStrictEqual([
        { linkId: 'page', item: [{ linkId: 'inside', answer: [{ valueString: 'shown' }] }] },
      ]);
    });

    test('display items are not in the response, and do not make a group present', () => {
      const form = toForm({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'intro', type: 'display', text: 'Welcome' },
          {
            linkId: 'group',
            type: 'group',
            item: [
              { linkId: 'note', type: 'display', text: 'A note' },
              { linkId: 'q', type: 'string' },
            ],
          },
        ],
      });
      expect(submit(form).item).toStrictEqual([]);

      answer(form, 'q', 'answer');
      expect(submit(form).item).toStrictEqual([
        { linkId: 'group', item: [{ linkId: 'q', answer: [{ valueString: 'answer' }] }] },
      ]);
    });

    test('unanswered questions are left out and numbers are typed', () => {
      const form = prefill();
      answer(form, 'name', '  ');
      answer(form, 'age', '61');
      answer(form, 'follow-up', 'yes');
      const result = submit(form);
      expect(result.item?.map((item) => item.linkId)).toStrictEqual([
        'age',
        'colors',
        'address',
        'address',
        'follow-up',
      ]);
      expect(result.item?.[0].answer).toStrictEqual([{ valueInteger: 61 }]);
    });
  });

  describe('validateFormAnswers', () => {
    function setup(item: QuestionnaireItem): TestForm {
      return toForm({ resourceType: 'Questionnaire', status: 'active', item: [item] });
    }

    test('required', () => {
      const form = setup({ linkId: 'q', type: 'string', text: 'Name', required: true });
      expect(validate(form)).toStrictEqual({ 'item.0.answer.0': 'This field is required' });
      answer(form, 'q', 'Alice');
      expect(validate(form)).toStrictEqual({});
    });

    test('regex and length', () => {
      const form = setup({
        linkId: 'q',
        type: 'string',
        text: 'Zip',
        maxLength: 5,
        extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/regex', valueString: '^[0-9]+$' }],
      });
      answer(form, 'q', 'abc');
      expect(validate(form)).toStrictEqual({ 'item.0.answer.0': 'Zip format is invalid' });
      answer(form, 'q', '123456');
      expect(validate(form)).toStrictEqual({ 'item.0.answer.0': 'Zip cannot exceed 5 characters' });
      answer(form, 'q', '12345');
      expect(validate(form)).toStrictEqual({});
    });

    test('value range', () => {
      const form = setup({
        linkId: 'q',
        type: 'integer',
        text: 'Age',
        extension: [
          { url: 'http://hl7.org/fhir/StructureDefinition/minValue', valueInteger: 18 },
          { url: 'http://hl7.org/fhir/StructureDefinition/maxValue', valueInteger: 99 },
        ],
      });
      answer(form, 'q', '17');
      expect(validate(form)).toStrictEqual({ 'item.0.answer.0': 'Age must be at least 18' });
      answer(form, 'q', '100');
      expect(validate(form)).toStrictEqual({ 'item.0.answer.0': 'Age cannot exceed 99' });
    });

    test('a regex must match the whole value', () => {
      const form = setup({
        linkId: 'q',
        type: 'string',
        text: 'Zip',
        extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/regex', valueString: '[0-9]{5}' }],
      });
      answer(form, 'q', 'abc12345xyz');
      expect(validate(form)).toStrictEqual({ 'item.0.answer.0': 'Zip format is invalid' });
      answer(form, 'q', '1234');
      expect(validate(form)).toStrictEqual({ 'item.0.answer.0': 'Zip format is invalid' });
      answer(form, 'q', '12345');
      expect(validate(form)).toStrictEqual({});
      // An empty answer is not checked (only required is)
      answer(form, 'q', '');
      expect(validate(form)).toStrictEqual({});
    });

    test('dateTime values keep their local time through save and load', () => {
      const item = fromFhirQuestionnaireItem({ linkId: 'a', type: 'dateTime' }, null, 0);
      item.initial = [{ value: '2026-09-29T10:00' }];
      item.minValue = '2026-09-29T09:30';
      item.maxValue = '2026-09-29T18:00';

      let current = item;
      for (let i = 0; i < 2; i++) {
        current = fromFhirQuestionnaireItem(toFhirQuestionnaireItem(current), null, 0);
      }
      expect(current.initial[0].value).toBe('2026-09-29T10:00');
      expect(getAnswerValue(current, toDraftResponse([current]).item?.[0].answer?.[0])).toBe('2026-09-29T10:00');
      expect(current.minValue).toBe('2026-09-29T09:30');
      expect(current.maxValue).toBe('2026-09-29T18:00');
      // Saved as the UTC instant of that local time
      expect(toFhirQuestionnaireItem(current).initial?.[0].valueDateTime).toBe(
        new Date('2026-09-29T10:00').toISOString()
      );
    });

    test('a URL must be a full link, within its max length', () => {
      const form = setup({ linkId: 'q', type: 'url', text: 'Website', maxLength: 25 });
      for (const valid of [
        'https://example.com',
        'http://localhost:3000/a',
        'ftp://files.example.com',
        'mailto:a@b.co',
      ]) {
        answer(form, 'q', valid);
        expect(validate(form)).toStrictEqual({});
      }
      for (const invalid of ['example.com', 'www.example.com', 'https://', 'hello world', 'javascript:alert(1)']) {
        answer(form, 'q', invalid);
        expect(validate(form)).toStrictEqual({
          'item.0.answer.0': 'Website must be a full link, e.g. https://example.com',
        });
      }
      answer(form, 'q', 'https://example.com/a-long-path');
      expect(validate(form)).toStrictEqual({
        'item.0.answer.0': 'Website cannot exceed 25 characters',
      });
      expect(toFhirQuestionnaireItem(form.values.item[0]).maxLength).toBe(25);
    });

    test('an invalid regex in the definition is ignored', () => {
      const form = setup({
        linkId: 'q',
        type: 'string',
        extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/regex', valueString: '([' }],
      });
      answer(form, 'q', 'anything');
      expect(validate(form)).toStrictEqual({});
    });

    test('required repeating choice reports on the answer list', () => {
      const form = setup({
        linkId: 'q',
        type: 'choice',
        required: true,
        repeats: true,
        answerOption: [{ valueCoding: { code: 'a' } }],
      });
      expect(form.response.item?.[0].answer).toStrictEqual([]);
      expect(validate(form)).toStrictEqual({ 'item.0.answer': 'This field is required' });
    });
  });

  describe('follow-up items', () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      id: 'smoking',
      status: 'active',
      item: [
        {
          linkId: 'smoke',
          type: 'boolean',
          text: 'Do you smoke?',
          item: [
            {
              linkId: 'how-many',
              type: 'integer',
              text: 'How many per day?',
              enableWhen: [{ question: 'smoke', operator: '=', answerBoolean: true }],
            },
          ],
        },
        {
          linkId: 'meds',
          type: 'choice',
          text: 'Which medications?',
          repeats: true,
          answerOption: [
            { valueCoding: { system: 'x', code: 'a', display: 'Aspirin' } },
            { valueCoding: { system: 'x', code: 'b', display: 'Ibuprofen' } },
          ],
          item: [
            {
              linkId: 'dose',
              type: 'string',
              text: 'Dose',
              enableWhen: [{ question: 'meds', operator: '=', answerCoding: { system: 'x', code: 'a' } }],
            },
          ],
        },
      ],
    };

    const response: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [
        {
          linkId: 'smoke',
          text: 'Do you smoke?',
          answer: [
            {
              valueBoolean: true,
              item: [{ linkId: 'how-many', text: 'How many per day?', answer: [{ valueInteger: 10 }] }],
            },
          ],
        },
        {
          linkId: 'meds',
          text: 'Which medications?',
          answer: [
            {
              valueCoding: { system: 'x', code: 'a', display: 'Aspirin' },
              item: [{ linkId: 'dose', text: 'Dose', answer: [{ valueString: '100 mg' }] }],
            },
            { valueCoding: { system: 'x', code: 'b', display: 'Ibuprofen' } },
          ],
        },
      ],
    };

    function prefill(): TestForm {
      return toForm(questionnaire, response);
    }

    test('each answer has its own follow-up items, prefilled from answer.item', () => {
      const form = prefill();
      expect(form.values.item[1].item[0].path).toBe('item.1.item.0');
      expect(form.response.item?.[1].answer).toStrictEqual([
        {
          valueCoding: { system: 'x', code: 'a', display: 'Aspirin' },
          item: [{ linkId: 'dose', text: 'Dose', answer: [{ valueString: '100 mg' }] }],
        },
        { valueCoding: { system: 'x', code: 'b', display: 'Ibuprofen' }, item: [{ linkId: 'dose', answer: [{}] }] },
      ]);
    });

    test('a condition on the question is evaluated against the answer the follow-up item belongs to', () => {
      const form = prefill();
      expect(isEnabled(form, 'dose', 'item.1.answer.0.item')).toBe(true);
      expect(isEnabled(form, 'dose', 'item.1.answer.1.item')).toBe(false);

      answer(form, 'smoke', false);
      expect(isEnabled(form, 'how-many', 'item.0.answer.0.item')).toBe(false);
    });

    test('follow-up answers are written under their answer', () => {
      expect(submit(prefill()).item).toStrictEqual(response.item);
    });

    test('follow-up answers are kept as the questionnaire is edited', () => {
      const form = prefill();
      expect(syncResponseItems(rebuildFormItems(form.values), form.response.item)).toStrictEqual(form.response.item);
    });

    test('follow-up items are validated when their answer is given', () => {
      const form = prefill();
      form.values.item[0].item[0].minValue = 20;
      expect(validate(form)).toStrictEqual({
        'item.0.answer.0.item.0.answer.0': 'How many per day? must be at least 20',
      });
      answer(form, 'smoke', false);
      expect(validate(form)).toStrictEqual({});
    });
  });

  describe('groups', () => {
    const pageExtension = {
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
      valueCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/questionnaire-item-control', code: 'page' }] },
    };

    function createForm(): TestForm {
      return toForm({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'page',
            type: 'group',
            extension: [pageExtension],
            item: [
              {
                linkId: 'contact',
                type: 'group',
                text: 'Contact details',
                item: [
                  { linkId: 'address', type: 'group', item: [{ linkId: 'street', type: 'string' }] },
                  { linkId: 'email', type: 'string' },
                ],
              },
              { linkId: 'note', type: 'display', text: 'A note' },
            ],
          },
        ],
      });
    }

    // Where the renderer answers them: page repetition 0 -> contact repetition 0 -> ...
    const contactContext = 'item.0.item';

    const emailContext = 'item.0.item.0.item';

    test('conditions are read from the definition, so an edit applies right away', () => {
      const form = createForm();
      expect(isEnabled(form, 'email', emailContext)).toBe(true);
      getItem(form, 'email').enableWhen = [
        { question: getItem(form, 'street') as unknown as QuestionnaireItem, operator: 'exists', answer: true },
      ];
      expect(isEnabled(form, 'email', emailContext)).toBe(false);
      answer(form, 'street', 'Main St');
      expect(isEnabled(form, 'email', emailContext)).toBe(true);
    });

    test('a condition on a question in the same group is about its own repetition', () => {
      const form = toForm({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'pain',
            type: 'group',
            repeats: true,
            item: [
              { linkId: 'hurts', type: 'boolean' },
              {
                linkId: 'where',
                type: 'string',
                enableWhen: [{ question: 'hurts', operator: '=', answerBoolean: true }],
              },
            ],
          },
        ],
      });
      form.response = toDraftResponse(form.values.item, {
        resourceType: 'QuestionnaireResponse',
        status: 'in-progress',
        item: [
          { linkId: 'pain', item: [{ linkId: 'hurts', answer: [{ valueBoolean: false }] }] },
          { linkId: 'pain', item: [{ linkId: 'hurts', answer: [{ valueBoolean: true }] }] },
        ],
      });
      expect(isEnabled(form, 'where', 'item.0.item')).toBe(false);
      expect(isEnabled(form, 'where', 'item.1.item')).toBe(true);
    });

    test('an item in a read-only group is read only', () => {
      const form = createForm();
      expect(isReadOnlyFormItem(form.values, getItem(form, 'street'))).toBe(false);
      getItem(form, 'contact').readOnly = true;
      expect(isReadOnlyFormItem(form.values, getItem(form, 'street'))).toBe(true);
      expect(isReadOnlyFormItem(form.values, getItem(form, 'contact'))).toBe(true);
      expect(isReadOnlyFormItem(form.values, getItem(form, 'page'))).toBe(false);
    });

    test('a required group needs at least one answered question', () => {
      const form = createForm();
      const groupError = (): string | undefined =>
        getRequiredGroupError(form.values, form.response, getItem(form, 'contact'), contactContext);
      expect(groupError()).toBeUndefined();

      getItem(form, 'contact').required = true;
      expect(groupError()).toBe('Answer at least one question in this group');
      expect(validate(form)).toStrictEqual({
        [getGroupErrorKey(contactContext, 'contact')]: 'Answer at least one question in this group',
      });

      // An answer in a nested group counts
      answer(form, 'street', 'Main St');
      expect(groupError()).toBeUndefined();
      expect(validate(form)).toStrictEqual({});

      // Unless the question is hidden: it is not in the response
      getItem(form, 'street').hidden = true;
      expect(groupError()).toBeDefined();
    });

    test('a required page needs an answered question; display text does not count', () => {
      const form = createForm();
      getItem(form, 'page').required = true;
      expect(getRequiredGroupError(form.values, form.response, getItem(form, 'page'), 'item')).toBe(
        'Answer at least one question on this page'
      );
      answer(form, 'email', 'a@example.com');
      expect(getRequiredGroupError(form.values, form.response, getItem(form, 'page'), 'item')).toBeUndefined();
    });

    test('a required repeating group needs minOccurs answered repetitions', () => {
      const form = toForm({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'meds',
            type: 'group',
            required: true,
            repeats: true,
            extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-minOccurs', valueInteger: 2 }],
            item: [{ linkId: 'name', type: 'string' }],
          },
        ],
      });
      expect(form.response.item).toHaveLength(2);
      answer(form, 'item.0.item.0', 'Aspirin');
      expect(getRequiredGroupError(form.values, form.response, getItem(form, 'meds'), 'item')).toBe(
        'Answer at least one question in this group in 2 repetitions'
      );
      answer(form, 'item.1.item.0', 'Ibuprofen');
      expect(getRequiredGroupError(form.values, form.response, getItem(form, 'meds'), 'item')).toBeUndefined();
    });

    test('read-only groups and questions are not required of the respondent', () => {
      const form = createForm();
      getItem(form, 'contact').required = true;
      getItem(form, 'email').required = true;
      getItem(form, 'contact').readOnly = true;
      expect(validate(form)).toStrictEqual({});
    });
  });

  describe('choice answers', () => {
    const colors: QuestionnaireItem = {
      linkId: 'color',
      type: 'choice',
      text: 'Favourite color',
      answerOption: [{ valueString: 'Red' }, { valueString: 'Blue', initialSelected: true }],
    };

    const count: QuestionnaireItem = {
      linkId: 'count',
      type: 'choice',
      answerOption: [{ valueInteger: 1 }, { valueInteger: 2 }],
    };

    const time: QuestionnaireItem = {
      linkId: 'time',
      type: 'choice',
      answerOption: [{ valueTime: '09:00:00' }, { valueTime: '17:30:00' }],
    };

    test('answers are written with the value type of their option; typed answers as strings', () => {
      const form = toForm({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [colors, count, time, { ...colors, linkId: 'open', type: 'open-choice' }],
      });
      // The initially selected plain option is the initial answer
      expect(form.response.item?.[0].answer).toStrictEqual([{ valueString: 'Blue' }]);
      answer(form, 'count', 2);
      answer(form, 'time', '17:30:00');
      answer(form, 'open', 'Green');
      expect(submit(form).item?.map((item) => item.answer)).toStrictEqual([
        [{ valueString: 'Blue' }],
        [{ valueInteger: 2 }],
        [{ valueTime: '17:30:00' }],
        [{ valueString: 'Green' }],
      ]);
    });

    test('prefilled choice answers match their options', () => {
      const form = toForm(
        { resourceType: 'Questionnaire', status: 'active', item: [time, count] },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [
            { linkId: 'time', answer: [{ valueTime: '17:30:00' }] },
            { linkId: 'count', answer: [{ valueInteger: 2 }] },
          ],
        }
      );
      const [timeItem, countItem] = form.values.item;
      expect(getAnswerValue(timeItem, form.response.item?.[0].answer?.[0])).toBe(timeItem.answerOption[1].value);
      expect(getAnswerValue(countItem, form.response.item?.[1].answer?.[0])).toBe(countItem.answerOption[1].value);
    });

    test('number conditions compare numbers, and ignore unanswered questions', () => {
      const form = toForm({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'children', type: 'integer' },
          { linkId: 'many', type: 'string', enableWhen: [{ question: 'children', operator: '>', answerInteger: 9 }] },
          { linkId: 'none', type: 'string', enableWhen: [{ question: 'children', operator: '<', answerInteger: 1 }] },
        ],
      });
      // Typed into a number field, answers are text until they are written
      answer(form, 'children', '10');
      expect(isEnabled(form, 'many')).toBe(true);
      answer(form, 'children', '');
      expect(isEnabled(form, 'many')).toBe(false);
      expect(isEnabled(form, 'none')).toBe(false);
      answer(form, 'children', '0');
      expect(isEnabled(form, 'none')).toBe(true);
    });

    test('conditions on plain-value options are typed and evaluated by value', () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          colors,
          count,
          {
            linkId: 'why-red',
            type: 'string',
            enableWhen: [{ question: 'color', operator: '=', answerString: 'Red' }],
          },
          { linkId: 'two', type: 'string', enableWhen: [{ question: 'count', operator: '!=', answerInteger: 2 }] },
        ],
      };
      const form = toForm(questionnaire);
      expect(toFhirQuestionnaire(form.values).item?.[2].enableWhen).toStrictEqual([
        { question: 'color', operator: '=', answerString: 'Red' },
      ]);
      expect(toFhirQuestionnaire(form.values).item?.[3].enableWhen).toStrictEqual([
        { question: 'count', operator: '!=', answerInteger: 2 },
      ]);

      expect(isEnabled(form, 'why-red')).toBe(false);
      answer(form, 'color', 'Red');
      expect(isEnabled(form, 'why-red')).toBe(true);

      answer(form, 'count', 2);
      expect(isEnabled(form, 'two')).toBe(false);
      answer(form, 'count', 1);
      expect(isEnabled(form, 'two')).toBe(true);
    });
  });

  describe('quantity answers', () => {
    const kg = { system: 'http://unitsofmeasure.org', code: 'kg', display: 'kilogram' };

    const lb = { system: 'http://unitsofmeasure.org', code: '[lb_av]', display: 'pound' };

    test('answers keep their comparator and unit through prefill and the response', () => {
      const weight: QuestionnaireItem = {
        linkId: 'weight',
        type: 'quantity',
        text: 'Weight',
        extension: [
          { url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unitOption', valueCoding: kg },
          { url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unitOption', valueCoding: lb },
        ],
      };
      const quantity = { comparator: '<' as const, value: 80, unit: 'kilogram', system: kg.system, code: 'kg' };
      const form = toForm(
        { resourceType: 'Questionnaire', status: 'active', item: [weight] },
        {
          resourceType: 'QuestionnaireResponse',
          status: 'completed',
          item: [{ linkId: 'weight', answer: [{ valueQuantity: quantity }] }],
        }
      );
      expect(getAnswerValue(getItem(form, 'weight'), form.response.item?.[0].answer?.[0])).toStrictEqual(quantity);
      expect(submit(form).item?.[0].answer).toStrictEqual([{ valueQuantity: quantity }]);
    });

    test('a typed value is written as a number; without a chosen unit the fixed unit is used', () => {
      const form = toForm({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'free', type: 'quantity' },
          {
            linkId: 'fixed',
            type: 'quantity',
            extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unit', valueCoding: kg }],
          },
        ],
      });
      answer(form, 'free', { value: '1.5', unit: 'cups' });
      answer(form, 'fixed', { value: '72' });
      expect(form.response.item?.[0].answer).toStrictEqual([{ valueQuantity: { value: 1.5, unit: 'cups' } }]);
      expect(submit(form).item?.map((item) => item.answer)).toStrictEqual([
        [{ valueQuantity: { value: 1.5, unit: 'cups' } }],
        [{ valueQuantity: { value: 72, unit: 'kilogram', system: 'http://unitsofmeasure.org', code: 'kg' } }],
      ]);
    });

    test('a quantity with only a unit is unanswered; ranges and conditions use its value', () => {
      const form = toForm({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'weight',
            type: 'quantity',
            text: 'Weight',
            required: true,
            extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/minValue', valueDecimal: 2 }],
          },
          {
            linkId: 'heavy',
            type: 'string',
            enableWhen: [{ question: 'weight', operator: '>', answerQuantity: { value: 100 } }],
          },
        ],
      });
      answer(form, 'weight', { value: undefined, unit: 'kg' });
      expect(form.response.item?.[0].answer).toStrictEqual([{ valueQuantity: { unit: 'kg' } }]);
      expect(isEmptyAnswerValue(getAnswerValue(getItem(form, 'weight'), form.response.item?.[0].answer?.[0]))).toBe(
        true
      );
      expect(validate(form)).toStrictEqual({ 'item.0.answer.0': 'This field is required' });

      answer(form, 'weight', { value: '120', unit: 'kg' });
      expect(validate(form)).toStrictEqual({});
      expect(isEnabled(form, 'heavy')).toBe(true);
      answer(form, 'weight', { value: '1', unit: 'kg' });
      expect(validate(form)).toStrictEqual({ 'item.0.answer.0': 'Weight must be at least 2' });
      expect(isEnabled(form, 'heavy')).toBe(false);
    });

    test('with one allowed unit, that unit is the unit of the answer', () => {
      const form = toForm({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'weight',
            type: 'quantity',
            extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unitOption', valueCoding: kg }],
          },
        ],
      });
      answer(form, 'weight', { value: '70' });
      expect(submit(form).item?.[0].answer).toStrictEqual([
        { valueQuantity: { value: 70, unit: 'kilogram', system: 'http://unitsofmeasure.org', code: 'kg' } },
      ]);
    });
  });

  describe('reference questions', () => {
    test('answers are references', () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [{ linkId: 'doctor', type: 'reference', text: 'Doctor' }],
      };
      const reference = { reference: 'Practitioner/123', display: 'Dr. Alice Smith' };
      const form = toForm(questionnaire, {
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [{ linkId: 'doctor', answer: [{ valueReference: reference }] }],
      });
      expect(getAnswerValue(getItem(form, 'doctor'), form.response.item?.[0].answer?.[0])).toStrictEqual(reference);
      expect(submit(form).item?.[0].answer).toStrictEqual([{ valueReference: reference }]);
    });
  });

  describe('attachment questions', () => {
    test('answers are attachments, and are required like any answer', () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [{ linkId: 'photo', type: 'attachment', text: 'Photo', required: true }],
      };
      const attachment = { contentType: 'image/png', url: 'Binary/123', title: 'photo.png' };
      expect(validate(toForm(questionnaire))).toStrictEqual({ 'item.0.answer.0': 'This field is required' });

      const form = toForm(questionnaire, {
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [{ linkId: 'photo', answer: [{ valueAttachment: attachment }] }],
      });
      expect(getAnswerValue(getItem(form, 'photo'), form.response.item?.[0].answer?.[0])).toStrictEqual(attachment);
      expect(validate(form)).toStrictEqual({});
      expect(submit(form).item?.[0].answer).toStrictEqual([{ valueAttachment: attachment }]);
    });
  });

  describe('signature', () => {
    test('the signature is written to the response as Medplum writes it, and read back', () => {
      const signature = {
        type: [{ code: 'ProofOfOrigin' }],
        when: '2026-09-29T10:00:00.000Z',
        who: { reference: 'Practitioner/1' },
        data: 'abc',
      };
      const form = toForm({ resourceType: 'Questionnaire', status: 'active', item: [] });
      const response = toFhirQuestionnaireResponse(form.values, form.response, signature);
      expect(response.extension).toStrictEqual([
        { url: 'http://hl7.org/fhir/StructureDefinition/questionnaireresponse-signature', valueSignature: signature },
      ]);
      expect(getResponseSignature(response)).toStrictEqual(signature);
      expect(submit(form).extension).toBeUndefined();
    });
  });

  describe('usage mode', () => {
    const usageMode = (code: string): any => ({
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-usageMode',
      valueCode: code,
    });

    function createForm(): TestForm {
      return toForm({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'both', type: 'string' },
          { linkId: 'capture', type: 'string', required: true, extension: [usageMode('capture')] },
          {
            linkId: 'display',
            type: 'string',
            required: true,
            extension: [usageMode('display')],
            initial: [{ valueString: 'summary' }],
          },
          { linkId: 'display-non-empty', type: 'string', extension: [usageMode('display-non-empty')] },
          { linkId: 'capture-display-non-empty', type: 'string', extension: [usageMode('capture-display-non-empty')] },
        ],
      });
    }

    test('which items are shown when filling in and when viewing answers', () => {
      const form = createForm();
      const shown = (mode: 'capture' | 'display'): string[] =>
        form.values.item
          .filter((item: any) => isShownInMode(form.values, form.response, item, 'item', mode))
          .map((item: any) => item.linkId);

      expect(shown('capture')).toStrictEqual(['both', 'capture', 'capture-display-non-empty']);
      expect(shown('display')).toStrictEqual(['both', 'display']);

      answer(form, 'display-non-empty', 'a');
      answer(form, 'capture-display-non-empty', 'b');
      expect(shown('display')).toStrictEqual(['both', 'display', 'display-non-empty', 'capture-display-non-empty']);
      expect(isUsedInMode(undefined, 'display')).toBe(true);
    });

    test('items not filled in are not validated and not in the response', () => {
      const form = createForm();
      expect(validate(form)).toStrictEqual({ 'item.1.answer.0': 'This field is required' });
      answer(form, 'capture', 'captured');
      expect(submit(form).item?.map((item) => item.linkId)).toStrictEqual(['capture']);
    });
  });

  describe('item controls', () => {
    const coding = (code: string): { system: string; code: string } => ({
      system: 'http://hl7.org/fhir/questionnaire-item-control',
      code,
    });

    const control = (code: string): any => ({
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
      valueCodeableConcept: { coding: [coding(code)] },
    });

    test('yes/no radio buttons start unanswered; a switch starts off', () => {
      const form = toForm({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'buttons', type: 'boolean', extension: [control('radio-button')] },
          { linkId: 'switch', type: 'boolean' },
        ],
      });
      expect(form.response.item).toStrictEqual([
        { linkId: 'buttons', answer: [{}] },
        { linkId: 'switch', answer: [{ valueBoolean: false }] },
      ]);
    });
  });

  describe('exclusive options and reference profiles', () => {
    const exclusive = {
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionExclusive',
      valueBoolean: true,
    };

    test('exclusive options are read, saved, and clear the other answers as in Medplum', () => {
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'symptoms',
            type: 'choice',
            repeats: true,
            answerOption: [
              { valueCoding: { code: 'fever', display: 'Fever' } },
              { valueCoding: { code: 'cough', display: 'Cough' } },
              { valueCoding: { code: 'none', display: 'None of the above' }, extension: [exclusive] },
            ],
          },
        ],
      });
      const options = values.item[0].answerOption;
      expect(options.map((option: any) => !!option.exclusive)).toStrictEqual([false, false, true]);
      expect(toFhirQuestionnaire(values).item?.[0].answerOption?.[2].extension).toStrictEqual([exclusive]);

      // Answers are written as their options, so Medplum's applyOptionExclusive recognizes the exclusive one.
      const item = toFhirQuestionnaireItem(values.item[0]);
      const [fever, cough, none] = options.map((option: any) => toDraftAnswer(values.item[0], option.value));
      expect(none).toStrictEqual({ valueCoding: { code: 'none', display: 'None of the above' } });
      expect(applyOptionExclusive(item, [fever, cough], [fever, cough, none])).toStrictEqual([none]);
      expect(applyOptionExclusive(item, [none], [none, fever])).toStrictEqual([fever]);
      expect(applyOptionExclusive(item, [fever, cough], [fever])).toStrictEqual([fever]);
      expect(applyOptionExclusive({ ...item, answerOption: [] }, [none], [none, fever])).toStrictEqual([none, fever]);
    });
  });

  describe('option prefix and decimal places', () => {
    test('decimal places are saved as maxDecimalPlaces and checked', () => {
      const form = toForm({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'temp',
            type: 'decimal',
            text: 'Temperature',
            extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/maxDecimalPlaces', valueInteger: 1 }],
          },
          { linkId: 'weight', type: 'quantity', text: 'Weight' },
        ],
      });
      expect(form.values.item[0].maxDecimalPlaces).toBe(1);
      answer(form, 'temp', '36.6');
      expect(validate(form)).toStrictEqual({});
      answer(form, 'temp', '36.65');
      expect(validate(form)).toStrictEqual({
        'item.0.answer.0': 'Temperature can have at most 1 decimal place',
      });

      answer(form, 'temp', '36.6');
      form.values.item[1].maxDecimalPlaces = '0';
      answer(form, 'weight', { value: '72.5', unit: 'kg' });
      expect(validate(form)).toStrictEqual({ 'item.1.answer.0': 'Weight must be a whole number' });
      expect(toFhirQuestionnaire(form.values).item?.[1].extension).toContainEqual({
        url: 'http://hl7.org/fhir/StructureDefinition/maxDecimalPlaces',
        valueInteger: 0,
      });
    });
  });

  describe('SDC expressions', () => {
    const ENABLE_WHEN_EXPRESSION_URL =
      'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-enableWhenExpression';

    const CALCULATED_EXPRESSION_URL =
      'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression';

    const answerOf = (linkId: string): string => `%resource.item.where(linkId='${linkId}').answer.value`;

    function expression(url: string, value: string): QuestionnaireItem['extension'] {
      return [{ url, valueExpression: { language: 'text/fhirpath', expression: value } }];
    }

    function setup(items: QuestionnaireItem[]): TestForm {
      return toForm({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [{ linkId: 'height', type: 'decimal' }, { linkId: 'weight', type: 'decimal' }, ...items],
      });
    }

    // The form is answered on a copy, as the draft response changes by being replaced.
    function answered(form: TestForm, answers: Record<string, any>): TestForm {
      const copy = { ...form };
      for (const [linkId, value] of Object.entries(answers)) {
        answer(copy, linkId, value);
      }
      return copy;
    }

    test('enableWhenExpression takes the place of enableWhen', () => {
      const form = setup([
        {
          linkId: 'target',
          type: 'string',
          enableWhen: [{ question: 'height', operator: 'exists', answerBoolean: true }],
          extension: expression(ENABLE_WHEN_EXPRESSION_URL, `${answerOf('weight')} > 100`),
        },
      ]);
      expect(isEnabled(form, 'target')).toBe(false);
      expect(isEnabled(answered(form, { height: 180 }), 'target')).toBe(false);
      expect(isEnabled(answered(form, { weight: 120 }), 'target')).toBe(true);
    });

    test('an enableWhenExpression that fails falls back to enableWhen', () => {
      const form = answered(
        setup([
          {
            linkId: 'target',
            type: 'string',
            enableWhen: [{ question: 'height', operator: 'exists', answerBoolean: true }],
            extension: expression(ENABLE_WHEN_EXPRESSION_URL, '%resource.item.unknown()'),
          },
        ]),
        { height: 180 }
      );
      expect(isEnabled(form, 'target')).toBe(true);
    });

    test('calculatedExpression calculates answers', () => {
      const bmi = `(${answerOf('weight')} / (${answerOf('height')} / 100).power(2)).round(1)`;
      const form = setup([{ linkId: 'bmi', type: 'decimal', extension: expression(CALCULATED_EXPRESSION_URL, bmi) }]);
      const calculated = (answers: Record<string, any>): unknown => {
        const { values, response } = answered(form, answers);
        return getCalculatedAnswers(values, response);
      };
      expect(calculated({ height: 180, weight: 72.5 })).toEqual([
        { answerPath: 'item.2.answer.0', answer: { valueDecimal: 22.4 } },
      ]);
      // Without a result, the answer is cleared.
      expect(calculated({ height: 180 })).toEqual([{ answerPath: 'item.2.answer.0', answer: {} }]);
    });

    test('calculatedExpression errors', () => {
      const { values, response } = answered(
        setup([
          { linkId: 'broken', type: 'decimal', extension: expression(CALCULATED_EXPRESSION_URL, 'item.where(linkId=') },
          { linkId: 'text', type: 'decimal', extension: expression(CALCULATED_EXPRESSION_URL, "'heavy'") },
        ]),
        { weight: 72.5 }
      );
      const [broken, text] = getCalculatedAnswers(values, response);
      expect(broken.answerPath).toBe('item.2.answer.0');
      expect(broken.error).toMatch(/^Expression evaluation failed: /);
      expect(text).toEqual({
        answerPath: 'item.3.answer.0',
        error: "The expression's result is a string, not a decimal",
      });
    });

    test('calculatedExpression in each group repetition', () => {
      const { values, response } = setup([
        {
          linkId: 'visits',
          type: 'group',
          repeats: true,
          extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-minOccurs', valueInteger: 2 }],
          item: [{ linkId: 'total', type: 'integer', extension: expression(CALCULATED_EXPRESSION_URL, '1 + 1') }],
        },
      ]);
      expect(getCalculatedAnswers(values, response)).toEqual([
        { answerPath: 'item.2.item.0.answer.0', answer: { valueInteger: 2 } },
        { answerPath: 'item.3.item.0.answer.0', answer: { valueInteger: 2 } },
      ]);
    });

    test('expressions are kept on save', () => {
      const extension = expression(CALCULATED_EXPRESSION_URL, '1 + 1');
      const exported = toFhirQuestionnaire(setup([{ linkId: 'total', type: 'integer', extension }]).values);
      expect(exported.item?.[2].extension).toEqual(expect.arrayContaining(extension ?? []));
    });
  });
});
