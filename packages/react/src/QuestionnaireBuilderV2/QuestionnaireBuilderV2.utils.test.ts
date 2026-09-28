// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Questionnaire, QuestionnaireItem, QuestionnaireResponse } from '@medplum/fhirtypes';
import {
  createFollowUpEnableWhen,
  createManualAnswerOption,
  evaluateEnableWhen,
  findFormItemByLinkId,
  flattenFormItems,
  fromFhirQuestionnaireItem,
  getAnswerOptionProblems,
  getFormItemDropTarget,
  getLocalAnswerOptionSystem,
  getPageItems,
  getRequiredGroupError,
  getValueByPath,
  hasFollowUpItems,
  isHelpItem,
  isHorizontalChoiceLayout,
  isManualAnswerOption,
  isPageItem,
  isReadOnlyFormItem,
  moveFormItem,
  PAGE_ITEM_CONTROL,
  rebuildFormItems,
  toFhirAnswerOptionsFromValueSet,
  toFhirQuestionnaire,
  toFhirQuestionnaireItem,
  toFhirQuestionnaireResponse,
  validateFormAnswers,
} from './QuestionnaireBuilderV2.utils';

function toFormValues(questionnaire: Questionnaire): Record<string, any> {
  return {
    ...questionnaire,
    item: (questionnaire.item ?? []).map((item: QuestionnaireItem, index: number) =>
      fromFhirQuestionnaireItem(item, questionnaire, index)
    ),
  };
}

describe('QuestionnaireBuilderV2.utils', () => {
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

  describe('rebuildFormItems keeps preview answers', () => {
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

    expect(isHorizontalChoiceLayout(choice(['Yes', 'No', 'Refused', 'Not asked']))).toBe(true);
    expect(
      isHorizontalChoiceLayout(choice(['Not at all', 'Several days', 'More than half the days', 'Nearly every day']))
    ).toBe(false);
    expect(isHorizontalChoiceLayout(choice(['I have not had a change in my weight', 'I have lost weight']))).toBe(
      false
    );
    expect(isHorizontalChoiceLayout(choice(['A', 'B', 'C', 'D', 'E']))).toBe(false);
    expect(isHorizontalChoiceLayout(choice(['A', 'B', 'C', 'D', 'E'], 'horizontal'))).toBe(true);
    expect(isHorizontalChoiceLayout(choice(['Yes', 'No'], 'vertical'))).toBe(false);
  });

  describe('manual answer options', () => {
    const system = getLocalAnswerOptionSystem('https://example.com/Questionnaire/q-1');

    test('are coded in a questionnaire-local system with the next free number', () => {
      expect(system).toBe('https://example.com/Questionnaire/q-1/answer-options');
      expect(getLocalAnswerOptionSystem(undefined)).toBeUndefined();

      const first = createManualAnswerOption([], system);
      expect(first).toMatchObject({ initialSelected: false, value: { code: '1', display: 'Option 1', system } });

      const loincAndManual = [
        { value: { code: 'LA33-6', display: 'Yes', system: 'http://loinc.org' } },
        { value: { code: '4', display: 'Four', system } },
      ] as any[];
      expect(createManualAnswerOption(loincAndManual, system).value.code).toBe('5');
    });

    test('are saved with their code, system and score', () => {
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [{ linkId: 'q', type: 'choice' }],
      });
      const option = createManualAnswerOption([], system);
      option.value.display = 'Sometimes';
      option.value.score = '2';
      values.item[0].answerOption = [option];

      expect(toFhirQuestionnaire(values).item?.[0].answerOption).toStrictEqual([
        {
          initialSelected: false,
          valueCoding: { code: '1', display: 'Sometimes', system },
          extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue', valueDecimal: 2 }],
        },
      ]);
    });

    test('problems that would lose data are reported', () => {
      expect(
        getAnswerOptionProblems([
          { value: { code: '1', display: 'A' } },
          { value: { code: '2', display: 'B' } },
        ] as any[])
      ).toStrictEqual([]);
      expect(getAnswerOptionProblems([{ value: { code: '', display: 'A' } }] as any[])).toHaveLength(1);
      expect(
        getAnswerOptionProblems([
          { value: { code: '1', display: 'A' } },
          { value: { code: '1', display: 'B' } },
        ] as any[])
      ).toStrictEqual(['Answer option codes must be unique: 1']);
    });
  });

  describe('answers from a value set', () => {
    test('expanded codes become answer options; abstract groupings are left out', () => {
      const options = toFhirAnswerOptionsFromValueSet({
        resourceType: 'ValueSet',
        status: 'active',
        expansion: {
          timestamp: '2026-01-01T00:00:00Z',
          contains: [
            { system: 'https://example.com/cs', code: 'good', display: 'Good' },
            {
              system: 'https://example.com/cs',
              code: 'bad-group',
              abstract: true,
              contains: [{ system: 'https://example.com/cs', code: 'poor' }],
            },
          ],
        },
      });
      expect(options).toStrictEqual([
        { valueCoding: { system: 'https://example.com/cs', code: 'good', display: 'Good' } },
        { valueCoding: { system: 'https://example.com/cs', code: 'poor', display: 'poor' } },
      ]);
    });

    test('only options in the questionnaire-local system are editable', () => {
      const local = 'https://example.com/Questionnaire/q-1/answer-options';
      expect(isManualAnswerOption({ value: { code: '1', system: local } } as any, local)).toBe(true);
      expect(isManualAnswerOption({ value: { code: '1' } } as any, local)).toBe(true);
      expect(isManualAnswerOption({ value: { code: 'good', system: 'https://example.com/cs' } } as any, local)).toBe(
        false
      );
      expect(isManualAnswerOption({ value: { code: 'LA33-6', system: 'http://loinc.org' } } as any, local)).toBe(false);
    });
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

      const exported = toFhirQuestionnaire(values);
      expect(exported.item?.[0].item).toStrictEqual([
        {
          ...helpItem,
          extension: [
            { ...helpExtension, valueCodeableConcept: { ...helpExtension.valueCodeableConcept, text: 'Help-Button' } },
          ],
        },
      ]);
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

    test('a new follow-up item is shown for "yes" to a boolean question, and for any answer otherwise', () => {
      const values = toFormValues(questionnaire);
      expect(createFollowUpEnableWhen(values.item[0])).toMatchObject({ operator: '=', answer: true });
      expect(createFollowUpEnableWhen(values.item[1])).toMatchObject({ operator: 'exists', answer: true });

      values.item[1].item[0].enableWhen = [createFollowUpEnableWhen(values.item[1])];
      expect(toFhirQuestionnaire(values).item?.[1].item?.[0].enableWhen).toStrictEqual([
        { question: 'meds', operator: 'exists', answerBoolean: true },
      ]);
    });

    test('items can be dropped into questions with follow-up items only', () => {
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'smoke', type: 'boolean', item: [{ linkId: 'how-many', type: 'integer' }] },
          { linkId: 'plain', type: 'string' },
          { linkId: 'other', type: 'string' },
        ],
      });
      const rows = flattenFormItems(values.item, { smoke: true });
      expect(rows.map((row) => `${row.item.linkId}@${row.depth}`)).toStrictEqual([
        'smoke@0',
        'how-many@1',
        'plain@0',
        'other@0',
      ]);
      // Dragged up above plain, below how-many (the last follow-up item of smoke): out of smoke, or into it.
      expect(getFormItemDropTarget(rows, 'other', 'plain', 0, 24)).toStrictEqual({
        depth: 0,
        parentLinkId: undefined,
        index: 1,
      });
      expect(getFormItemDropTarget(rows, 'other', 'plain', 24, 24)).toStrictEqual({
        depth: 1,
        parentLinkId: 'smoke',
        index: 1,
      });
      // plain has no follow-up items, so nothing can be dropped into it.
      const collapsedRows = flattenFormItems(values.item, {});
      expect(getFormItemDropTarget(collapsedRows, 'other', 'other', 24, 24)?.depth).toBe(0);

      const moved = moveFormItem(values, 'other', { parentLinkId: 'smoke', index: 1 });
      expect(moved[0].item.map((item: any) => item.linkId)).toStrictEqual(['how-many', 'other']);
      expect(moved[0].item[1].path).toBe('item.0.item.1');
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

    // The answer copies the preview renders: page repetition 0 -> contact repetition 0 -> ...
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

  describe('drag and drop', () => {
    const pageExtension = {
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
      valueCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/questionnaire-item-control', code: 'page' }] },
    };
    const INDENT = 24;

    function createValues(): Record<string, any> {
      return toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'orphan', type: 'string', text: 'Orphan' },
          {
            linkId: 'p1',
            type: 'group',
            extension: [pageExtension],
            item: [
              { linkId: 'q1', type: 'string' },
              { linkId: 'g1', type: 'group', item: [{ linkId: 'q2', type: 'string' }] },
            ],
          },
          { linkId: 'p2', type: 'group', extension: [pageExtension], item: [{ linkId: 'q3', type: 'string' }] },
        ],
      });
    }

    const allExpanded = { p1: true, g1: true, p2: true };
    const toLinkIds = (items: any[]): any[] =>
      items.map((item) => (item.item?.length ? [item.linkId, toLinkIds(item.item)] : item.linkId));

    test('flattenFormItems lists expanded groups only, without the collapsed item', () => {
      const values = createValues();
      const rows = flattenFormItems(values.item, allExpanded);
      expect(rows.map((row) => `${row.item.linkId}@${row.depth}:${row.parentLinkId ?? ''}`)).toStrictEqual([
        'orphan@0:',
        'p1@0:',
        'q1@1:p1',
        'g1@1:p1',
        'q2@2:g1',
        'p2@0:',
        'q3@1:p2',
      ]);
      expect(flattenFormItems(values.item, { p1: true }, 'p1').map((row) => row.item.linkId)).toStrictEqual([
        'orphan',
        'p1',
        'p2',
      ]);
    });

    test('getFormItemDropTarget moves a top-level question into a page', () => {
      const rows = flattenFormItems(createValues().item, allExpanded);
      // Dragged down, a row lands below the row it is over: right under the page header, or after q1.
      expect(getFormItemDropTarget(rows, 'orphan', 'p1', 0, INDENT)).toStrictEqual({
        depth: 1,
        parentLinkId: 'p1',
        index: 0,
      });
      expect(getFormItemDropTarget(rows, 'orphan', 'q1', 0, INDENT)).toStrictEqual({
        depth: 1,
        parentLinkId: 'p1',
        index: 1,
      });
    });

    test('getFormItemDropTarget uses the horizontal offset for the depth', () => {
      const rows = flattenFormItems(createValues().item, allExpanded);
      // Below q2, the last item of g1 and of p1: into g1, p1 or the top level.
      expect(getFormItemDropTarget(rows, 'q1', 'q2', 0, INDENT)).toStrictEqual({
        depth: 1,
        parentLinkId: 'p1',
        index: 1,
      });
      expect(getFormItemDropTarget(rows, 'q1', 'q2', INDENT, INDENT)).toStrictEqual({
        depth: 2,
        parentLinkId: 'g1',
        index: 1,
      });
      expect(getFormItemDropTarget(rows, 'q1', 'q2', -INDENT, INDENT)).toStrictEqual({
        depth: 0,
        parentLinkId: undefined,
        index: 2,
      });
      // Only groups take children.
      expect(getFormItemDropTarget(rows, 'q1', 'q2', INDENT * 5, INDENT)?.depth).toBe(2);
      // Dragged up above q2, the first item of g1, it can only go into g1.
      expect(getFormItemDropTarget(rows, 'q3', 'q2', -INDENT * 5, INDENT)).toStrictEqual({
        depth: 2,
        parentLinkId: 'g1',
        index: 0,
      });
    });

    test('getFormItemDropTarget keeps pages top level', () => {
      const rows = flattenFormItems(createValues().item, allExpanded, 'p2');
      expect(getFormItemDropTarget(rows, 'p2', 'q1', INDENT * 3, INDENT)).toStrictEqual({
        depth: 0,
        parentLinkId: undefined,
        index: 2,
      });
      expect(getFormItemDropTarget(rows, 'p2', 'orphan', INDENT * 3, INDENT)).toStrictEqual({
        depth: 0,
        parentLinkId: undefined,
        index: 0,
      });
    });

    test('moveFormItem moves an item across groups and rebuilds paths', () => {
      const values = createValues();
      const moved = moveFormItem(values, 'orphan', { parentLinkId: 'g1', index: 1 });
      expect(toLinkIds(moved)).toStrictEqual([
        ['p1', ['q1', ['g1', ['q2', 'orphan']]]],
        ['p2', ['q3']],
      ]);
      const orphan = findFormItemByLinkId(moved, 'orphan');
      expect(orphan?.path).toBe('item.0.item.1.item.1');
      expect(orphan?.parent?.linkId).toBe('g1');
    });

    test('moveFormItem reorders within the same group', () => {
      const moved = moveFormItem(createValues(), 'g1', { parentLinkId: 'p1', index: 0 });
      expect(toLinkIds(moved)).toStrictEqual(['orphan', ['p1', [['g1', ['q2']], 'q1']], ['p2', ['q3']]]);
    });

    test('moveFormItem does not move a group into itself', () => {
      const values = createValues();
      expect(moveFormItem(values, 'p1', { parentLinkId: 'g1', index: 0 })).toBe(values.item);
    });
  });
});
