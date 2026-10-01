// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
import { render, screen } from '../../test-utils/render';
import type { ExtendedQuestionnaireItem } from '../QuestionnaireFormV2.utils';
import { fromFhirAnswerOptions, fromFhirQuestionnaireItem } from '../QuestionnaireFormV2.utils';
import { QuestionnaireRendererLabel } from '../QuestionnaireRendererLabel';
import {
  findOptionValue,
  fromChoiceText,
  getAnswerLabel,
  getDecimalPlaces,
  getUnitSection,
  isTypedAnswer,
  toChoiceText,
  toOptionData,
  toValueSetContains,
} from './QuestionnaireRendererItem.utils';

const apple = { system: 'urn:fruit', code: 'apple', display: 'Apple' };
const pear = { system: 'urn:fruit', code: 'pear' };

const options = fromFhirAnswerOptions([
  {
    valueCoding: apple,
    extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix', valueString: 'a)' }],
  },
  { valueCoding: pear },
  { valueString: 'Plum' },
  { valueInteger: 3 },
]);

function toItem(item: QuestionnaireItem): ExtendedQuestionnaireItem {
  const questionnaire: Questionnaire = { resourceType: 'Questionnaire', status: 'active', item: [item] };
  return fromFhirQuestionnaireItem(item, questionnaire, 0);
}

describe('QuestionnaireRendererItem.utils', () => {
  test('getUnitSection shows the unit at the end of the field, or nothing without one', () => {
    expect(getUnitSection(undefined)).toStrictEqual({});
    expect(getUnitSection('')).toStrictEqual({});

    const section = getUnitSection('kg');
    expect(section.rightSectionWidth).toBe('auto');
    render(<>{section.rightSection}</>);
    expect(screen.getByText('kg')).toBeInTheDocument();
  });

  test('getAnswerLabel labels the input with its question, or only names it when inline', () => {
    const item = toItem({ linkId: 'name', type: 'string', text: 'Name' });
    const repeat = { index: 0, count: 2, onAdd: vi.fn(), onRemove: vi.fn() };
    const props = { item, answersPath: 'item.0.answer', answerIndex: 0, repeat };

    expect(getAnswerLabel({ ...props, inline: true })).toStrictEqual({ 'aria-label': 'Name' });

    const { label, labelProps } = getAnswerLabel(props);
    expect(label?.type).toBe(QuestionnaireRendererLabel);
    expect(label?.props).toStrictEqual({ item, repeat });
    expect(labelProps?.className).toBeTruthy();
  });

  test('getDecimalPlaces reads maxDecimalPlaces; empty means no limit', () => {
    const item = toItem({ linkId: 'weight', type: 'decimal' });
    expect(getDecimalPlaces(item)).toBeUndefined();
    expect(getDecimalPlaces({ ...item, maxDecimalPlaces: 0 })).toBe(0);
    expect(getDecimalPlaces({ ...item, maxDecimalPlaces: '2' as any })).toBe(2);
    expect(getDecimalPlaces({ ...item, maxDecimalPlaces: '' as any })).toBeUndefined();
  });

  test('toValueSetContains converts codings and plain values', () => {
    expect(toValueSetContains(apple)).toStrictEqual(apple);
    expect(toValueSetContains(pear)).toStrictEqual({ ...pear, display: undefined });
    expect(toValueSetContains('Plum')).toStrictEqual({ code: 'Plum', display: 'Plum' });
    expect(toValueSetContains(3)).toStrictEqual({ code: '3', display: '3' });
  });

  test('isTypedAnswer is true only for typed text that is none of the options', () => {
    expect(isTypedAnswer(options, 'Banana')).toBe(true);
    expect(isTypedAnswer(options, 'Plum')).toBe(false);
    expect(isTypedAnswer(options, '')).toBe(false);
    expect(isTypedAnswer(options, apple)).toBe(false);
    expect(isTypedAnswer(options, 3)).toBe(false);
  });

  test('toOptionData and findOptionValue convert between options and select options', () => {
    const data = toOptionData(options);
    expect(data.map((option) => option.label)).toStrictEqual(['a) Apple', 'pear', 'Plum', '3']);
    expect(new Set(data.map((option) => option.value)).size).toBe(options.length);

    for (const [index, option] of options.entries()) {
      expect(findOptionValue(options, data[index].value)).toStrictEqual(option.value);
    }
    expect(findOptionValue(options, null)).toBe('');
    expect(findOptionValue(options, 'unknown')).toBe('');
  });

  test('toChoiceText and fromChoiceText convert between answers and free text', () => {
    expect(toChoiceText(options, { ...apple })).toBe('Apple');
    expect(toChoiceText(options, 'Plum')).toBe('Plum');
    expect(toChoiceText(options, 'Banana')).toBe('Banana');
    expect(toChoiceText(options, { code: 'kiwi', display: 'Kiwi' })).toBe('Kiwi');
    expect(toChoiceText(options, undefined)).toBe('');

    expect(fromChoiceText(options, 'Apple')).toStrictEqual(options[0].value);
    expect(fromChoiceText(options, '3')).toBe(3);
    expect(fromChoiceText(options, 'Banana')).toBe('Banana');
  });
});
