// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
import {
  findFormItemByLinkId,
  fromFhirQuestionnaireItem,
  getAnswerOptionDisplay,
  getPageItems,
  getReferenceFilterError,
  getReferenceSearchCriteria,
  hasFollowUpItems,
  isHelpItem,
  isHorizontalChoiceLayout,
  isPageItem,
  PAGE_ITEM_CONTROL,
  rebuildFormItems,
  toFhirQuestionnaire,
  toFhirQuestionnaireItem,
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
    for (const key of ['index', 'path', 'parent']) {
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

    test('follow-up items are kept on save', () => {
      const exported = toFhirQuestionnaire(toFormValues(questionnaire));
      expect(exported.item?.[0].item?.[0]).toMatchObject({
        linkId: 'how-many',
        type: 'integer',
        enableWhen: [{ question: 'smoke', operator: '=', answerBoolean: true }],
      });
      expect(hasFollowUpItems(toFormValues(questionnaire).item[0])).toBe(true);
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
  });

  describe('quantity answers', () => {
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
  });
});
