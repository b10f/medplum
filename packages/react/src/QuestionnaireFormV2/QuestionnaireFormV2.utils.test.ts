// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Questionnaire, QuestionnaireItem, QuestionnaireResponse } from '@medplum/fhirtypes';
import {
  applyExclusiveOptions,
  evaluateEnableWhen,
  findFormItemByLinkId,
  fromFhirQuestionnaireItem,
  getAnswerOptionDisplay,
  getCalculatedAnswers,
  getPageItems,
  getReferenceFilterError,
  getReferenceSearchCriteria,
  getRequiredGroupError,
  getResponseSignature,
  getValueByPath,
  hasFollowUpItems,
  isEmptyAnswerValue,
  isHelpItem,
  isHorizontalChoiceLayout,
  isPageItem,
  isReadOnlyFormItem,
  isShownInMode,
  isUsedInMode,
  PAGE_ITEM_CONTROL,
  rebuildFormItems,
  toFhirQuestionnaire,
  toFhirQuestionnaireItem,
  toFhirQuestionnaireResponse,
  validateFormAnswers,
} from './QuestionnaireFormV2.utils';

function toFormValues(questionnaire: Questionnaire): Record<string, any> {
  return {
    ...questionnaire,
    item: (questionnaire.item ?? []).map((item: QuestionnaireItem, index: number) =>
      fromFhirQuestionnaireItem(item, questionnaire, index)
    ),
  };
}

describe('QuestionnaireFormV2.utils', () => {
  test('rebuildFormItems recomputes paths after reordering', () => {
    const values = toFormValues({
      resourceType: 'Questionnaire',
      status: 'active',
      item: [
        { linkId: 'q1', type: 'string', text: 'Question 1' },
        { linkId: 'g1', type: 'group', text: 'Group', item: [{ linkId: 'q2', type: 'string', text: 'Question 2' }] },
      ],
    });

    values.item = [values.item[1], values.item[0]];
    expect(values.item[0].path).toBe('item.1');

    const rebuilt = rebuildFormItems(values);
    expect(rebuilt[0].linkId).toBe('g1');
    expect(rebuilt[0].path).toBe('item.0');
    expect(rebuilt[0].item[0].path).toBe('item.0.item.0');
    expect(rebuilt[0].item[0].parent?.path).toBe('item.0');
    expect(rebuilt[1].linkId).toBe('q1');
    expect(rebuilt[1].path).toBe('item.1');
  });

  test('rebuildFormItems preserves enableWhen conditions', () => {
    const values = toFormValues({
      resourceType: 'Questionnaire',
      status: 'active',
      item: [
        { linkId: 'q1', type: 'string', text: 'Question 1' },
        {
          linkId: 'q2',
          type: 'string',
          text: 'Question 2',
          enableWhen: [{ question: 'q1', operator: '=', answerString: 'yes' }],
        },
      ],
    });

    const rebuilt = rebuildFormItems({ ...values, item: rebuildFormItems(values) });
    const fhirItem = toFhirQuestionnaireItem(rebuilt[1]);
    expect(fhirItem.enableWhen).toStrictEqual([{ question: 'q1', operator: '=', answerString: 'yes' }]);
  });

  test('enableWhen cycles do not recurse forever', () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      item: [
        {
          linkId: 'q1',
          type: 'string',
          enableWhen: [{ question: 'q2', operator: '=', answerString: 'a' }],
        },
        {
          linkId: 'q2',
          type: 'string',
          enableWhen: [{ question: 'q1', operator: '=', answerString: 'b' }],
        },
      ],
    };

    const values = toFormValues(questionnaire);
    expect(values.item[0].enableWhen[0].question.linkId).toBe('q2');
    expect(values.item[1].enableWhen[0].question.linkId).toBe('q1');
  });

  test('enableWhen referencing a missing item is dropped', () => {
    const values = toFormValues({
      resourceType: 'Questionnaire',
      status: 'active',
      item: [
        {
          linkId: 'q1',
          type: 'string',
          enableWhen: [{ question: 'missing', operator: '=', answerString: 'a' }],
        },
      ],
    });

    const fhirItem = toFhirQuestionnaireItem(values.item[0]);
    expect(fhirItem.enableWhen).toBeUndefined();
  });

  test('toFhirQuestionnaireItem does not leak form-only fields', () => {
    const values = toFormValues({
      resourceType: 'Questionnaire',
      status: 'active',
      item: [{ linkId: 'q1', type: 'string', text: 'Question 1' }],
    });

    const fhirItem = toFhirQuestionnaireItem(values.item[0]);
    for (const key of ['index', 'path', 'answerPath', 'parent', 'answer']) {
      expect(fhirItem).not.toHaveProperty(key);
    }
  });

  test('findFormItemByLinkId searches nested items', () => {
    const values = toFormValues({
      resourceType: 'Questionnaire',
      status: 'active',
      item: [{ linkId: 'g1', type: 'group', item: [{ linkId: 'q1', type: 'string' }] }],
    });

    expect(findFormItemByLinkId(values.item, 'q1')?.path).toBe('item.0.item.0');
    expect(findFormItemByLinkId(values.item, 'nope')).toBeUndefined();
    expect(findFormItemByLinkId(values.item, undefined)).toBeUndefined();
  });

  test('group answer paths use dot notation', () => {
    const values = toFormValues({
      resourceType: 'Questionnaire',
      status: 'active',
      item: [{ linkId: 'g1', type: 'group', item: [{ linkId: 'q1', type: 'string' }] }],
    });

    const child = values.item[0].answer[0][0];
    expect(child.answerPath).toBe('item.0.answer.0.0');
    expect(getValueByPath(values, `${child.answerPath}.answer.0.value`)).toBe('');
  });

  describe('rebuildFormItems keeps answers', () => {
    function setup(): Record<string, any> {
      return toFormValues({
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
          { linkId: 'g1', type: 'group', item: [{ linkId: 'inner', type: 'integer' }] },
        ],
      });
    }

    test('answers survive a reorder', () => {
      const values = setup();
      values.item[0].answer = [{ value: 'Alice' }, { value: 'Bob' }];
      values.item[1].answer = [{ value: true }];
      values.item[2].answer = [{ value: { code: 'red' } }, { value: { code: 'blue' } }];
      values.item[3].answer[0][0].answer = [{ value: 7 }];

      values.item = [values.item[3], values.item[2], values.item[1], values.item[0]];
      const rebuilt = rebuildFormItems(values);

      expect(rebuilt[0].linkId).toBe('g1');
      const inner = (rebuilt[0].answer as any)[0][0];
      expect(inner.answerPath).toBe('item.0.answer.0.0');
      expect(inner.answer).toStrictEqual([{ value: 7 }]);
      expect(rebuilt[1].answer).toStrictEqual([{ value: { code: 'red' } }, { value: { code: 'blue' } }]);
      expect(rebuilt[2].answer).toStrictEqual([{ value: true }]);
      expect(rebuilt[3].answer).toStrictEqual([{ value: 'Alice' }, { value: 'Bob' }]);
    });

    test('repeated group answers survive', () => {
      const values = setup();
      const secondRepetition = fromFhirQuestionnaireItem(
        { linkId: 'inner', type: 'integer' },
        null,
        0,
        undefined,
        values.item[3],
        'item.3.item',
        'item.3.answer.1'
      );
      secondRepetition.answer = [{ value: 9 }];
      values.item[3].answer.push([secondRepetition]);
      values.item[3].answer[0][0].answer = [{ value: 3 }];

      const rebuilt = rebuildFormItems(values);
      const groupAnswers = rebuilt[3].answer as any;
      expect(groupAnswers).toHaveLength(2);
      expect(groupAnswers[0][0].answer).toStrictEqual([{ value: 3 }]);
      expect(groupAnswers[1][0].answer).toStrictEqual([{ value: 9 }]);
      expect(groupAnswers[1][0].answerPath).toBe('item.3.answer.1.0');
    });

    test('new items get their initial answers', () => {
      const values = setup();
      values.item.push(
        fromFhirQuestionnaireItem({ linkId: 'new', type: 'string', initial: [{ valueString: 'x' }] }, null, 4)
      );
      delete values.item[4].answer;
      const rebuilt = rebuildFormItems(values);
      expect(rebuilt[4].answer).toStrictEqual([{ value: 'x' }]);
    });
  });

  describe('evaluateEnableWhen', () => {
    function setup(enableWhen: any[], extraItems: QuestionnaireItem[] = []): Record<string, any> {
      return toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'num', type: 'integer' },
          {
            linkId: 'color',
            type: 'choice',
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

    function target(values: Record<string, any>): any {
      return values.item.at(-1);
    }

    test('numeric comparison', () => {
      const values = setup([{ question: 'num', operator: '>', answerInteger: 5 }]);
      expect(evaluateEnableWhen(values, target(values))).toBe(false);
      values.item[0].answer[0].value = '7';
      expect(evaluateEnableWhen(values, target(values))).toBe(true);
    });

    test('choice comparison with single and multiple selections', () => {
      const values = setup([{ question: 'color', operator: '=', answerCoding: { code: 'blue' } }]);
      values.item[1].answer = [{ value: { code: 'red' } }];
      expect(evaluateEnableWhen(values, target(values))).toBe(false);
      values.item[1].answer = [{ value: { code: 'red' } }, { value: { code: 'blue' } }];
      expect(evaluateEnableWhen(values, target(values))).toBe(true);
    });

    test('question inside a group', () => {
      const values = setup([{ question: 'inner', operator: '=', answerString: 'yes' }]);
      expect(evaluateEnableWhen(values, target(values))).toBe(false);
      values.item[2].answer[0][0].answer[0].value = 'yes';
      expect(evaluateEnableWhen(values, target(values))).toBe(true);
    });

    test('exists and empty', () => {
      const exists = setup([{ question: 'num', operator: 'exists', answerBoolean: true }]);
      expect(evaluateEnableWhen(exists, target(exists))).toBe(false);
      exists.item[0].answer[0].value = 3;
      expect(evaluateEnableWhen(exists, target(exists))).toBe(true);

      const empty = setup([{ question: 'num', operator: 'exists', answerBoolean: false }]);
      expect(target(empty).enableWhen[0].operator).toBe('empty');
      expect(evaluateEnableWhen(empty, target(empty))).toBe(true);
    });

    test('incomplete conditions are ignored', () => {
      const values = setup([]);
      target(values).enableWhen = [{ question: null, operator: '', answer: '' }];
      expect(evaluateEnableWhen(values, target(values))).toBe(true);
    });
  });

  test('toFhirQuestionnaire round trip keeps the questionnaire unchanged', () => {
    const itemControl = {
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
      valueCodeableConcept: {
        coding: [{ system: 'http://hl7.org/fhir/questionnaire-item-control', code: 'check-box', display: 'Check-box' }],
        text: 'Check-box',
      },
    };
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      id: 'abc',
      meta: { versionId: '1' },
      status: 'active',
      title: 'Intake',
      item: [
        { linkId: 'name', type: 'string', text: 'Name', required: true, maxLength: 50 },
        {
          linkId: 'intolerances',
          type: 'choice',
          text: 'Intolerances',
          repeats: true,
          answerOption: [
            { valueCoding: { system: 'urn:x', code: 'a', display: 'A' } },
            { valueCoding: { system: 'urn:x', code: 'b', display: 'B' }, initialSelected: true },
          ],
          extension: [itemControl],
        },
        {
          linkId: 'g',
          type: 'group',
          text: 'Group',
          item: [
            { linkId: 'age', type: 'integer', text: 'Age', initial: [{ valueInteger: 30 }] },
            { linkId: 'note', type: 'display', text: 'Note' },
          ],
        },
        {
          linkId: 'follow',
          type: 'boolean',
          text: 'Follow',
          enableWhen: [{ question: 'age', operator: '>', answerInteger: 18 }],
        },
      ],
    };

    const result = toFhirQuestionnaire(toFormValues(questionnaire));

    expect(result).toMatchObject({
      resourceType: 'Questionnaire',
      id: 'abc',
      meta: { versionId: '1' },
      title: 'Intake',
    });
    const [name, intolerances, group, follow] = result.item as QuestionnaireItem[];
    expect(name).toMatchObject({ linkId: 'name', type: 'string', text: 'Name', required: true, maxLength: 50 });
    expect(intolerances.answerOption).toMatchObject(questionnaire.item?.[1].answerOption as object);
    expect(intolerances.extension).toContainEqual(itemControl);
    // No limit on repetitions unless the source had one
    expect(intolerances.extension?.some((e) => e.url.endsWith('questionnaire-maxOccurs'))).toBe(false);
    expect(group.item?.map((i) => i.linkId)).toStrictEqual(['age', 'note']);
    expect(group.item?.[0].initial).toStrictEqual([{ valueInteger: 30 }]);
    expect(follow.enableWhen).toStrictEqual([{ question: 'age', operator: '>', answerInteger: 18 }]);
    // An untouched boolean does not gain an initial answer
    expect(follow.initial).toBeUndefined();
  });

  test('toFhirQuestionnaire writes occurrence limits as integers', () => {
    const values = toFormValues({
      resourceType: 'Questionnaire',
      status: 'active',
      item: [{ linkId: 'q', type: 'string', repeats: true, required: true }],
    });
    values.item[0].minOccurs = '2';
    values.item[0].maxOccurs = '5';

    const extensions = toFhirQuestionnaire(values).item?.[0].extension ?? [];
    expect(extensions.find((e) => e.url.endsWith('questionnaire-minOccurs'))?.valueInteger).toBe(2);
    expect(extensions.find((e) => e.url.endsWith('questionnaire-maxOccurs'))?.valueInteger).toBe(5);
  });

  describe('pages', () => {
    const pageExtension = {
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
      valueCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/questionnaire-item-control', code: 'page' }] },
    };

    test('a questionnaire with pages is paginated by its page groups only', () => {
      const paginated = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'p1', type: 'group', extension: [pageExtension] },
          { linkId: 'p2', type: 'group', extension: [pageExtension] },
        ],
      });
      expect(isPageItem(paginated.item[0])).toBe(true);
      expect(getPageItems(paginated.item)?.map((page) => page.linkId)).toStrictEqual(['p1', 'p2']);

      const mixed = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'q', type: 'string' },
          { linkId: 'g', type: 'group', item: [{ linkId: 'gq', type: 'string' }] },
          { linkId: 'p', type: 'group', extension: [pageExtension] },
        ],
      });
      expect(getPageItems(mixed.item)?.map((page) => page.linkId)).toStrictEqual(['p']);

      const noPages = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [{ linkId: 'q', type: 'string' }],
      });
      expect(getPageItems(noPages.item)).toBeUndefined();
    });

    test('a new page is saved with the page item control', () => {
      const fhirItem = toFhirQuestionnaireItem({
        linkId: 'p',
        type: 'group',
        text: 'New Page',
        itemControl: PAGE_ITEM_CONTROL,
      });
      const itemControl = fhirItem.extension?.find((e) => e.url.endsWith('questionnaire-itemControl'));
      expect(itemControl?.valueCodeableConcept?.coding?.[0]).toMatchObject({
        system: 'http://hl7.org/fhir/questionnaire-item-control',
        code: 'page',
      });
      expect(isPageItem(fromFhirQuestionnaireItem(fhirItem, null, 0))).toBe(true);
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

    function prefill(): Record<string, any> {
      return {
        ...questionnaire,
        item: (questionnaire.item ?? []).map((item, index) =>
          fromFhirQuestionnaireItem(item, questionnaire, index, response.item)
        ),
      };
    }

    test('prefill reads group repetitions as sibling items', () => {
      const values = prefill();
      const address = values.item[3];
      expect(address.answer).toHaveLength(2);
      expect(address.answer[1][0].answerPath).toBe('item.3.answer.1.0');
      expect(address.answer[1][0].answer).toStrictEqual([{ value: 'Vienna' }]);
    });

    test('round trip produces standard FHIR', () => {
      const result = toFhirQuestionnaireResponse(prefill());
      expect(result.questionnaire).toBe('Questionnaire/q-1');
      expect(result.status).toBe('completed');
      // Hidden and disabled (age is not > 60) items are left out; groups repeat as sibling items with nested `item`
      expect(result.item).toStrictEqual(response.item);
    });

    test('top-level items outside pages are left out of a paginated response', () => {
      const values = toFormValues({
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
      const result = toFhirQuestionnaireResponse(values);
      expect(result.item).toStrictEqual([
        { linkId: 'page', item: [{ linkId: 'inside', answer: [{ valueString: 'shown' }] }] },
      ]);
    });

    test('display items are not in the response, and do not make a group present', () => {
      const values = toFormValues({
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
      expect(toFhirQuestionnaireResponse(values).item).toStrictEqual([]);

      values.item[1].answer[0][1].answer[0].value = 'answer';
      expect(toFhirQuestionnaireResponse(values).item).toStrictEqual([
        { linkId: 'group', item: [{ linkId: 'q', answer: [{ valueString: 'answer' }] }] },
      ]);
    });

    test('unanswered questions are left out and numbers are typed', () => {
      const values = prefill();
      values.item[0].answer = [{ value: '  ' }];
      values.item[1].answer = [{ value: '61' }];
      values.item[5].answer = [{ value: 'yes' }];
      const result = toFhirQuestionnaireResponse(values);
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

  test('a bound of 0 is kept on save', () => {
    const minValue = 'http://hl7.org/fhir/StructureDefinition/minValue';
    const maxValue = 'http://hl7.org/fhir/StructureDefinition/maxValue';
    const extension = [
      { url: minValue, valueInteger: 0 },
      { url: maxValue, valueInteger: 0 },
    ];
    const values = toFormValues({
      resourceType: 'Questionnaire',
      status: 'active',
      item: [{ linkId: 'drinks', type: 'integer', extension }],
    });
    expect(toFhirQuestionnaire(values).item?.[0].extension).toEqual(expect.arrayContaining(extension));
  });

  describe('validateFormAnswers', () => {
    function setup(item: QuestionnaireItem): Record<string, any> {
      return toFormValues({ resourceType: 'Questionnaire', status: 'active', item: [item] });
    }

    test('required', () => {
      const values = setup({ linkId: 'q', type: 'string', text: 'Name', required: true });
      expect(validateFormAnswers(values)).toStrictEqual({ 'item.0.answer.0.value': 'This field is required' });
      values.item[0].answer = [{ value: 'Alice' }];
      expect(validateFormAnswers(values)).toStrictEqual({});
    });

    test('regex and length', () => {
      const values = setup({
        linkId: 'q',
        type: 'string',
        text: 'Zip',
        maxLength: 5,
        extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/regex', valueString: '^[0-9]+$' }],
      });
      values.item[0].answer = [{ value: 'abc' }];
      expect(validateFormAnswers(values)).toStrictEqual({ 'item.0.answer.0.value': 'Zip format is invalid' });
      values.item[0].answer = [{ value: '123456' }];
      expect(validateFormAnswers(values)).toStrictEqual({ 'item.0.answer.0.value': 'Zip cannot exceed 5 characters' });
      values.item[0].answer = [{ value: '12345' }];
      expect(validateFormAnswers(values)).toStrictEqual({});
    });

    test('value range', () => {
      const values = setup({
        linkId: 'q',
        type: 'integer',
        text: 'Age',
        extension: [
          { url: 'http://hl7.org/fhir/StructureDefinition/minValue', valueInteger: 18 },
          { url: 'http://hl7.org/fhir/StructureDefinition/maxValue', valueInteger: 99 },
        ],
      });
      values.item[0].answer = [{ value: '17' }];
      expect(validateFormAnswers(values)).toStrictEqual({ 'item.0.answer.0.value': 'Age must be at least 18' });
      values.item[0].answer = [{ value: '100' }];
      expect(validateFormAnswers(values)).toStrictEqual({ 'item.0.answer.0.value': 'Age cannot exceed 99' });
    });

    test('a regex must match the whole value', () => {
      const values = setup({
        linkId: 'q',
        type: 'string',
        text: 'Zip',
        extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/regex', valueString: '[0-9]{5}' }],
      });
      values.item[0].answer = [{ value: 'abc12345xyz' }];
      expect(validateFormAnswers(values)).toStrictEqual({ 'item.0.answer.0.value': 'Zip format is invalid' });
      values.item[0].answer = [{ value: '1234' }];
      expect(validateFormAnswers(values)).toStrictEqual({ 'item.0.answer.0.value': 'Zip format is invalid' });
      values.item[0].answer = [{ value: '12345' }];
      expect(validateFormAnswers(values)).toStrictEqual({});
      // An empty answer is not checked (only required is)
      values.item[0].answer = [{ value: '' }];
      expect(validateFormAnswers(values)).toStrictEqual({});
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
      expect(current.answer[0].value).toBe('2026-09-29T10:00');
      expect(current.minValue).toBe('2026-09-29T09:30');
      expect(current.maxValue).toBe('2026-09-29T18:00');
      // Saved as the UTC instant of that local time
      expect(toFhirQuestionnaireItem(current).initial?.[0].valueDateTime).toBe(
        new Date('2026-09-29T10:00').toISOString()
      );
    });

    test('a URL must be a full link, within its max length', () => {
      const values = setup({ linkId: 'q', type: 'url', text: 'Website', maxLength: 25 });
      for (const valid of [
        'https://example.com',
        'http://localhost:3000/a',
        'ftp://files.example.com',
        'mailto:a@b.co',
      ]) {
        values.item[0].answer = [{ value: valid }];
        expect(validateFormAnswers(values)).toStrictEqual({});
      }
      for (const invalid of ['example.com', 'www.example.com', 'https://', 'hello world', 'javascript:alert(1)']) {
        values.item[0].answer = [{ value: invalid }];
        expect(validateFormAnswers(values)).toStrictEqual({
          'item.0.answer.0.value': 'Website must be a full link, e.g. https://example.com',
        });
      }
      values.item[0].answer = [{ value: 'https://example.com/a-long-path' }];
      expect(validateFormAnswers(values)).toStrictEqual({
        'item.0.answer.0.value': 'Website cannot exceed 25 characters',
      });
      expect(toFhirQuestionnaireItem(values.item[0]).maxLength).toBe(25);
    });

    test('an invalid regex in the definition is ignored', () => {
      const values = setup({
        linkId: 'q',
        type: 'string',
        extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/regex', valueString: '([' }],
      });
      values.item[0].answer = [{ value: 'anything' }];
      expect(validateFormAnswers(values)).toStrictEqual({});
    });

    test('required repeating choice reports on the answer list', () => {
      const values = setup({
        linkId: 'q',
        type: 'choice',
        required: true,
        repeats: true,
        answerOption: [{ valueCoding: { code: 'a' } }],
      });
      values.item[0].answer = [];
      expect(validateFormAnswers(values)).toStrictEqual({ 'item.0.answer': 'This field is required' });
    });
  });

  test('isHorizontalChoiceLayout', () => {
    const choice = (displays: string[], orientation?: string): any =>
      fromFhirQuestionnaireItem(
        {
          linkId: 'q',
          type: 'choice',
          answerOption: displays.map((display, i) => ({ valueCoding: { code: String(i), display } })),
          ...(orientation && {
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-choiceOrientation',
                valueCode: orientation,
              },
            ],
          }),
        },
        null,
        0
      );

    // Vertical unless the orientation says horizontal
    expect(isHorizontalChoiceLayout(choice(['Yes', 'No']))).toBe(false);
    expect(isHorizontalChoiceLayout(choice(['A', 'B', 'C', 'D', 'E'], 'horizontal'))).toBe(true);
    expect(isHorizontalChoiceLayout(choice(['Yes', 'No'], 'vertical'))).toBe(false);
  });

  describe('help items', () => {
    const helpExtension = {
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
      valueCodeableConcept: {
        coding: [{ system: 'http://hl7.org/fhir/questionnaire-item-control', code: 'help', display: 'Help-Button' }],
      },
    };

    test('help is recognised by its item control and keeps its linkId', () => {
      const helpItem: QuestionnaireItem = {
        linkId: 'age-hint',
        type: 'display',
        text: 'In years',
        extension: [helpExtension],
      };
      expect(isHelpItem(helpItem)).toBe(true);
      expect(isHelpItem({ linkId: 'q_help', type: 'display', text: 'Not help' })).toBe(false);

      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [{ linkId: 'age', type: 'integer', item: [helpItem] }],
      });
      expect(values.item[0].help).toBe('In years');
      expect(values.item[0].item).toStrictEqual([]);

      // Kept exactly as loaded
      const exported = toFhirQuestionnaire(values);
      expect(exported.item?.[0].item).toStrictEqual([helpItem]);
    });

    test('new help text gets a _help linkId', () => {
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [{ linkId: 'q', type: 'string' }],
      });
      values.item[0].help = 'Some help';
      expect(toFhirQuestionnaire(values).item?.[0].item?.[0].linkId).toBe('q_help');
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

    function prefill(): Record<string, any> {
      return {
        ...questionnaire,
        item: (questionnaire.item ?? []).map((item, index) =>
          fromFhirQuestionnaireItem(item, questionnaire, index, response.item)
        ),
      };
    }

    test('follow-up items are kept on save', () => {
      const exported = toFhirQuestionnaire(toFormValues(questionnaire));
      expect(exported.item?.[0].item?.[0]).toMatchObject({
        linkId: 'how-many',
        type: 'integer',
        enableWhen: [{ question: 'smoke', operator: '=', answerBoolean: true }],
      });
      expect(hasFollowUpItems(toFormValues(questionnaire).item[0])).toBe(true);
    });

    test('each answer has its own follow-up items, prefilled from answer.item', () => {
      const values = prefill();
      const meds = values.item[1];
      expect(meds.item[0].path).toBe('item.1.item.0');
      expect(meds.answer).toHaveLength(2);
      expect(meds.answer[0].item[0].answerPath).toBe('item.1.answer.0.item.0');
      expect(meds.answer[0].item[0].answer).toStrictEqual([{ value: '100 mg' }]);
      expect(meds.answer[1].item[0].answerPath).toBe('item.1.answer.1.item.0');
    });

    test('a condition on the question is evaluated against the answer the follow-up item belongs to', () => {
      const values = prefill();
      const meds = values.item[1];
      expect(evaluateEnableWhen(values, meds.answer[0].item[0])).toBe(true);
      expect(evaluateEnableWhen(values, meds.answer[1].item[0])).toBe(false);

      values.item[0].answer[0].value = false;
      expect(evaluateEnableWhen(values, values.item[0].answer[0].item[0])).toBe(false);
    });

    test('follow-up answers are written under their answer', () => {
      const result = toFhirQuestionnaireResponse(prefill());
      expect(result.item).toStrictEqual(response.item);
    });

    test('rebuildFormItems keeps follow-up answers', () => {
      const values = prefill();
      const rebuilt = rebuildFormItems(values);
      expect(rebuilt[1].answer[0].item?.[0].answer).toStrictEqual([{ value: '100 mg' }]);
      expect(rebuilt[0].answer[0].item?.[0].answer).toStrictEqual([{ value: 10 }]);
    });

    test('follow-up items are validated when their answer is given', () => {
      const values = prefill();
      values.item[0].item[0].minValue = 20;
      expect(validateFormAnswers(values)).toStrictEqual({
        'item.0.answer.0.item.0.answer.0.value': 'How many per day? must be at least 20',
      });
      values.item[0].answer[0].value = false;
      expect(validateFormAnswers(values)).toStrictEqual({});
    });
  });

  describe('groups', () => {
    const pageExtension = {
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
      valueCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/questionnaire-item-control', code: 'page' }] },
    };

    function createValues(): Record<string, any> {
      return toFormValues({
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

    // The answer copies the renderer shows: page repetition 0 -> contact repetition 0 -> ...
    const contactCopy = (values: Record<string, any>): any => values.item[0].answer[0][0];
    const streetCopy = (values: Record<string, any>): any => contactCopy(values).answer[0][0].answer[0][0];
    const emailCopy = (values: Record<string, any>): any => contactCopy(values).answer[0][1];

    test('conditions are read from the definition, so an edit applies to answer copies right away', () => {
      const values = createValues();
      expect(evaluateEnableWhen(values, emailCopy(values))).toBe(true);
      values.item[0].item[0].item[1].enableWhen = [
        { question: values.item[0].item[0].item[0].item[0], operator: 'exists', answer: true },
      ];
      expect(emailCopy(values).enableWhen).toStrictEqual([]);
      expect(evaluateEnableWhen(values, emailCopy(values))).toBe(false);
      streetCopy(values).answer[0].value = 'Main St';
      expect(evaluateEnableWhen(values, emailCopy(values))).toBe(true);
    });

    test('an item in a read-only group is read only', () => {
      const values = createValues();
      expect(isReadOnlyFormItem(values, streetCopy(values))).toBe(false);
      values.item[0].item[0].readOnly = true;
      expect(isReadOnlyFormItem(values, streetCopy(values))).toBe(true);
      expect(isReadOnlyFormItem(values, contactCopy(values))).toBe(true);
      expect(isReadOnlyFormItem(values, values.item[0])).toBe(false);
    });

    test('a required group needs at least one answered question', () => {
      const values = createValues();
      expect(getRequiredGroupError(values, contactCopy(values))).toBeUndefined();

      values.item[0].item[0].required = true;
      expect(getRequiredGroupError(values, contactCopy(values))).toBe('Answer at least one question in this group');
      expect(validateFormAnswers(values)).toStrictEqual({
        'item.0.answer.0.0.answer': 'Answer at least one question in this group',
      });

      // An answer in a nested group counts
      streetCopy(values).answer[0].value = 'Main St';
      expect(getRequiredGroupError(values, contactCopy(values))).toBeUndefined();
      expect(validateFormAnswers(values)).toStrictEqual({});

      // Unless the question is hidden: it is not in the response
      values.item[0].item[0].item[0].item[0].hidden = true;
      expect(getRequiredGroupError(values, contactCopy(values))).toBeDefined();
    });

    test('a required page needs an answered question; display text does not count', () => {
      const values = createValues();
      values.item[0].required = true;
      expect(getRequiredGroupError(values, values.item[0])).toBe('Answer at least one question on this page');
      emailCopy(values).answer[0].value = 'a@example.com';
      expect(getRequiredGroupError(values, values.item[0])).toBeUndefined();
    });

    test('a required repeating group needs minOccurs answered repetitions', () => {
      const values = toFormValues({
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
      expect(values.item[0].answer).toHaveLength(2);
      values.item[0].answer[0][0].answer[0].value = 'Aspirin';
      expect(getRequiredGroupError(values, values.item[0])).toBe(
        'Answer at least one question in this group in 2 repetitions'
      );
      values.item[0].answer[1][0].answer[0].value = 'Ibuprofen';
      expect(getRequiredGroupError(values, values.item[0])).toBeUndefined();
    });

    test('read-only groups and questions are not required of the respondent', () => {
      const values = createValues();
      values.item[0].item[0].required = true;
      values.item[0].item[0].item[1].required = true;
      values.item[0].item[0].readOnly = true;
      expect(validateFormAnswers(values)).toStrictEqual({});
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

    test('options of every value type, codes without display and value sets are kept on save', () => {
      const exported = toFhirQuestionnaire(
        toFormValues({
          resourceType: 'Questionnaire',
          status: 'active',
          item: [
            colors,
            count,
            time,
            { linkId: 'code', type: 'choice', answerOption: [{ valueCoding: { system: 'x', code: 'a' } }] },
            { linkId: 'vs', type: 'choice', answerValueSet: 'http://hl7.org/fhir/ValueSet/administrative-gender' },
          ],
        })
      );
      expect(exported.item?.[0].answerOption).toStrictEqual([
        { initialSelected: false, valueString: 'Red' },
        { initialSelected: true, valueString: 'Blue' },
      ]);
      expect(exported.item?.[1].answerOption?.map((option) => option.valueInteger)).toStrictEqual([1, 2]);
      expect(exported.item?.[2].answerOption?.map((option) => option.valueTime)).toStrictEqual([
        '09:00:00',
        '17:30:00',
      ]);
      expect(exported.item?.[3].answerOption).toStrictEqual([
        { initialSelected: false, valueCoding: { system: 'x', code: 'a' } },
      ]);
      expect(exported.item?.[4].answerValueSet).toBe('http://hl7.org/fhir/ValueSet/administrative-gender');
      expect(exported.item?.[4].answerOption).toBeUndefined();
    });

    test('answers are written with the value type of their option; typed answers as strings', () => {
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [colors, count, time, { ...colors, linkId: 'open', type: 'open-choice' }],
      });
      // The initially selected plain option is the initial answer
      expect(values.item[0].answer).toStrictEqual([{ value: 'Blue' }]);
      values.item[1].answer = [{ value: 2 }];
      values.item[2].answer = [{ value: '17:30:00' }];
      values.item[3].answer = [{ value: 'Green' }];
      expect(toFhirQuestionnaireResponse(values).item?.map((item) => item.answer)).toStrictEqual([
        [{ valueString: 'Blue' }],
        [{ valueInteger: 2 }],
        [{ valueTime: '17:30:00' }],
        [{ valueString: 'Green' }],
      ]);
    });

    test('prefilled choice answers match their options', () => {
      const questionnaire: Questionnaire = { resourceType: 'Questionnaire', status: 'active', item: [time, count] };
      const item = fromFhirQuestionnaireItem(time, questionnaire, 0, [
        { linkId: 'time', answer: [{ valueTime: '17:30:00' }] },
      ]);
      expect(item.answer).toStrictEqual([{ value: '17:30:00' }]);
      const rebuilt = rebuildFormItems({
        ...questionnaire,
        item: [
          item,
          fromFhirQuestionnaireItem(count, questionnaire, 1, [{ linkId: 'count', answer: [{ valueInteger: 2 }] }]),
        ],
      });
      expect(rebuilt[0].answer).toStrictEqual([{ value: '17:30:00' }]);
      expect(rebuilt[1].answer).toStrictEqual([{ value: 2 }]);
    });

    test('number conditions compare numbers, and ignore unanswered questions', () => {
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'children', type: 'integer' },
          { linkId: 'many', type: 'string', enableWhen: [{ question: 'children', operator: '>', answerInteger: 9 }] },
          { linkId: 'none', type: 'string', enableWhen: [{ question: 'children', operator: '<', answerInteger: 1 }] },
        ],
      });
      // Typed into a text field, answers are strings
      values.item[0].answer = [{ value: '10' }];
      expect(evaluateEnableWhen(values, values.item[1])).toBe(true);
      values.item[0].answer = [{ value: '' }];
      expect(evaluateEnableWhen(values, values.item[1])).toBe(false);
      expect(evaluateEnableWhen(values, values.item[2])).toBe(false);
      values.item[0].answer = [{ value: '0' }];
      expect(evaluateEnableWhen(values, values.item[2])).toBe(true);
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
      const values = toFormValues(questionnaire);
      expect(toFhirQuestionnaire(values).item?.[2].enableWhen).toStrictEqual([
        { question: 'color', operator: '=', answerString: 'Red' },
      ]);
      expect(toFhirQuestionnaire(values).item?.[3].enableWhen).toStrictEqual([
        { question: 'count', operator: '!=', answerInteger: 2 },
      ]);

      expect(evaluateEnableWhen(values, values.item[2])).toBe(false);
      values.item[0].answer = [{ value: 'Red' }];
      expect(evaluateEnableWhen(values, values.item[2])).toBe(true);

      values.item[1].answer = [{ value: 2 }];
      expect(evaluateEnableWhen(values, values.item[3])).toBe(false);
      values.item[1].answer = [{ value: 1 }];
      expect(evaluateEnableWhen(values, values.item[3])).toBe(true);
    });
  });

  describe('quantity answers', () => {
    const kg = { system: 'http://unitsofmeasure.org', code: 'kg', display: 'kilogram' };
    const lb = { system: 'http://unitsofmeasure.org', code: '[lb_av]', display: 'pound' };

    test('answers keep their comparator and unit through prefill, rebuild and the response', () => {
      const weight: QuestionnaireItem = {
        linkId: 'weight',
        type: 'quantity',
        text: 'Weight',
        extension: [
          { url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unitOption', valueCoding: kg },
          { url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unitOption', valueCoding: lb },
        ],
      };
      const questionnaire: Questionnaire = { resourceType: 'Questionnaire', status: 'active', item: [weight] };
      const answer = { comparator: '<' as const, value: 80, unit: 'kilogram', system: kg.system, code: 'kg' };
      const item = fromFhirQuestionnaireItem(weight, questionnaire, 0, [
        { linkId: 'weight', answer: [{ valueQuantity: answer }] },
      ]);
      expect(item.answer).toStrictEqual([{ value: answer }]);
      const rebuilt = rebuildFormItems({ ...questionnaire, item: [item] });
      expect(rebuilt[0].answer).toStrictEqual([{ value: answer }]);
      expect(toFhirQuestionnaireResponse({ ...questionnaire, item: rebuilt }).item?.[0].answer).toStrictEqual([
        { valueQuantity: answer },
      ]);
    });

    test('a typed value is written as a number; without a chosen unit the fixed unit is used', () => {
      const values = toFormValues({
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
      values.item[0].answer = [{ value: { value: '1.5', unit: 'cups' } }];
      values.item[1].answer = [{ value: { value: '72' } }];
      expect(toFhirQuestionnaireResponse(values).item?.map((item) => item.answer)).toStrictEqual([
        [{ valueQuantity: { value: 1.5, unit: 'cups' } }],
        [{ valueQuantity: { value: 72, unit: 'kilogram', system: 'http://unitsofmeasure.org', code: 'kg' } }],
      ]);
    });

    test('a quantity with only a unit is unanswered; ranges and conditions use its value', () => {
      const values = toFormValues({
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
      values.item[0].answer = [{ value: { value: undefined, unit: 'kg' } }];
      expect(isEmptyAnswerValue(values.item[0].answer[0].value)).toBe(true);
      expect(validateFormAnswers(values)).toStrictEqual({ 'item.0.answer.0.value': 'This field is required' });

      values.item[0].answer = [{ value: { value: '120', unit: 'kg' } }];
      expect(validateFormAnswers(values)).toStrictEqual({});
      expect(evaluateEnableWhen(values, values.item[1])).toBe(true);
      values.item[0].answer = [{ value: { value: '1', unit: 'kg' } }];
      expect(validateFormAnswers(values)).toStrictEqual({ 'item.0.answer.0.value': 'Weight must be at least 2' });
      expect(evaluateEnableWhen(values, values.item[1])).toBe(false);
    });

    test('with one allowed unit, that unit is the unit of the answer', () => {
      const values = toFormValues({
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
      values.item[0].answer = [{ value: { value: '70' } }];
      expect(toFhirQuestionnaireResponse(values).item?.[0].answer).toStrictEqual([
        { valueQuantity: { value: 70, unit: 'kilogram', system: 'http://unitsofmeasure.org', code: 'kg' } },
      ]);
    });

    test('units from a value set are saved as questionnaire-unitValueSet', () => {
      const unitValueSet = 'http://hl7.org/fhir/StructureDefinition/questionnaire-unitValueSet';
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'weight',
            type: 'quantity',
            extension: [{ url: unitValueSet, valueCanonical: 'http://hl7.org/fhir/ValueSet/ucum-bodyweight' }],
          },
        ],
      });
      expect(values.item[0].unitValueSet).toBe('http://hl7.org/fhir/ValueSet/ucum-bodyweight');
      expect(values.item[0].preserved).toBeUndefined();
      expect(toFhirQuestionnaire(values).item?.[0].extension).toContainEqual({
        url: unitValueSet,
        valueCanonical: 'http://hl7.org/fhir/ValueSet/ucum-bodyweight',
      });
      values.item[0].unitValueSet = null;
      expect(toFhirQuestionnaire(values).item?.[0].extension?.some((ext) => ext.url === unitValueSet)).toBe(false);
    });

    test('quantity ranges are saved as decimals (R4 minValue/maxValue take no Quantity)', () => {
      const item = fromFhirQuestionnaireItem(
        {
          linkId: 'weight',
          type: 'quantity',
          extension: [
            { url: 'http://hl7.org/fhir/StructureDefinition/minValue', valueQuantity: { value: 2 } },
            { url: 'http://hl7.org/fhir/StructureDefinition/maxValue', valueDecimal: 300 },
          ],
        },
        null,
        0
      );
      expect([item.minValue, item.maxValue]).toStrictEqual([2, 300]);
      expect(toFhirQuestionnaireItem(item).extension).toEqual(
        expect.arrayContaining([
          { url: 'http://hl7.org/fhir/StructureDefinition/minValue', valueDecimal: 2 },
          { url: 'http://hl7.org/fhir/StructureDefinition/maxValue', valueDecimal: 300 },
        ])
      );
    });
  });

  describe('content the builder does not edit', () => {
    const xhtml = (div: string): any => ({
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/rendering-xhtml', valueString: div }],
    });
    // Primitive extensions (`_text`) are valid FHIR JSON, but not in Medplum's FHIR types.
    const item = {
      id: 'item-1',
      linkId: 'weight',
      definition: 'http://example.com/StructureDefinition/weight#Observation.value',
      type: 'choice',
      text: 'Weight',
      _text: xhtml('<div><b>Weight</b></div>'),
      code: [{ system: 'http://loinc.org', version: '2.77', code: '29463-7', display: 'Body weight' }],
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-signatureRequired',
          valueCodeableConcept: { coding: [{ system: 'urn:iso-astm:E1762-95:2013', code: '1.2.840.10065.1.12.1.7' }] },
        },
        {
          url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
          valueExpression: { language: 'text/fhirpath', expression: '1 + 1' },
        },
      ],
      answerOption: [
        {
          valueCoding: { system: 'http://example.com/cs', version: '1', code: 'none', display: 'None of these' },
          extension: [
            {
              url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-optionExclusive',
              valueBoolean: true,
            },
            { url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue', valueDecimal: 0 },
          ],
        },
      ],
      item: [
        {
          linkId: 'weight-help',
          type: 'display',
          text: 'Without shoes',
          _text: xhtml('<div>Without <i>shoes</i></div>'),
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [{ system: 'http://hl7.org/fhir/questionnaire-item-control', code: 'help' }],
              },
            },
          ],
        },
      ],
    } as unknown as QuestionnaireItem & Record<string, any>;

    test('is kept on save', () => {
      let values = toFormValues({ resourceType: 'Questionnaire', status: 'active', item: [item] });
      // Save and load twice
      for (let i = 0; i < 2; i++) {
        values = toFormValues(toFhirQuestionnaire(values));
      }
      values.item[0].help = 'Without shoes or coat';
      const saved = toFhirQuestionnaire(values).item?.[0] as QuestionnaireItem;

      expect(saved.id).toBe('item-1');
      expect(saved.definition).toBe(item.definition);
      expect((saved as Record<string, any>)._text).toStrictEqual(item._text);
      expect(saved.code).toStrictEqual(item.code);
      expect(saved.extension).toEqual(expect.arrayContaining(item.extension ?? []));
      expect(saved.answerOption).toStrictEqual([
        {
          initialSelected: false,
          valueCoding: { system: 'http://example.com/cs', version: '1', code: 'none', display: 'None of these' },
          extension: [
            { url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue', valueDecimal: 0 },
            {
              url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-optionExclusive',
              valueBoolean: true,
            },
          ],
        },
      ]);
      // The help item keeps everything but its text
      expect(saved.item).toStrictEqual([{ ...item.item?.[0], text: 'Without shoes or coat' }]);
    });
  });

  describe('reference questions', () => {
    const referenceResource = 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource';
    const referenceFilter = 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceFilter';

    test('search filter', () => {
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'doctor', type: 'reference', extension: [{ url: referenceFilter, valueString: 'active=true' }] },
        ],
      });
      expect(values.item[0].referenceFilter).toBe('active=true');

      values.item[0].referenceFilter = ' active=true&subject=$subj ';
      const filterOf = (v: Record<string, any>): unknown =>
        toFhirQuestionnaire(v).item?.[0].extension?.filter((ext) => ext.url === referenceFilter);
      expect(filterOf(values)).toStrictEqual([{ url: referenceFilter, valueString: 'active=true&subject=$subj' }]);
      // Without a subject, its parameter is left out of the search.
      expect(getReferenceSearchCriteria(values.item[0])).toStrictEqual({ active: 'true' });
      expect(getReferenceSearchCriteria(values.item[0], { reference: 'Patient/123' })).toStrictEqual({
        active: 'true',
        subject: 'Patient/123',
      });

      values.item[0].referenceFilter = '';
      expect(filterOf(values)).toStrictEqual([]);
      expect(getReferenceSearchCriteria(values.item[0])).toBeUndefined();
    });

    test('search filter format', () => {
      expect(getReferenceFilterError('')).toBeUndefined();
      expect(getReferenceFilterError('active=true&address-state=CA')).toBeUndefined();
      expect(getReferenceFilterError('active')).toBe(
        '"active" is not name=value. Join several with &, e.g. active=true&address-state=CA'
      );
      expect(getReferenceFilterError('active=true&')).toMatch(/^"" is not name=value/);
      expect(getReferenceFilterError('=true')).toMatch(/^"=true" is not name=value/);
    });

    test('resource types are written as Medplum does: one as a code, several as a CodeableConcept', () => {
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'doctor',
            type: 'reference',
            extension: [
              { url: referenceResource, valueCode: 'Practitioner' },
              { url: referenceFilter, valueString: 'active=true' },
            ],
          },
        ],
      });
      expect(values.item[0].referenceResource).toStrictEqual(['Practitioner']);
      expect(toFhirQuestionnaire(values).item?.[0].extension).toEqual(
        expect.arrayContaining([
          { url: referenceResource, valueCode: 'Practitioner' },
          { url: referenceFilter, valueString: 'active=true' },
        ])
      );

      values.item[0].referenceResource = ['Practitioner', '', 'Organization'];
      const saved = toFhirQuestionnaire(values).item?.[0];
      expect(saved?.extension?.filter((ext) => ext.url === referenceResource)).toStrictEqual([
        {
          url: referenceResource,
          valueCodeableConcept: { coding: [{ code: 'Practitioner' }, { code: 'Organization' }] },
        },
      ]);
      expect(
        toFormValues({ resourceType: 'Questionnaire', status: 'active', item: [saved as QuestionnaireItem] }).item[0]
          .referenceResource
      ).toStrictEqual(['Practitioner', 'Organization']);

      values.item[0].referenceResource = [];
      expect(toFhirQuestionnaire(values).item?.[0].extension?.some((ext) => ext.url === referenceResource)).toBe(false);
    });

    test('answers are references', () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [{ linkId: 'doctor', type: 'reference', text: 'Doctor' }],
      };
      const answer = { reference: 'Practitioner/123', display: 'Dr. Alice Smith' };
      const item = fromFhirQuestionnaireItem(questionnaire.item?.[0] as QuestionnaireItem, questionnaire, 0, [
        { linkId: 'doctor', answer: [{ valueReference: answer }] },
      ]);
      expect(item.answer).toStrictEqual([{ value: answer }]);
      const rebuilt = rebuildFormItems({ ...questionnaire, item: [item] });
      expect(toFhirQuestionnaireResponse({ ...questionnaire, item: rebuilt }).item?.[0].answer).toStrictEqual([
        { valueReference: answer },
      ]);
    });
  });

  describe('attachment questions', () => {
    test('allowed file types and maximum size are saved as mimeType and maxSize', () => {
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'photo',
            type: 'attachment',
            extension: [
              { url: 'http://hl7.org/fhir/StructureDefinition/mimeType', valueCode: 'image/png' },
              { url: 'http://hl7.org/fhir/StructureDefinition/maxSize', valueDecimal: 1048576 },
            ],
          },
        ],
      });
      expect(values.item[0].mimeType).toStrictEqual(['image/png']);
      expect(values.item[0].maxSize).toBe(1048576);
      values.item[0].mimeType = ['image/jpeg', 'application/pdf'];
      expect(
        toFhirQuestionnaire(values).item?.[0].extension?.filter((ext) => !ext.url.endsWith('hidden'))
      ).toStrictEqual([
        { url: 'http://hl7.org/fhir/StructureDefinition/maxSize', valueDecimal: 1048576 },
        { url: 'http://hl7.org/fhir/StructureDefinition/mimeType', valueCode: 'image/jpeg' },
        { url: 'http://hl7.org/fhir/StructureDefinition/mimeType', valueCode: 'application/pdf' },
      ]);
    });

    test('answers are attachments, and are required like any answer', () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [{ linkId: 'photo', type: 'attachment', text: 'Photo', required: true }],
      };
      const attachment = { contentType: 'image/png', url: 'Binary/123', title: 'photo.png' };
      const empty = toFormValues(questionnaire);
      expect(validateFormAnswers(empty)).toStrictEqual({ 'item.0.answer.0.value': 'This field is required' });

      const item = fromFhirQuestionnaireItem(questionnaire.item?.[0] as QuestionnaireItem, questionnaire, 0, [
        { linkId: 'photo', answer: [{ valueAttachment: attachment }] },
      ]);
      expect(item.answer).toStrictEqual([{ value: attachment }]);
      const rebuilt = rebuildFormItems({ ...questionnaire, item: [item] });
      expect(validateFormAnswers({ ...questionnaire, item: rebuilt })).toStrictEqual({});
      expect(toFhirQuestionnaireResponse({ ...questionnaire, item: rebuilt }).item?.[0].answer).toStrictEqual([
        { valueAttachment: attachment },
      ]);
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
      const response = toFhirQuestionnaireResponse(
        { resourceType: 'Questionnaire', status: 'active', item: [] },
        signature
      );
      expect(response.extension).toStrictEqual([
        { url: 'http://hl7.org/fhir/StructureDefinition/questionnaireresponse-signature', valueSignature: signature },
      ]);
      expect(getResponseSignature(response)).toStrictEqual(signature);
      expect(
        toFhirQuestionnaireResponse({ resourceType: 'Questionnaire', status: 'active', item: [] }).extension
      ).toBeUndefined();
    });
  });

  describe('design notes', () => {
    const designNote = 'http://hl7.org/fhir/StructureDefinition/designNote';

    test('an item design note is edited and saved as designNote', () => {
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [{ linkId: 'q', type: 'string', extension: [{ url: designNote, valueMarkdown: 'Asked by *legal*' }] }],
      });
      expect(values.item[0].designNote).toBe('Asked by *legal*');
      expect(values.item[0].preserved).toBeUndefined();
      values.item[0].designNote = 'Asked by legal, see ticket 12';
      expect(toFhirQuestionnaire(values).item?.[0].extension).toContainEqual({
        url: designNote,
        valueMarkdown: 'Asked by legal, see ticket 12',
      });
      values.item[0].designNote = '';
      expect(toFhirQuestionnaire(values).item?.[0].extension?.some((ext) => ext.url === designNote)).toBe(false);
    });
  });

  describe('usage mode', () => {
    const usageMode = (code: string): any => ({
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-usageMode',
      valueCode: code,
    });

    function createValues(): Record<string, any> {
      return toFormValues({
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
      const values = createValues();
      const shown = (mode: 'capture' | 'display'): string[] =>
        values.item.filter((item: any) => isShownInMode(values, item, mode)).map((item: any) => item.linkId);

      expect(shown('capture')).toStrictEqual(['both', 'capture', 'capture-display-non-empty']);
      expect(shown('display')).toStrictEqual(['both', 'display']);

      values.item[3].answer = [{ value: 'a' }];
      values.item[4].answer = [{ value: 'b' }];
      expect(shown('display')).toStrictEqual(['both', 'display', 'display-non-empty', 'capture-display-non-empty']);
      expect(isUsedInMode(undefined, 'display')).toBe(true);
    });

    test('items not filled in are not validated and not in the response', () => {
      const values = createValues();
      expect(validateFormAnswers(values)).toStrictEqual({ 'item.1.answer.0.value': 'This field is required' });
      values.item[1].answer = [{ value: 'captured' }];
      expect(toFhirQuestionnaireResponse(values).item?.map((item) => item.linkId)).toStrictEqual(['capture']);
    });
  });

  describe('display category', () => {
    const displayCategory = 'http://hl7.org/fhir/StructureDefinition/questionnaire-displayCategory';
    const itemControl = 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl';
    const security = {
      system: 'http://hl7.org/fhir/questionnaire-display-category',
      code: 'security',
      display: 'Security',
    };

    test('is read, edited and saved', () => {
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'notice',
            type: 'display',
            text: 'Your answers are confidential',
            extension: [{ url: displayCategory, valueCodeableConcept: { coding: [security] } }],
          },
        ],
      });
      expect(values.item[0].displayCategory).toStrictEqual(security);
      expect(toFhirQuestionnaire(values).item?.[0].extension).toContainEqual({
        url: displayCategory,
        valueCodeableConcept: { coding: [security], text: 'Security' },
      });
      values.item[0].displayCategory = {};
      expect(toFhirQuestionnaire(values).item?.[0].extension?.some((ext) => ext.url === displayCategory)).toBe(false);
    });

    test('an item control on display text is kept (the builder only edits it on questions and groups)', () => {
      const flyover = { url: itemControl, valueCodeableConcept: { coding: [{ code: 'flyover' }] } };
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [{ linkId: 'tip', type: 'display', text: 'Tip', extension: [flyover] }],
      });
      expect(toFhirQuestionnaire(values).item?.[0].extension).toContainEqual(flyover);
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
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'buttons', type: 'boolean', extension: [control('radio-button')] },
          { linkId: 'switch', type: 'boolean' },
        ],
      });
      expect(values.item[0].answer).toStrictEqual([{ value: null }]);
      expect(values.item[1].answer).toStrictEqual([{ value: false }]);
    });

    test('help is shown behind a button, on hover or below; loaded help keeps its item', () => {
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'q',
            type: 'string',
            item: [
              { linkId: 'hover', type: 'display', text: 'Hover text', extension: [control('flyover')] },
              { linkId: 'note', type: 'display', text: 'A follow-up note' },
            ],
          },
        ],
      });
      expect(values.item[0].help).toBe('Hover text');
      expect(values.item[0].helpDisplay).toBe('flyover');
      expect(values.item[0].item.map((item: any) => item.linkId)).toStrictEqual(['note']);
      // Unchanged, it is saved exactly as loaded
      expect(toFhirQuestionnaire(values).item?.[0].item?.[0]).toStrictEqual({
        linkId: 'hover',
        type: 'display',
        text: 'Hover text',
        extension: [control('flyover')],
      });

      values.item[0].helpDisplay = 'inline';
      expect(toFhirQuestionnaire(values).item?.[0].item?.[0]).toMatchObject({
        linkId: 'hover',
        extension: [{ valueCodeableConcept: { coding: [{ code: 'inline' }] } }],
      });
    });

    test('prompt, unit, lower and upper are question texts, saved as display items with those controls', () => {
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'pain',
            type: 'integer',
            item: [{ linkId: 'pain-low', type: 'display', text: 'No pain', extension: [control('lower')] }],
          },
        ],
      });
      expect(values.item[0].displayTexts).toStrictEqual({ lower: 'No pain' });
      expect(values.item[0].item).toStrictEqual([]);

      values.item[0].displayTexts = { lower: 'No pain', upper: 'Worst pain', unit: 'points' };
      values.item[0].help = 'Think of today';
      const saved = toFhirQuestionnaire(values).item?.[0].item ?? [];
      expect(
        saved.map((item) => [item.linkId, item.text, item.extension?.[0]?.valueCodeableConcept?.coding?.[0]?.code])
      ).toStrictEqual([
        ['pain_help', 'Think of today', 'help'],
        ['pain_unit', 'points', 'unit'],
        ['pain-low', 'No pain', 'lower'],
        ['pain_upper', 'Worst pain', 'upper'],
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

      const [fever, cough, none] = options.map((option: any) => option.value);
      expect(applyExclusiveOptions(options, [fever, cough], [fever, cough, none])).toStrictEqual([none]);
      expect(applyExclusiveOptions(options, [none], [none, fever])).toStrictEqual([fever]);
      expect(applyExclusiveOptions(options, [fever, cough], [fever])).toStrictEqual([fever]);
      expect(applyExclusiveOptions([], [none], [none, fever])).toStrictEqual([none, fever]);
    });

    test('reference profiles are saved as questionnaire-referenceProfile on reference questions', () => {
      const referenceProfile = 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceProfile';
      const profile = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-practitioner';
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'doctor', type: 'reference', extension: [{ url: referenceProfile, valueCanonical: profile }] },
        ],
      });
      expect(values.item[0].referenceProfile).toStrictEqual([profile]);
      expect(values.item[0].preserved).toBeUndefined();
      values.item[0].referenceProfile = [profile, 'http://example.com/StructureDefinition/other'];
      expect(
        toFhirQuestionnaire(values).item?.[0].extension?.filter((ext) => ext.url === referenceProfile)
      ).toStrictEqual([
        { url: referenceProfile, valueCanonical: profile },
        { url: referenceProfile, valueCanonical: 'http://example.com/StructureDefinition/other' },
      ]);
    });
  });

  describe('option prefix and decimal places', () => {
    test('an option prefix is read, listed before the option, and saved', () => {
      const optionPrefix = 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix';
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'q',
            type: 'choice',
            answerOption: [
              { valueCoding: { code: 'a', display: 'Apple' }, extension: [{ url: optionPrefix, valueString: 'a)' }] },
              { valueString: 'Banana' },
            ],
          },
        ],
      });
      const [apple, banana] = values.item[0].answerOption;
      expect(getAnswerOptionDisplay(apple)).toBe('a) Apple');
      expect(getAnswerOptionDisplay(banana)).toBe('Banana');
      banana.prefix = 'b)';
      expect(toFhirQuestionnaire(values).item?.[0].answerOption?.map((option) => option.extension)).toStrictEqual([
        [{ url: optionPrefix, valueString: 'a)' }],
        [{ url: optionPrefix, valueString: 'b)' }],
      ]);
    });

    test('decimal places are saved as maxDecimalPlaces and checked', () => {
      const values = toFormValues({
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
      expect(values.item[0].maxDecimalPlaces).toBe(1);
      values.item[0].answer = [{ value: '36.6' }];
      expect(validateFormAnswers(values)).toStrictEqual({});
      values.item[0].answer = [{ value: '36.65' }];
      expect(validateFormAnswers(values)).toStrictEqual({
        'item.0.answer.0.value': 'Temperature can have at most 1 decimal place',
      });

      values.item[0].answer = [{ value: '36.6' }];
      values.item[1].maxDecimalPlaces = '0';
      values.item[1].answer = [{ value: { value: '72.5', unit: 'kg' } }];
      expect(validateFormAnswers(values)).toStrictEqual({ 'item.1.answer.0.value': 'Weight must be a whole number' });
      expect(toFhirQuestionnaire(values).item?.[1].extension).toContainEqual({
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

    function setup(items: QuestionnaireItem[]): Record<string, any> {
      return toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [{ linkId: 'height', type: 'decimal' }, { linkId: 'weight', type: 'decimal' }, ...items],
      });
    }

    // Form values change by replacing them, so answers are set on a copy.
    function answer(values: Record<string, any>, answers: Record<string, any>): Record<string, any> {
      return {
        ...values,
        item: values.item.map((item: any) =>
          item.linkId in answers ? { ...item, answer: [{ value: answers[item.linkId] }] } : item
        ),
      };
    }

    test('enableWhenExpression takes the place of enableWhen', () => {
      const values = setup([
        {
          linkId: 'target',
          type: 'string',
          enableWhen: [{ question: 'height', operator: 'exists', answerBoolean: true }],
          extension: expression(ENABLE_WHEN_EXPRESSION_URL, `${answerOf('weight')} > 100`),
        },
      ]);
      const target = (v: Record<string, any>): any => v.item[2];
      expect(evaluateEnableWhen(values, target(values))).toBe(false);
      const heightOnly = answer(values, { height: 180 });
      expect(evaluateEnableWhen(heightOnly, target(heightOnly))).toBe(false);
      const heavy = answer(values, { weight: 120 });
      expect(evaluateEnableWhen(heavy, target(heavy))).toBe(true);
    });

    test('an enableWhenExpression that fails falls back to enableWhen', () => {
      const values = answer(
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
      expect(evaluateEnableWhen(values, values.item[2])).toBe(true);
    });

    test('calculatedExpression calculates answers', () => {
      const bmi = `(${answerOf('weight')} / (${answerOf('height')} / 100).power(2)).round(1)`;
      const values = setup([{ linkId: 'bmi', type: 'decimal', extension: expression(CALCULATED_EXPRESSION_URL, bmi) }]);
      expect(getCalculatedAnswers(answer(values, { height: 180, weight: 72.5 }))).toEqual([
        { fieldPath: 'item.2.answer.0.value', value: 22.4 },
      ]);
      // Without a result, the answer is cleared.
      expect(getCalculatedAnswers(answer(values, { height: 180 }))).toEqual([
        { fieldPath: 'item.2.answer.0.value', value: null },
      ]);
    });

    test('calculatedExpression errors', () => {
      const values = answer(
        setup([
          { linkId: 'broken', type: 'decimal', extension: expression(CALCULATED_EXPRESSION_URL, 'item.where(linkId=') },
          { linkId: 'text', type: 'decimal', extension: expression(CALCULATED_EXPRESSION_URL, "'heavy'") },
        ]),
        { weight: 72.5 }
      );
      const [broken, text] = getCalculatedAnswers(values);
      expect(broken.fieldPath).toBe('item.2.answer.0.value');
      expect(broken.error).toMatch(/^Expression evaluation failed: /);
      expect(text).toEqual({
        fieldPath: 'item.3.answer.0.value',
        error: "The expression's result is a string, not a decimal",
      });
    });

    test('calculatedExpression in each group repetition', () => {
      const values = setup([
        {
          linkId: 'visits',
          type: 'group',
          repeats: true,
          extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-minOccurs', valueInteger: 2 }],
          item: [{ linkId: 'total', type: 'integer', extension: expression(CALCULATED_EXPRESSION_URL, '1 + 1') }],
        },
      ]);
      expect(getCalculatedAnswers(values)).toEqual([
        { fieldPath: 'item.2.answer.0.0.answer.0.value', value: 2 },
        { fieldPath: 'item.2.answer.1.0.answer.0.value', value: 2 },
      ]);
    });

    test('expressions are kept on save', () => {
      const extension = expression(CALCULATED_EXPRESSION_URL, '1 + 1');
      const exported = toFhirQuestionnaire(setup([{ linkId: 'total', type: 'integer', extension }]));
      expect(exported.item?.[2].extension).toEqual(expect.arrayContaining(extension ?? []));
    });
  });
});
