// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { Extension, Questionnaire, QuestionnaireItem, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import {
  MedplumProvider,
  QUESTIONNAIRE_CALCULATED_EXPRESSION_URL,
  QUESTIONNAIRE_ITEM_CONTROL_URL,
  QUESTIONNAIRE_OPTION_EXCLUSIVE_URL,
  QUESTIONNAIRE_SIGNATURE_REQUIRED_URL,
} from '@medplum/react-hooks';
import { act, fireEvent, render, screen, selectAutocompleteOption } from '../test-utils/render';
import type { QuestionnaireFormV2Props } from './QuestionnaireFormV2';
import { QuestionnaireFormV2 } from './QuestionnaireFormV2';

const medplum = new MockClient();

async function setup(props: QuestionnaireFormV2Props): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <QuestionnaireFormV2 {...props} />
      </MedplumProvider>
    );
  });
}

function toQuestionnaire(item: QuestionnaireItem[], extra?: Partial<Questionnaire>): Questionnaire {
  return { resourceType: 'Questionnaire', status: 'active', title: 'Intake', item, ...extra };
}

function itemControl(code: string): Extension[] {
  return [
    {
      url: QUESTIONNAIRE_ITEM_CONTROL_URL,
      valueCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/questionnaire-item-control', code }] },
    },
  ];
}

function coding(code: string): { system: string; code: string; display: string } {
  return { system: 'urn:test', code, display: code[0].toUpperCase() + code.slice(1) };
}

async function submit(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  });
}

async function type(input: HTMLElement, value: string): Promise<void> {
  await act(async () => {
    fireEvent.change(input, { target: { value } });
  });
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

/**
 * Returns the response the form submitted.
 * @param onSubmit - The form's onSubmit mock.
 * @returns The submitted QuestionnaireResponse.
 */
function submitted(onSubmit: ReturnType<typeof vi.fn>): QuestionnaireResponse {
  expect(onSubmit).toHaveBeenCalledTimes(1);
  return onSubmit.mock.calls[0][0];
}

describe('QuestionnaireFormV2', () => {
  test('renders the title, display text and questions', async () => {
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'intro', type: 'display', text: 'Welcome' },
        { linkId: 'name', type: 'string', text: 'Name' },
      ]),
    });
    expect(screen.getByRole('heading', { name: 'Intake' })).toBeInTheDocument();
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  test('loads a questionnaire by reference', async () => {
    const created = await medplum.createResource(
      toQuestionnaire([{ linkId: 'q', type: 'string', text: 'Loaded question' }])
    );
    await setup({ questionnaire: createReference(created) });
    expect(await screen.findByLabelText('Loaded question')).toBeInTheDocument();
  });

  test('submits typed answers as a QuestionnaireResponse', async () => {
    const onSubmit = vi.fn();
    const questionnaire = await medplum.createResource(
      toQuestionnaire([
        { linkId: 'name', type: 'string', text: 'Name' },
        { linkId: 'age', type: 'integer', text: 'Age' },
        { linkId: 'weight', type: 'decimal', text: 'Weight' },
        { linkId: 'notes', type: 'text', text: 'Notes' },
        { linkId: 'site', type: 'url', text: 'Website' },
        { linkId: 'birth', type: 'date', text: 'Birth date' },
        { linkId: 'smoker', type: 'boolean', text: 'Smoker' },
        { linkId: 'empty', type: 'string', text: 'Unanswered' },
      ])
    );
    await setup({ questionnaire, onSubmit });

    await type(screen.getByLabelText('Name'), 'Ada');
    await type(screen.getByLabelText('Age'), '36');
    await type(screen.getByLabelText('Weight'), '61.5');
    await type(screen.getByLabelText('Notes'), 'Line 1\nLine 2');
    await type(screen.getByLabelText('Website'), 'https://example.com');
    await type(screen.getByLabelText('Birth date'), '1990-12-10');
    await click(screen.getByRole('switch'));
    await submit();

    const response = submitted(onSubmit);
    expect(response).toMatchObject({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      questionnaire: `Questionnaire/${questionnaire.id}`,
    });
    expect(response.item).toStrictEqual([
      { linkId: 'name', text: 'Name', answer: [{ valueString: 'Ada' }] },
      { linkId: 'age', text: 'Age', answer: [{ valueInteger: 36 }] },
      { linkId: 'weight', text: 'Weight', answer: [{ valueDecimal: 61.5 }] },
      { linkId: 'notes', text: 'Notes', answer: [{ valueString: 'Line 1\nLine 2' }] },
      { linkId: 'site', text: 'Website', answer: [{ valueUri: 'https://example.com' }] },
      { linkId: 'birth', text: 'Birth date', answer: [{ valueDate: '1990-12-10' }] },
      { linkId: 'smoker', text: 'Smoker', answer: [{ valueBoolean: true }] },
    ]);
  });

  test('a required question must be answered before submitting', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([{ linkId: 'name', type: 'string', text: 'Name', required: true }]),
      onSubmit,
    });

    await submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('This field is required')).toBeInTheDocument();

    await type(screen.getByLabelText(/Name/), 'Ada');
    await submit();
    expect(submitted(onSubmit).item).toStrictEqual([
      { linkId: 'name', text: 'Name', answer: [{ valueString: 'Ada' }] },
    ]);
  });

  test('an answer is checked against its constraints while typing', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([{ linkId: 'code', type: 'string', text: 'Code', maxLength: 3 }]),
      onSubmit,
    });

    await type(screen.getByLabelText('Code'), 'ABCD');
    expect(screen.getByText('Code cannot exceed 3 characters')).toBeInTheDocument();
    await submit();
    expect(onSubmit).not.toHaveBeenCalled();

    await type(screen.getByLabelText('Code'), 'ABC');
    expect(screen.queryByText('Code cannot exceed 3 characters')).not.toBeInTheDocument();
  });

  test('custom submit button text, and no buttons at all', async () => {
    await setup({ questionnaire: toQuestionnaire([]), submitButtonText: 'Send' });
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  test('excludeButtons hides the submit button', async () => {
    await setup({ questionnaire: toQuestionnaire([]), excludeButtons: true });
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  test('an untitled questionnaire', async () => {
    await setup({ questionnaire: { resourceType: 'Questionnaire', status: 'active' } });
    expect(screen.getByRole('heading', { name: 'Untitled' })).toBeInTheDocument();
  });

  test('a conditional question is shown when its condition is met, and left out of the response otherwise', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'smoker', type: 'boolean', text: 'Smoker' },
        {
          linkId: 'packs',
          type: 'integer',
          text: 'Packs per day',
          enableWhen: [{ question: 'smoker', operator: '=', answerBoolean: true }],
        },
        { linkId: 'hidden', type: 'string', text: 'Hidden question', extension: [hidden()] },
      ]),
      onSubmit,
    });
    expect(screen.queryByLabelText('Packs per day')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hidden question')).not.toBeInTheDocument();

    await click(screen.getByRole('switch'));
    await type(screen.getByLabelText('Packs per day'), '2');
    await click(screen.getByRole('switch'));
    expect(screen.queryByLabelText('Packs per day')).not.toBeInTheDocument();
    await submit();

    expect(submitted(onSubmit).item).toStrictEqual([
      { linkId: 'smoker', text: 'Smoker', answer: [{ valueBoolean: false }] },
    ]);
  });

  test('choice questions: radio buttons, and check boxes with an exclusive option', async () => {
    const onSubmit = vi.fn();
    const answerOption = [{ valueCoding: coding('red') }, { valueCoding: coding('blue') }];
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'color', type: 'choice', text: 'Color', answerOption },
        {
          linkId: 'colors',
          type: 'choice',
          text: 'Colors',
          repeats: true,
          answerOption: [...answerOption, { valueCoding: coding('none'), extension: [exclusive()] }],
        },
      ]),
      onSubmit,
    });

    await click(screen.getAllByLabelText('Blue')[0]);
    // The repeating question's check boxes come after the radio buttons.
    const colors = (name: string): HTMLElement => screen.getAllByLabelText(name).at(-1) as HTMLElement;
    await click(colors('Red'));
    await click(colors('Blue'));
    // "None" is exclusive: it clears the other answers.
    await click(colors('None'));
    expect(colors('Red')).not.toBeChecked();
    await click(colors('Red'));
    expect(colors('None')).not.toBeChecked();
    await submit();

    expect(submitted(onSubmit).item).toStrictEqual([
      { linkId: 'color', text: 'Color', answer: [{ valueCoding: coding('blue') }] },
      { linkId: 'colors', text: 'Colors', answer: [{ valueCoding: coding('red') }] },
    ]);
  });

  test('an open-choice question takes a typed answer', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'pet', type: 'open-choice', text: 'Pet', answerOption: [{ valueCoding: coding('cat') }] },
      ]),
      onSubmit,
    });

    await click(screen.getByLabelText('Other'));
    await type(screen.getByPlaceholderText('Please specify'), 'Axolotl');
    await submit();

    expect(submitted(onSubmit).item).toStrictEqual([
      { linkId: 'pet', text: 'Pet', answer: [{ valueString: 'Axolotl' }] },
    ]);
  });

  test('a repeating question takes several answers', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([{ linkId: 'phone', type: 'string', text: 'Phone', repeats: true }]),
      onSubmit,
    });

    await type(screen.getAllByRole('textbox')[0], '111');
    await click(screen.getByRole('button', { name: 'Add answer' }));
    await type(screen.getAllByRole('textbox')[1], '222');
    await click(screen.getByRole('button', { name: 'Add answer' }));
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
    await click(screen.getAllByRole('button', { name: 'Remove answer' })[2]);
    await submit();

    expect(submitted(onSubmit).item).toStrictEqual([
      { linkId: 'phone', text: 'Phone', answer: [{ valueString: '111' }, { valueString: '222' }] },
    ]);
  });

  test('a repeating group is answered in each repetition', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([
        {
          linkId: 'contact',
          type: 'group',
          text: 'Contact',
          repeats: true,
          item: [{ linkId: 'email', type: 'string', text: 'Email' }],
        },
      ]),
      onSubmit,
    });

    await type(screen.getByLabelText('Email'), 'a@example.com');
    await click(screen.getByRole('button', { name: 'Add answer' }));
    await type(screen.getAllByLabelText('Email')[1], 'b@example.com');
    await submit();

    expect(submitted(onSubmit).item).toStrictEqual([
      {
        linkId: 'contact',
        text: 'Contact',
        item: [{ linkId: 'email', text: 'Email', answer: [{ valueString: 'a@example.com' }] }],
      },
      {
        linkId: 'contact',
        text: 'Contact',
        item: [{ linkId: 'email', text: 'Email', answer: [{ valueString: 'b@example.com' }] }],
      },
    ]);
  });

  test('a required group needs an answered question', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([
        {
          linkId: 'contact',
          type: 'group',
          text: 'Contact',
          required: true,
          item: [{ linkId: 'email', type: 'string', text: 'Email' }],
        },
      ]),
      onSubmit,
    });

    await submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Answer at least one question in this group')).toBeInTheDocument();
  });

  test('follow-up items are answered under their answer', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([
        {
          linkId: 'allergy',
          type: 'string',
          text: 'Allergy',
          item: [{ linkId: 'reaction', type: 'string', text: 'Reaction' }],
        },
      ]),
      onSubmit,
    });

    await type(screen.getByLabelText('Allergy'), 'Peanuts');
    await type(screen.getByLabelText('Reaction'), 'Hives');
    await submit();

    expect(submitted(onSubmit).item).toStrictEqual([
      {
        linkId: 'allergy',
        text: 'Allergy',
        answer: [
          {
            valueString: 'Peanuts',
            item: [{ linkId: 'reaction', text: 'Reaction', answer: [{ valueString: 'Hives' }] }],
          },
        ],
      },
    ]);
  });

  test('a response is continued from its answers', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([{ linkId: 'name', type: 'string', text: 'Name' }]),
      questionnaireResponse: {
        resourceType: 'QuestionnaireResponse',
        status: 'in-progress',
        item: [{ linkId: 'name', answer: [{ valueString: 'Grace' }] }],
      },
      onSubmit,
    });

    expect(screen.getByLabelText('Name')).toHaveValue('Grace');
    await submit();
    expect(submitted(onSubmit).item).toStrictEqual([
      { linkId: 'name', text: 'Name', answer: [{ valueString: 'Grace' }] },
    ]);
  });

  test('display mode shows the answers read-only, without a submit button', async () => {
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'name', type: 'string', text: 'Name' },
        { linkId: 'internal', type: 'string', text: 'Staff only', extension: [usageMode('capture')] },
      ]),
      questionnaireResponse: {
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [{ linkId: 'name', answer: [{ valueString: 'Grace' }] }],
      },
      mode: 'display',
    });

    expect(screen.getByLabelText('Name')).toHaveValue('Grace');
    expect(screen.queryByLabelText('Staff only')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  test('pages: Next checks the page, Back returns, and Submit is on the last page', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([
        {
          linkId: 'p1',
          type: 'group',
          text: 'About you',
          extension: itemControl('page'),
          item: [{ linkId: 'name', type: 'string', text: 'Name', required: true }],
        },
        {
          linkId: 'p2',
          type: 'group',
          text: 'Health',
          extension: itemControl('page'),
          item: [{ linkId: 'height', type: 'integer', text: 'Height' }],
        },
        { linkId: 'stray', type: 'string', text: 'Outside a page' },
      ]),
      onSubmit,
    });
    expect(screen.queryByLabelText('Outside a page')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();

    await click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('This field is required')).toBeInTheDocument();

    await type(screen.getByLabelText(/Name/), 'Ada');
    await click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Height')).toBeInTheDocument();

    await click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText(/Name/)).toHaveValue('Ada');
    await click(screen.getByRole('button', { name: 'Next' }));
    await type(screen.getByLabelText('Height'), '170');
    await submit();

    expect(submitted(onSubmit).item).toStrictEqual([
      { linkId: 'p1', text: 'About you', item: [{ linkId: 'name', text: 'Name', answer: [{ valueString: 'Ada' }] }] },
      { linkId: 'p2', text: 'Health', item: [{ linkId: 'height', text: 'Height', answer: [{ valueInteger: 170 }] }] },
    ]);
  });

  test('headers and footers are shown with every page', async () => {
    await setup({
      questionnaire: toQuestionnaire([
        {
          linkId: 'header',
          type: 'group',
          extension: itemControl('header'),
          item: [{ linkId: 'h', type: 'display', text: 'Clinic name' }],
        },
        {
          linkId: 'p1',
          type: 'group',
          text: 'Page one',
          extension: itemControl('page'),
          item: [{ linkId: 'q', type: 'string', text: 'Question' }],
        },
        {
          linkId: 'footer',
          type: 'group',
          extension: itemControl('footer'),
          item: [{ linkId: 'f', type: 'display', text: 'Confidential' }],
        },
      ]),
    });
    expect(screen.getByText('Clinic name')).toBeInTheDocument();
    expect(screen.getByText('Confidential')).toBeInTheDocument();
  });

  test('a required signature must be given before submitting', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([{ linkId: 'name', type: 'string', text: 'Name' }], {
        extension: [{ url: QUESTIONNAIRE_SIGNATURE_REQUIRED_URL, valueCodeableConcept: { coding: [coding('sign')] } }],
      }),
      onSubmit,
    });

    expect(screen.getByText('Signature')).toBeInTheDocument();
    await submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Signature is required.')).toBeInTheDocument();
  });

  test('calculated answers follow the answers they are calculated from', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'a', type: 'integer', text: 'A' },
        { linkId: 'b', type: 'integer', text: 'B' },
        {
          linkId: 'sum',
          type: 'integer',
          text: 'Sum',
          readOnly: true,
          extension: [
            {
              url: QUESTIONNAIRE_CALCULATED_EXPRESSION_URL,
              valueExpression: {
                language: 'text/fhirpath',
                expression:
                  "%resource.item.where(linkId='a').answer.value + %resource.item.where(linkId='b').answer.value",
              },
            },
          ],
        },
      ]),
      onSubmit,
    });

    await type(screen.getByLabelText('A'), '2');
    await type(screen.getByLabelText('B'), '3');
    expect(screen.getByLabelText('Sum')).toHaveValue(5);
    await submit();
    expect(submitted(onSubmit).item?.[2]).toStrictEqual({ linkId: 'sum', text: 'Sum', answer: [{ valueInteger: 5 }] });
  });
});

describe('QuestionnaireFormV2 inputs and layouts', () => {
  test('a choice table answers its questions in a grid', async () => {
    const onSubmit = vi.fn();
    const answerOption = [{ valueCoding: coding('never') }, { valueCoding: coding('often') }];
    await setup({
      questionnaire: toQuestionnaire([
        {
          linkId: 'symptoms',
          type: 'group',
          text: 'Symptoms',
          extension: itemControl('table'),
          item: [
            { linkId: 'cough', type: 'choice', text: 'Cough', required: true, answerOption },
            { linkId: 'pain', type: 'choice', text: 'Pain', repeats: true, answerOption },
          ],
        },
      ]),
      onSubmit,
    });
    expect(screen.getByRole('table')).toBeInTheDocument();

    await submit();
    expect(screen.getByText('This field is required')).toBeInTheDocument();

    await click(screen.getByLabelText('Cough: Often'));
    await click(screen.getByLabelText('Pain: Never'));
    await click(screen.getByLabelText('Pain: Often'));
    await click(screen.getByLabelText('Pain: Never'));
    await submit();

    expect(submitted(onSubmit).item).toStrictEqual([
      {
        linkId: 'symptoms',
        text: 'Symptoms',
        item: [
          { linkId: 'cough', text: 'Cough', answer: [{ valueCoding: coding('often') }] },
          { linkId: 'pain', text: 'Pain', answer: [{ valueCoding: coding('often') }] },
        ],
      },
    ]);
  });

  test('a transposed choice table has a column per question', async () => {
    await setup({
      questionnaire: toQuestionnaire([
        {
          linkId: 'symptoms',
          type: 'group',
          text: 'Symptoms',
          extension: itemControl('htable'),
          item: [{ linkId: 'cough', type: 'choice', text: 'Cough', answerOption: [{ valueCoding: coding('never') }] }],
        },
      ]),
    });
    expect(screen.getByRole('columnheader', { name: 'Cough' })).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
    expect(screen.getByLabelText('Cough: Never')).toBeInTheDocument();
  });

  test('a group table answers each repetition in a row', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([
        {
          linkId: 'medications',
          type: 'group',
          text: 'Medications',
          repeats: true,
          extension: itemControl('gtable'),
          item: [
            { linkId: 'drug', type: 'string', text: 'Drug' },
            { linkId: 'dose', type: 'integer', text: 'Dose' },
          ],
        },
      ]),
      onSubmit,
    });
    expect(screen.getByRole('columnheader', { name: 'Drug' })).toBeInTheDocument();

    await type(screen.getByLabelText('Drug'), 'Aspirin');
    await click(screen.getByRole('button', { name: 'Add row' }));
    await type(screen.getAllByLabelText('Drug')[1], 'Ibuprofen');
    await click(screen.getByRole('button', { name: 'Add row' }));
    await click(screen.getAllByRole('button', { name: 'Remove row' })[2]);
    await submit();

    expect(submitted(onSubmit).item).toStrictEqual([
      {
        linkId: 'medications',
        text: 'Medications',
        item: [{ linkId: 'drug', text: 'Drug', answer: [{ valueString: 'Aspirin' }] }],
      },
      {
        linkId: 'medications',
        text: 'Medications',
        item: [{ linkId: 'drug', text: 'Drug', answer: [{ valueString: 'Ibuprofen' }] }],
      },
    ]);
  });

  test('display text by category, help and texts shown with a question', async () => {
    const displayCategory = (code: string): Extension => ({
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-displayCategory',
      valueCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/questionnaire-display-category', code }] },
    });
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'i', type: 'display', text: 'Read carefully', extension: [displayCategory('instructions')] },
        { linkId: 's', type: 'display', text: 'Kept private', extension: [displayCategory('security')] },
        { linkId: 'h', type: 'display', text: 'Ask the front desk', extension: [displayCategory('help')] },
        {
          linkId: 'pain',
          type: 'integer',
          text: 'Pain',
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-supportLink',
              valueUri: 'https://example.com/pain',
            },
          ],
          item: [
            { linkId: 'pain-help', type: 'display', text: 'From 0 to 10', extension: itemControl('help') },
            { linkId: 'pain-lower', type: 'display', text: 'No pain', extension: itemControl('lower') },
            { linkId: 'pain-upper', type: 'display', text: 'Worst pain', extension: itemControl('upper') },
            { linkId: 'pain-prompt', type: 'display', text: 'Rate it', extension: itemControl('prompt') },
            { linkId: 'pain-unit', type: 'display', text: 'points', extension: itemControl('unit') },
          ],
        },
        {
          linkId: 'mood',
          type: 'string',
          text: 'Mood',
          item: [{ linkId: 'mood-help', type: 'display', text: 'In a word', extension: itemControl('inline') }],
        },
        {
          linkId: 'sleep',
          type: 'string',
          text: 'Sleep',
          item: [{ linkId: 'sleep-help', type: 'display', text: 'Hours a night', extension: itemControl('flyover') }],
        },
      ]),
    });

    for (const text of [
      'Read carefully',
      'Kept private',
      'Ask the front desk',
      'No pain',
      'Worst pain',
      'Rate it',
      'points',
      'In a word',
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', 'https://example.com/pain');
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByText('Sleep')).toBeInTheDocument();
  });

  test('yes/no questions: check box and radio buttons', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'consent', type: 'boolean', text: 'Consent', extension: itemControl('check-box') },
        { linkId: 'insured', type: 'boolean', text: 'Insured', extension: itemControl('radio-button') },
      ]),
      onSubmit,
    });

    await click(screen.getByRole('checkbox', { name: 'Consent' }));
    await click(screen.getByLabelText('No'));
    await submit();

    expect(submitted(onSubmit).item).toStrictEqual([
      { linkId: 'consent', text: 'Consent', answer: [{ valueBoolean: true }] },
      { linkId: 'insured', text: 'Insured', answer: [{ valueBoolean: false }] },
    ]);
  });

  test('choice questions as drop-downs', async () => {
    const onSubmit = vi.fn();
    const answerOption = [{ valueCoding: coding('red') }, { valueCoding: coding('blue') }];
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'color', type: 'choice', text: 'Color', answerOption, extension: itemControl('drop-down') },
        { linkId: 'shade', type: 'choice', text: 'Shade', answerOption, extension: itemControl('autocomplete') },
        { linkId: 'tone', type: 'open-choice', text: 'Tone', answerOption, extension: itemControl('drop-down') },
        {
          linkId: 'tags',
          type: 'choice',
          text: 'Tags',
          repeats: true,
          answerOption,
          extension: itemControl('drop-down'),
        },
        {
          linkId: 'labels',
          type: 'open-choice',
          text: 'Labels',
          repeats: true,
          answerOption,
          extension: itemControl('drop-down'),
        },
      ]),
      onSubmit,
    });

    const color = screen.getByLabelText('Color');
    await act(async () => {
      fireEvent.change(color, {
        target: { value: screen.getByRole<HTMLOptionElement>('option', { name: 'Blue' }).value },
      });
    });
    await type(screen.getByPlaceholderText('Select or type an answer'), 'Pastel');
    expect(screen.getByPlaceholderText('Type to search')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Select items')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Select or type answers')).toBeInTheDocument();
    await submit();

    expect(submitted(onSubmit).item).toStrictEqual([
      { linkId: 'color', text: 'Color', answer: [{ valueCoding: coding('blue') }] },
      { linkId: 'tone', text: 'Tone', answer: [{ valueString: 'Pastel' }] },
    ]);
  });

  test('a repeating open-choice question takes typed answers with its options', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([
        {
          linkId: 'pets',
          type: 'open-choice',
          text: 'Pets',
          repeats: true,
          answerOption: [{ valueCoding: coding('cat') }],
        },
      ]),
      onSubmit,
    });

    await click(screen.getByLabelText('Cat'));
    await click(screen.getByLabelText('Other'));
    await type(screen.getByPlaceholderText('Please specify'), 'Axolotl');
    await submit();

    expect(submitted(onSubmit).item).toStrictEqual([
      { linkId: 'pets', text: 'Pets', answer: [{ valueCoding: coding('cat') }, { valueString: 'Axolotl' }] },
    ]);
  });

  test('quantities: a comparator, the value and its unit', async () => {
    const onSubmit = vi.fn();
    const kg = { system: 'http://unitsofmeasure.org', code: 'kg', display: 'kg' };
    const lb = { system: 'http://unitsofmeasure.org', code: '[lb_av]', display: 'lb' };
    const unitOption = (unit: typeof kg): Extension => ({
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unitOption',
      valueCoding: unit,
    });
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'weight', type: 'quantity', text: 'Weight', extension: [unitOption(kg), unitOption(lb)] },
        {
          linkId: 'height',
          type: 'quantity',
          text: 'Height',
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unit',
              valueCoding: { code: 'cm', display: 'cm' },
            },
          ],
        },
        { linkId: 'dose', type: 'quantity', text: 'Dose' },
      ]),
      onSubmit,
    });
    const [weight, height, dose] = screen.getAllByLabelText('Value');
    const [weightUnit, heightUnit, doseUnit] = screen.getAllByLabelText('Unit');

    await act(async () => {
      fireEvent.change(screen.getAllByLabelText('Comparator')[0], { target: { value: '<' } });
    });
    await type(weight, '70');
    await act(async () => {
      fireEvent.change(weightUnit, { target: { value: '[lb_av]' } });
    });
    expect(heightUnit).toBeDisabled();
    expect(heightUnit).toHaveValue('cm');
    await type(height, '180');
    await type(dose, '2');
    await type(doseUnit, 'tablets');
    await submit();

    expect(submitted(onSubmit).item).toStrictEqual([
      {
        linkId: 'weight',
        text: 'Weight',
        answer: [{ valueQuantity: { comparator: '<', value: 70, unit: 'lb', system: lb.system, code: lb.code } }],
      },
      { linkId: 'height', text: 'Height', answer: [{ valueQuantity: { value: 180, unit: 'cm', code: 'cm' } }] },
      { linkId: 'dose', text: 'Dose', answer: [{ valueQuantity: { value: 2, unit: 'tablets' } }] },
    ]);
  });

  test('numbers: slider, spinner and a number with a unit', async () => {
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'pain', type: 'integer', text: 'Pain', extension: itemControl('slider') },
        { linkId: 'count', type: 'integer', text: 'Count', extension: itemControl('spinner') },
        {
          linkId: 'temp',
          type: 'decimal',
          text: 'Temperature',
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unit',
              valueCoding: { code: 'Cel', display: '°C' },
            },
          ],
        },
      ]),
    });
    expect(screen.getByRole('slider')).toBeInTheDocument();
    await type(screen.getByLabelText('Count'), '3');
    expect(screen.getByLabelText('Count')).toHaveValue('3');
    await type(screen.getByLabelText('Temperature'), '37.5');
    expect(screen.getByText('°C')).toBeInTheDocument();
  });

  test('dates and times', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'start', type: 'dateTime', text: 'Start' },
        { linkId: 'at', type: 'time', text: 'At' },
      ]),
      onSubmit,
    });

    await type(screen.getByLabelText('Start'), '2024-05-01T09:30');
    await type(screen.getByLabelText('At'), '14:15');
    await submit();

    const [start, at] = submitted(onSubmit).item ?? [];
    expect(start.answer?.[0].valueDateTime).toBe(new Date('2024-05-01T09:30').toISOString());
    expect(at.answer).toStrictEqual([{ valueTime: '14:15:00' }]);
  });

  test('a read-only question cannot be answered', async () => {
    await setup({
      questionnaire: toQuestionnaire([{ linkId: 'id', type: 'string', text: 'Patient ID', readOnly: true }]),
    });
    expect(screen.getByLabelText('Patient ID')).toBeDisabled();
  });

  test('attachments are uploaded and their URL is the answer', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([{ linkId: 'scan', type: 'attachment', text: 'Scan' }]),
      onSubmit,
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files: [new File(['hello'], 'hello.txt', { type: 'text/plain' })] },
      });
    });
    expect(screen.getByText('hello.txt')).toBeInTheDocument();
    await submit();

    expect(submitted(onSubmit).item?.[0].answer?.[0].valueAttachment).toMatchObject({
      title: 'hello.txt',
      contentType: 'text/plain',
      url: expect.stringContaining('https://example.com/binary/'),
    });
  });

  test('a reference answer is kept from the response being continued', async () => {
    const onSubmit = vi.fn();
    const reference = { reference: 'Patient/123', display: 'Alice Smith' };
    await setup({
      questionnaire: toQuestionnaire([
        {
          linkId: 'patient',
          type: 'reference',
          text: 'Patient',
          extension: [
            { url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource', valueCode: 'Patient' },
          ],
        },
      ]),
      questionnaireResponse: {
        resourceType: 'QuestionnaireResponse',
        status: 'in-progress',
        item: [{ linkId: 'patient', answer: [{ valueReference: reference }] }],
      },
      onSubmit,
    });

    await submit();
    expect(submitted(onSubmit).item).toStrictEqual([
      { linkId: 'patient', text: 'Patient', answer: [{ valueReference: reference }] },
    ]);
  });

  test('a calculated expression that cannot be evaluated shows why', async () => {
    await setup({
      questionnaire: toQuestionnaire([
        {
          linkId: 'bmi',
          type: 'decimal',
          text: 'BMI',
          extension: [
            {
              url: QUESTIONNAIRE_CALCULATED_EXPRESSION_URL,
              valueExpression: { language: 'text/fhirpath', expression: '1 +' },
            },
          ],
        },
      ]),
    });
    expect(screen.getByText(/^Expression evaluation failed/)).toBeInTheDocument();
  });

  test('a page shows its guidance, and its answers are paged through without checks when viewed', async () => {
    const page = (
      linkId: string,
      text: string,
      item: QuestionnaireItem[],
      extension: Extension[] = []
    ): QuestionnaireItem => ({
      linkId,
      type: 'group',
      text,
      extension: [...itemControl('page'), ...extension],
      item,
    });
    await setup({
      questionnaire: toQuestionnaire([
        page(
          'p1',
          'About you',
          [
            { linkId: 'name', type: 'string', text: 'Name', required: true },
            { linkId: 'p1-help', type: 'display', text: 'Tell us about yourself', extension: itemControl('help') },
          ],
          [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-supportLink',
              valueUri: 'https://example.com/about',
            },
          ]
        ),
        page('p2', 'Health', [{ linkId: 'height', type: 'integer', text: 'Height' }]),
      ]),
      mode: 'display',
    });

    expect(screen.getByText('Tell us about yourself')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'More information' })).toHaveAttribute('href', 'https://example.com/about');
    await click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByText('This field is required')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Height')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  describe('value sets', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(async () => {
      await act(async () => {
        vi.runOnlyPendingTimers();
      });
      vi.useRealTimers();
    });

    test('a choice is searched in its value set', async () => {
      const onSubmit = vi.fn();
      await setup({
        questionnaire: toQuestionnaire([
          { linkId: 'vs', type: 'choice', text: 'Value Set', answerValueSet: 'http://example.com/valueset' },
          {
            linkId: 'many',
            type: 'choice',
            text: 'Many',
            repeats: true,
            answerValueSet: 'http://example.com/valueset',
          },
        ]),
        onSubmit,
      });

      await selectAutocompleteOption(screen.getAllByRole('searchbox')[0], 'Test', 'Test Display');
      await submit();

      expect(submitted(onSubmit).item).toStrictEqual([
        {
          linkId: 'vs',
          text: 'Value Set',
          answer: [{ valueCoding: { system: 'x', code: 'test-code', display: 'Test Display' } }],
        },
      ]);
    });
  });
});

function hidden(): Extension {
  return { url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-hidden', valueBoolean: true };
}

function exclusive(): Extension {
  return { url: QUESTIONNAIRE_OPTION_EXCLUSIVE_URL, valueBoolean: true };
}

function usageMode(code: string): Extension {
  return { url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-usageMode', valueCode: code };
}
