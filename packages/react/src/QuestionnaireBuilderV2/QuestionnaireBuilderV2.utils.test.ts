// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Questionnaire, QuestionnaireItem, QuestionnaireResponseItem } from '@medplum/fhirtypes';
import {
  findFormItemByLinkId,
  fromFhirQuestionnaireItem,
  getRequiredSignatureType,
  getRespondedItems,
  toFhirQuestionnaire,
} from '../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { toDraftResponse, toFhirQuestionnaireResponse } from '../QuestionnaireFormV2/QuestionnaireResponse.utils';
import {
  createFollowUpEnableWhen,
  createManualAnswerOption,
  DEFAULT_SIGNATURE_TYPE,
  flattenFormItems,
  getAnswerOptionProblems,
  getExpandableLinkIds,
  getFormItemDropTarget,
  getItemControlOptions,
  getLocalAnswerOptionSystem,
  getQuestionnaireDesignNote,
  hasFixedItemControl,
  isManualAnswerOption,
  moveFormItem,
  setQuestionnaireDesignNote,
  setRequiredSignatureType,
  toFhirAnswerOptionsFromValueSet,
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
      ).toStrictEqual(['Answer options must be unique: 1']);
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

  describe('signature', () => {
    const signatureRequired = 'http://hl7.org/fhir/StructureDefinition/questionnaire-signatureRequired';

    test('the required signature is set on the questionnaire, as Medplum reads it', () => {
      const values: Record<string, any> = {
        resourceType: 'Questionnaire',
        status: 'active',
        extension: [{ url: 'http://example.com/other', valueString: 'kept' }],
        item: [],
      };
      const form = {
        getValues: () => values,
        setFieldValue: (path: string, value: any) => (values[path] = value),
      } as any;
      expect(getRequiredSignatureType(values)).toBeUndefined();

      setRequiredSignatureType(form, DEFAULT_SIGNATURE_TYPE);
      expect(values.extension).toStrictEqual([
        { url: 'http://example.com/other', valueString: 'kept' },
        { url: signatureRequired, valueCodeableConcept: { coding: [DEFAULT_SIGNATURE_TYPE] } },
      ]);
      expect(getRequiredSignatureType(values)).toStrictEqual(DEFAULT_SIGNATURE_TYPE);
      expect(toFhirQuestionnaire(values).extension).toHaveLength(2);

      setRequiredSignatureType(form, undefined);
      expect(values.extension).toStrictEqual([{ url: 'http://example.com/other', valueString: 'kept' }]);
    });
  });

  describe('design notes', () => {
    const designNote = 'http://hl7.org/fhir/StructureDefinition/designNote';

    test('the questionnaire design note is set on the questionnaire', () => {
      const values: Record<string, any> = { resourceType: 'Questionnaire', status: 'active', item: [] };
      const form = {
        getValues: () => values,
        setFieldValue: (path: string, value: any) => (values[path] = value),
      } as any;
      setQuestionnaireDesignNote(form, 'Draft for the intake team');
      expect(getQuestionnaireDesignNote(values)).toBe('Draft for the intake team');
      expect(toFhirQuestionnaire(values).extension).toStrictEqual([
        { url: designNote, valueMarkdown: 'Draft for the intake team' },
      ]);
      setQuestionnaireDesignNote(form, '  ');
      expect(values.extension).toBeUndefined();
    });
  });

  describe('item controls', () => {
    const coding = (code: string): { system: string; code: string } => ({
      system: 'http://hl7.org/fhir/questionnaire-item-control',
      code,
    });

    const codes = {
      group: ['list', 'table', 'htable', 'gtable', 'atable', 'header', 'footer'].map(coding),
      text: ['inline', 'prompt', 'unit', 'lower', 'upper', 'flyover', 'help'].map(coding),
      question: [
        'autocomplete',
        'drop-down',
        'multi-select',
        'check-box',
        'lookup',
        'radio-button',
        'slider',
        'spinner',
        'text-box',
      ].map(coding),
    };

    const control = (code: string): any => ({
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
      valueCodeableConcept: { coding: [coding(code)] },
    });

    test('options come from the code system, by item kind and question type', () => {
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'group', type: 'group', item: [{ linkId: 'intro', type: 'display', text: 'Hi' }] },
          { linkId: 'count', type: 'integer', item: [{ linkId: 'count-unit', type: 'display', text: 'per day' }] },
          { linkId: 'smoker', type: 'boolean' },
          { linkId: 'color', type: 'choice' },
          { linkId: 'colors', type: 'choice', repeats: true },
          { linkId: 'name', type: 'string' },
        ],
      });
      const options = (item: any): string[] =>
        getItemControlOptions(codes, item).map((option) => option.code as string);
      expect(options(values.item[0])).toStrictEqual(['list', 'table', 'htable', 'gtable', 'atable']);
      // Display text directly in a group has no controls; after a question it can attach to it
      expect(options(values.item[0].item[0])).toStrictEqual([]);
      // Nor after a question: its help and display texts are edited as such
      expect(options(values.item[1].item[0])).toStrictEqual([]);
      expect(options(values.item[1])).toStrictEqual(['slider', 'spinner', 'text-box']);
      expect(options(values.item[2])).toStrictEqual(['check-box', 'radio-button']);
      expect(options(values.item[3])).toStrictEqual(['autocomplete', 'drop-down', 'radio-button']);
      expect(options(values.item[4])).toStrictEqual(['autocomplete', 'drop-down', 'multi-select', 'check-box']);
      expect(options(values.item[5])).toStrictEqual([]);
    });

    test('headers and footers are answered with pages, and stay top level', () => {
      const pageExtension = control('page');
      const values = toFormValues({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'header', type: 'group', extension: [control('header')], item: [{ linkId: 'id', type: 'string' }] },
          { linkId: 'page', type: 'group', extension: [pageExtension], item: [{ linkId: 'q', type: 'string' }] },
          { linkId: 'orphan', type: 'string' },
          {
            linkId: 'footer',
            type: 'group',
            extension: [control('footer')],
            item: [{ linkId: 'sig', type: 'string' }],
          },
        ],
      });
      expect(values.item.map((item: any) => hasFixedItemControl(item))).toStrictEqual([true, true, false, true]);
      expect(getRespondedItems(values.item).map((item) => item.linkId)).toStrictEqual(['header', 'page', 'footer']);

      const response = toDraftResponse(values.item);
      (response.item?.[0].item?.[0] as QuestionnaireResponseItem).answer = [{ valueString: 'A-1' }];
      expect(toFhirQuestionnaireResponse(values, response).item?.map((item) => item.linkId)).toStrictEqual(['header']);

      const rows = flattenFormItems(values.item, { page: true });
      expect(getFormItemDropTarget(rows, 'footer', 'q', 24 * 3, 24)?.depth).toBe(0);
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

    test('getExpandableLinkIds lists the items with items of their own, at any depth', () => {
      const values = createValues();
      expect(getExpandableLinkIds(values.item)).toStrictEqual(Object.keys(allExpanded));
      // A question with follow-up items expands too; an empty group does not.
      values.item[0].item = [{ ...values.item[0], linkId: 'follow-up', item: [] }];
      values.item.push({ ...values.item[2], linkId: 'empty', item: [] });
      expect(getExpandableLinkIds(values.item)).toStrictEqual(['orphan', ...Object.keys(allExpanded)]);
    });

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
