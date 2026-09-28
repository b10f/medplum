// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { QuestionnaireItem } from '@medplum/fhirtypes';
import {
  fromFhirAnswerOptions,
  fromFhirQuestionnaireItem,
  toFhirQuestionnaireItem,
} from './QuestionnaireBuilderV2.utils';
import type { LoincFormDefinition } from './QuestionnaireLoinc.utils';
import {
  groupLoincAnswerLists,
  parseLoincQuestionSearch,
  toFhirAnswerOptionsFromLoincAnswerList,
  toFhirItemFromLoincPanel,
  toFhirItemFromLoincQuestion,
  toFhirItemType,
  toFhirQuestionnaireFromLoincForm,
} from './QuestionnaireLoinc.utils';

// Shape of a Clinical Tables loinc_items search: [total, codes, extraFields, displayFields]
const searchResponse = [
  2,
  ['44250-9', '8480-6'],
  {
    datatype: ['CNE', 'REAL'],
    answers: [
      [
        { AnswerStringID: 'LA6570-1', DisplayText: 'More than half the days', SequenceNo: 3, Score: 2 },
        { AnswerStringID: 'LA6568-5', DisplayText: 'Not at all', SequenceNo: 1, Score: 0 },
        { AnswerStringID: 'LA6569-3', DisplayText: 'Several days', SequenceNo: 2, Score: 1 },
      ],
      null,
    ],
    units: [null, [{ code: 'mm[Hg]', name: 'mm[Hg]' }]],
  },
  [['Little interest or pleasure in doing things'], ['Systolic blood pressure']],
];

describe('QuestionnaireLoinc.utils', () => {
  test('parseLoincQuestionSearch', () => {
    const questions = parseLoincQuestionSearch(searchResponse);
    expect(questions.map((q) => [q.code, q.text, q.datatype])).toStrictEqual([
      ['44250-9', 'Little interest or pleasure in doing things', 'CNE'],
      ['8480-6', 'Systolic blood pressure', 'REAL'],
    ]);
    expect(questions[0].answers).toHaveLength(3);
    expect(questions[1].answers).toBeUndefined();
    expect(parseLoincQuestionSearch({ error: 'bad' })).toStrictEqual([]);
  });

  test('choice question keeps LOINC codes, answer order and scores', () => {
    const [question] = parseLoincQuestionSearch(searchResponse);
    const item = toFhirItemFromLoincQuestion(question);

    expect(item.type).toBe('choice');
    expect(item.code).toStrictEqual([
      { system: 'http://loinc.org', code: '44250-9', display: 'Little interest or pleasure in doing things' },
    ]);
    expect(item.answerOption?.map((option) => option.valueCoding?.code)).toStrictEqual([
      'LA6568-5',
      'LA6569-3',
      'LA6570-1',
    ]);
    expect(item.answerOption?.[0]).toStrictEqual({
      valueCoding: { system: 'http://loinc.org', code: 'LA6568-5', display: 'Not at all' },
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue', valueDecimal: 0 }],
    });
  });

  test('decimal question gets its unit', () => {
    const item = toFhirItemFromLoincQuestion(parseLoincQuestionSearch(searchResponse)[1]);
    expect(item.type).toBe('decimal');
    expect(item.extension).toStrictEqual([
      {
        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unit',
        valueCoding: { system: 'http://unitsofmeasure.org', code: 'mm[Hg]', display: 'mm[Hg]' },
      },
    ]);
  });

  test('quantity question offers every unit', () => {
    const item = toFhirItemFromLoincQuestion({
      code: '29463-7',
      text: 'Body weight',
      datatype: 'QTY',
      units: [{ code: 'kg' }, { code: '[lb_av]', name: 'lb' }],
    });
    expect(item.extension?.map((e) => [e.url.split('-').pop(), e.valueCoding?.code])).toStrictEqual([
      ['unitOption', 'kg'],
      ['unitOption', '[lb_av]'],
    ]);
  });

  test('LOINC codes, scores and units survive the builder round trip', () => {
    for (const question of parseLoincQuestionSearch(searchResponse)) {
      const fhirItem = toFhirItemFromLoincQuestion(question);
      const roundTrip = toFhirQuestionnaireItem(fromFhirQuestionnaireItem(fhirItem, null, 0));
      expect(roundTrip.code).toStrictEqual(fhirItem.code);
      if (fhirItem.answerOption) {
        expect(roundTrip.answerOption).toMatchObject(
          fhirItem.answerOption.map((option) => ({ valueCoding: option.valueCoding }))
        );
      } else {
        expect(roundTrip.answerOption).toBeUndefined();
      }
      for (const extension of fhirItem.extension ?? []) {
        expect(roundTrip.extension).toContainEqual(extension);
      }
    }
    const scored = toFhirQuestionnaireItem(
      fromFhirQuestionnaireItem(toFhirItemFromLoincQuestion(parseLoincQuestionSearch(searchResponse)[0]), null, 0)
    );
    expect(scored.answerOption?.map((option) => option.extension?.[0]?.valueDecimal)).toStrictEqual([0, 1, 2]);
  });

  test('toFhirItemType', () => {
    expect(toFhirItemType('CWE')).toBe('open-choice');
    expect(toFhirItemType('INT')).toBe('integer');
    expect(toFhirItemType('DTM')).toBe('dateTime');
    expect(toFhirItemType(null)).toBe('group');
    expect(toFhirItemType('UNKNOWN')).toBe('string');
  });

  describe('LOINC panel', () => {
    const answers = [
      { code: 'LA6568-5', text: 'Not at all', score: 0 },
      { code: 'LA6569-3', text: 'Several days', score: 1 },
    ];
    const definition: LoincFormDefinition = {
      code: '55757-9',
      name: 'Patient Health Questionnaire 2 item (PHQ-2)',
      codeSystem: 'LOINC',
      copyrightNotice: 'Copyright notice',
      items: [
        {
          linkId: '/55757-9/44250-9',
          question: 'Little interest or pleasure in doing things',
          questionCode: '44250-9',
          questionCodeSystem: 'LOINC',
          dataType: 'CNE',
          answerCardinality: { min: '1', max: '1' },
          codingInstructions: '<p>Over the <b>last 2 weeks</b></p>',
          answers,
        },
        {
          linkId: '/55757-9/section',
          question: 'Vitals',
          dataType: 'SECTION',
          questionCardinality: { min: '1', max: '*' },
          items: [
            {
              question: 'Body weight',
              questionCode: '29463-7',
              dataType: 'REAL',
              units: [{ name: 'kg' }],
            },
          ],
        },
      ],
    };

    test('converts to a coded group with coded items', () => {
      const group = toFhirItemFromLoincPanel(definition);
      expect(group).toMatchObject({
        type: 'group',
        text: definition.name,
        code: [{ system: 'http://loinc.org', code: '55757-9', display: definition.name }],
      });

      const [question, section] = group.item ?? [];
      expect(question).toMatchObject({
        type: 'choice',
        required: true,
        code: [{ system: 'http://loinc.org', code: '44250-9' }],
      });
      expect(question.answerOption?.map((o) => [o.valueCoding?.code, o.extension?.[0]?.valueDecimal])).toStrictEqual([
        ['LA6568-5', 0],
        ['LA6569-3', 1],
      ]);
      expect(section).toMatchObject({ type: 'group', text: 'Vitals', repeats: true });
      expect(section.item?.[0]).toMatchObject({ type: 'decimal', code: [{ code: '29463-7' }] });
      expect(section.item?.[0].extension?.[0].valueCoding).toMatchObject({ code: 'kg' });
    });

    test('every item gets a new linkId, so a panel can be added twice', () => {
      const first = toFhirItemFromLoincPanel(definition);
      const second = toFhirItemFromLoincPanel(definition);
      const linkIds = (item: QuestionnaireItem): string[] => [item.linkId, ...(item.item ?? []).flatMap(linkIds)];
      const all = [...linkIds(first), ...linkIds(second)];
      expect(new Set(all).size).toBe(all.length);
      expect(all).not.toContain('/55757-9/44250-9');
    });

    test('a LOINC form becomes our own coded questionnaire', () => {
      const questionnaire = toFhirQuestionnaireFromLoincForm(definition);
      expect(questionnaire).toMatchObject({
        resourceType: 'Questionnaire',
        status: 'draft',
        title: definition.name,
        code: [{ system: 'http://loinc.org', code: '55757-9', display: definition.name }],
        derivedFrom: ['http://loinc.org/q/55757-9'],
        copyright: 'Copyright notice',
      });
      // The copy is editable, so it must not claim LOINC's canonical identity
      expect(questionnaire.url).toBeUndefined();
      expect(questionnaire.item?.map((item) => item.code?.[0]?.code ?? item.text)).toStrictEqual(['44250-9', 'Vitals']);
    });

    test('coding instructions become help text', () => {
      const [question] = toFhirItemFromLoincPanel(definition).item ?? [];
      const formItem = fromFhirQuestionnaireItem(question, null, 0);
      expect(formItem.help).toBe('Over the last 2 weeks');

      const roundTrip = toFhirQuestionnaireItem(formItem);
      expect(roundTrip.item?.[0]).toMatchObject({ type: 'display', text: 'Over the last 2 weeks' });
      expect(roundTrip.answerOption?.map((o) => o.extension?.[0]?.valueDecimal)).toStrictEqual([0, 1]);
    });
  });

  describe('LOINC answer lists', () => {
    const frequency = [
      { AnswerStringID: 'LA6569-3', DisplayText: 'Several days', SequenceNo: 2, Score: 1 },
      { AnswerStringID: 'LA6568-5', DisplayText: 'Not at all', SequenceNo: 1, Score: 0 },
    ];
    const yesNo = [
      { AnswerStringID: 'LA33-6', DisplayText: 'Yes', SequenceNo: 1 },
      { AnswerStringID: 'LA32-8', DisplayText: 'No', SequenceNo: 2 },
    ];

    test('groups questions by their answer list', () => {
      const lists = groupLoincAnswerLists([
        { code: '44250-9', text: 'Little interest', answers: frequency },
        { code: '1-1', text: 'Free text', datatype: 'ST' },
        { code: '44255-8', text: 'Feeling down', answers: [...frequency].reverse() },
        { code: '2-2', text: 'Smoker?', answers: yesNo },
      ]);

      expect(lists.map((list) => list.key)).toStrictEqual(['LA6568-5|LA6569-3', 'LA33-6|LA32-8']);
      expect(lists[0].answers.map((answer) => answer.DisplayText)).toStrictEqual(['Not at all', 'Several days']);
      expect(lists[0].exampleQuestion).toStrictEqual({ code: '44250-9', text: 'Little interest' });
      expect(lists[0].questionCount).toBe(2);
      expect(lists[1].questionCount).toBe(1);
    });

    test('an answer list becomes coded answer options, scores included', () => {
      const [list] = groupLoincAnswerLists([{ code: '44250-9', text: 'Little interest', answers: frequency }]);
      const answerOption = toFhirAnswerOptionsFromLoincAnswerList(list);
      expect(answerOption[0]).toStrictEqual({
        valueCoding: { system: 'http://loinc.org', code: 'LA6568-5', display: 'Not at all' },
        extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue', valueDecimal: 0 }],
      });

      const formOptions = fromFhirAnswerOptions(answerOption);
      expect(formOptions.map((option) => [option.value.code, option.value.score])).toStrictEqual([
        ['LA6568-5', 0],
        ['LA6569-3', 1],
      ]);
    });
  });
});
