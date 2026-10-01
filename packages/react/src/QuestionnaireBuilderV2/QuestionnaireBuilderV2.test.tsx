// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import { HTTP_HL7_ORG } from '@medplum/core';
import type { CodeSystem, Extension, Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider, QUESTIONNAIRE_ITEM_CONTROL_URL } from '@medplum/react-hooks';
import { act, fireEvent, render, screen, waitFor, within } from '../test-utils/render';
import type { QuestionnaireBuilderV2Props } from './QuestionnaireBuilderV2';
import { QuestionnaireBuilderV2 } from './QuestionnaireBuilderV2';

const ITEM_CONTROL_SYSTEM = `${HTTP_HL7_ORG}/fhir/questionnaire-item-control`;
const ITEM_TYPE_SYSTEM = `${HTTP_HL7_ORG}/fhir/item-type`;

// FHIR R4's item type and item control code systems, as far as the builder reads them.
const itemTypes: CodeSystem = {
  resourceType: 'CodeSystem',
  status: 'active',
  content: 'complete',
  url: ITEM_TYPE_SYSTEM,
  concept: [
    { code: 'group', display: 'Group' },
    { code: 'display', display: 'Display' },
    {
      code: 'question',
      display: 'Question',
      concept: [
        'boolean',
        'decimal',
        'integer',
        'date',
        'dateTime',
        'time',
        'string',
        'text',
        'url',
        'choice',
        'open-choice',
        'attachment',
        'reference',
        'quantity',
      ].map((code) => ({ code, display: code })),
    },
  ],
};

const itemControls: CodeSystem = {
  resourceType: 'CodeSystem',
  status: 'active',
  content: 'complete',
  url: ITEM_CONTROL_SYSTEM,
  concept: [
    {
      code: 'group',
      display: 'Group',
      concept: ['list', 'table', 'htable', 'gtable', 'header', 'footer', 'page'].map((code) => ({
        code,
        display: code,
      })),
    },
    {
      code: 'text',
      display: 'Text',
      concept: ['inline', 'prompt', 'unit', 'lower', 'upper', 'flyover', 'help'].map((code) => ({
        code,
        display: code,
      })),
    },
    {
      code: 'question',
      display: 'Question',
      concept: ['autocomplete', 'drop-down', 'check-box', 'radio-button', 'slider', 'spinner'].map((code) => ({
        code,
        display: code,
      })),
    },
  ],
};

let medplum: MockClient;

beforeAll(async () => {
  // The preview scrolls to the selected item; jsdom does not scroll.
  Element.prototype.scrollTo = vi.fn();
  medplum = new MockClient();
  await medplum.createResource(itemTypes);
  await medplum.createResource(itemControls);
});

function itemControl(code: string): Extension[] {
  return [
    { url: QUESTIONNAIRE_ITEM_CONTROL_URL, valueCodeableConcept: { coding: [{ system: ITEM_CONTROL_SYSTEM, code }] } },
  ];
}

/** An item of each kind the builder edits, each with its own text. */
const EVERY_KIND_OF_ITEM: QuestionnaireItem[] = [
  { linkId: 'header', type: 'group', text: 'Header', extension: itemControl('header'), item: [] },
  {
    linkId: 'page',
    type: 'group',
    text: 'Page one',
    extension: itemControl('page'),
    item: [{ linkId: 'on-page', type: 'string', text: 'On the page' }],
  },
  { linkId: 'string', type: 'string', text: 'String question' },
  { linkId: 'integer', type: 'integer', text: 'Integer question' },
  { linkId: 'decimal', type: 'decimal', text: 'Decimal question' },
  { linkId: 'date', type: 'date', text: 'Date question' },
  { linkId: 'time', type: 'time', text: 'Time question' },
  { linkId: 'text', type: 'text', text: 'Text question' },
  { linkId: 'url', type: 'url', text: 'URL question' },
  { linkId: 'boolean', type: 'boolean', text: 'Boolean question' },
  {
    linkId: 'choice',
    type: 'choice',
    text: 'Choice question',
    answerOption: [{ valueCoding: { system: 'urn:test', code: 'a', display: 'A' } }],
  },
  {
    linkId: 'open',
    type: 'open-choice',
    text: 'Open choice question',
    answerValueSet: 'http://example.com/vs',
  },
  { linkId: 'quantity', type: 'quantity', text: 'Quantity question' },
  { linkId: 'reference', type: 'reference', text: 'Reference question' },
  { linkId: 'attachment', type: 'attachment', text: 'Attachment question' },
  { linkId: 'display', type: 'display', text: 'Display text' },
  {
    linkId: 'conditional',
    type: 'string',
    text: 'Conditional question',
    enableWhen: [{ question: 'boolean', operator: '=', answerBoolean: true }],
  },
];

function toQuestionnaire(item: QuestionnaireItem[]): Questionnaire {
  return { resourceType: 'Questionnaire', status: 'active', title: 'Intake', item };
}

async function setup(props: QuestionnaireBuilderV2Props): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <Notifications />
        <QuestionnaireBuilderV2 {...props} />
      </MedplumProvider>
    );
  });
}

function tree(): HTMLElement {
  return screen.getByRole('tree');
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

/**
 * Types into a settings field, and waits for it to be written to the questionnaire (the fields are debounced).
 * @param input - The field.
 * @param value - The new value.
 */
async function type(input: HTMLElement, value: string): Promise<void> {
  await act(async () => {
    fireEvent.change(input, { target: { value } });
  });
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
  });
}

/**
 * Opens a menu and picks one of its items, in the menu the button opened: in jsdom a menu that closes stays in the
 * page, hidden.
 * @param target - The button that opens the menu.
 * @param name - The menu item.
 */
async function chooseMenuItem(target: HTMLElement, name: string): Promise<void> {
  await click(target);
  // The menu opens after its transition starts.
  const menu = await waitFor(() => {
    const dropdown = document.getElementById(target.getAttribute('aria-controls') as string);
    expect(dropdown).not.toBeNull();
    return dropdown as HTMLElement;
  });
  await click(within(menu).getByRole('menuitem', { name, hidden: true }));
}

/**
 * Picks an option of a settings select (an AsyncAutocomplete): searches for it, and clicks it once it is listed.
 * @param label - The select's label.
 * @param option - The option's label.
 */
async function pick(label: string, option: string): Promise<void> {
  const wrapper = screen.getByText(label, { selector: 'label' }).parentElement as HTMLElement;
  // A select with one value hides its search field until the value is removed.
  const remove = within(wrapper).queryByTestId('selected-items')?.querySelector('button');
  if (remove) {
    await click(remove);
  }
  await act(async () => {
    fireEvent.change(within(wrapper).getByRole('searchbox', { hidden: true }), { target: { value: option } });
  });
  await click(await screen.findByRole('option', { name: option, hidden: true }, { timeout: 3000 }));
}

async function save(): Promise<void> {
  await click(screen.getByRole('button', { name: 'Save' }));
}

function saved(onSubmit: ReturnType<typeof vi.fn>): Questionnaire {
  expect(onSubmit).toHaveBeenCalledTimes(1);
  return onSubmit.mock.calls[0][0];
}

async function selectItem(text: string): Promise<void> {
  await act(async () => {
    fireEvent.click(within(tree()).getByText(text));
  });
}

describe('QuestionnaireBuilderV2', () => {
  test('shows a hint until an item is selected', async () => {
    await setup({ questionnaire: toQuestionnaire(EVERY_KIND_OF_ITEM), onSubmit: vi.fn() });
    expect(screen.getByText('Select an item.')).toBeInTheDocument();
  });

  test.each(EVERY_KIND_OF_ITEM.map((item) => item.text as string))('shows the settings of: %s', async (text) => {
    await setup({ questionnaire: toQuestionnaire(EVERY_KIND_OF_ITEM), onSubmit: vi.fn() });
    await selectItem(text);
    expect(screen.getByLabelText(/Primary text for the item/)).toHaveValue(text);
  });

  test('edits are saved as a FHIR Questionnaire', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([{ linkId: 'name', type: 'string', text: 'Name' }]),
      onSubmit,
    });

    await selectItem('Name');
    await type(screen.getByLabelText(/Primary text for the item/), 'Full name');
    await type(screen.getByLabelText('Prefix'), '1.');
    await click(screen.getByLabelText('Required'));
    await click(screen.getByLabelText('Hidden'));
    await click(screen.getByLabelText('Repeats'));
    await type(screen.getByLabelText('Maximum Occurrences'), '3');
    await click(screen.getByLabelText('Read Only'));
    await type(screen.getByLabelText('Support Link'), 'https://example.com/name');
    await type(screen.getByLabelText('Help Text'), 'As on your ID');
    await save();

    const [item] = saved(onSubmit).item ?? [];
    expect(item).toMatchObject({
      linkId: 'name',
      type: 'string',
      text: 'Full name',
      prefix: '1.',
      required: true,
      repeats: true,
      readOnly: true,
    });
    expect(item.extension).toEqual(
      expect.arrayContaining([
        { url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-hidden', valueBoolean: true },
        { url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-maxOccurs', valueInteger: 3 },
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-supportLink',
          valueUri: 'https://example.com/name',
        },
      ])
    );
    expect(item.item?.[0]).toMatchObject({ linkId: 'name_help', type: 'display', text: 'As on your ID' });
  });

  test('items are added from the add item menus', async () => {
    const onSubmit = vi.fn();
    await setup({ questionnaire: toQuestionnaire([]), onSubmit });
    expect(screen.getByText('No items added yet.')).toBeInTheDocument();

    for (const action of [
      'Add Question',
      'Add Display Text',
      'Add Question Group',
      'Add Page',
      'Add Header',
      'Add Footer',
    ]) {
      await chooseMenuItem(screen.getAllByRole('button', { name: 'Add item' })[0], action);
    }
    // A follow-up question of the first question, and a question in the group.
    const rows = (): HTMLElement[] => within(tree()).getAllByRole('treeitem');
    await chooseMenuItem(within(rows()[1]).getByRole('button', { name: 'Add item' }), 'Add Follow-up Question');
    await save();

    const items = saved(onSubmit).item ?? [];
    expect(items.map((item) => [item.type, item.text])).toStrictEqual([
      ['group', 'New Header'],
      ['string', 'New Item'],
      ['display', 'New Item'],
      ['group', 'New Item'],
      ['group', 'New Page'],
      ['group', 'New Footer'],
    ]);
    expect(items[1].item?.[0]).toMatchObject({
      type: 'string',
      text: 'New Item',
      enableWhen: [{ question: items[1].linkId, operator: 'exists', answerBoolean: true }],
    });
  });

  test('items are moved and deleted with their menu', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'a', type: 'string', text: 'First' },
        { linkId: 'b', type: 'string', text: 'Second' },
        { linkId: 'c', type: 'string', text: 'Third' },
      ]),
      onSubmit,
    });
    const itemMenu = async (index: number, action: string): Promise<void> => {
      await chooseMenuItem(within(tree()).getAllByRole('button', { name: 'Item actions' })[index], action);
    };

    await itemMenu(0, 'Move Down');
    await itemMenu(2, 'Move Up');
    await itemMenu(0, 'Delete');
    await save();

    // a, b, c -> b, a, c -> b, c, a -> c, a
    expect(saved(onSubmit).item?.map((item) => item.linkId)).toStrictEqual(['c', 'a']);
  });

  test('the questionnaire settings: required signature and design note', async () => {
    const onSubmit = vi.fn();
    await setup({ questionnaire: toQuestionnaire([]), onSubmit });

    await click(screen.getByRole('button', { name: 'Questionnaire settings' }));
    await click(await screen.findByLabelText(/Signature required/));
    expect(screen.getByText('Signature type')).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Design note'), { target: { value: 'For the front desk' } });
    });
    await click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));

    const questionnaire = saved(onSubmit);
    expect(questionnaire.extension).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-signatureRequired' }),
        { url: 'http://hl7.org/fhir/StructureDefinition/designNote', valueMarkdown: 'For the front desk' },
      ])
    );
  });

  test('the preview checks its answers', async () => {
    await setup({
      questionnaire: toQuestionnaire([{ linkId: 'name', type: 'string', text: 'Name' }]),
      onSubmit: vi.fn(),
    });
    await click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('All preview answers are valid')).toBeInTheDocument();
  });

  test('answer options are added, edited and removed', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'color', type: 'choice', text: 'Color', repeats: true },
        { linkId: 'shade', type: 'choice', text: 'Shade', answerValueSet: 'http://example.com/vs' },
      ]),
      onSubmit,
    });

    await selectItem('Shade');
    expect(screen.getByText('Answers from a value set')).toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Remove value set' }));
    expect(screen.getByText(/No answer options added/)).toBeInTheDocument();

    await selectItem('Color');
    await click(screen.getByRole('button', { name: 'Add answer option' }));
    await click(screen.getByRole('button', { name: 'Add answer option' }));
    await type(screen.getAllByLabelText(/Display Text/)[1], 'None');
    await click(screen.getAllByLabelText(/Exclusive/)[1]);
    await click(screen.getAllByLabelText('Initially Selected')[0]);
    await type(screen.getAllByLabelText('Score')[0], '2');
    await click(screen.getByRole('button', { name: 'Add answer option' }));
    await click(screen.getAllByRole('button', { name: 'Remove Answer Option', hidden: true })[2]);
    await save();

    const [color, shade] = saved(onSubmit).item ?? [];
    expect(color.answerOption).toMatchObject([
      { initialSelected: true, valueCoding: { code: '1', display: 'Option 1' } },
      { valueCoding: { code: '2', display: 'None' }, extension: [{ valueBoolean: true }] },
    ]);
    expect(color.answerOption?.[0].extension).toEqual([
      { url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue', valueDecimal: 2 },
    ]);
    expect(shade.answerValueSet).toBeUndefined();
  });

  test('conditions compare the answer of another question', async () => {
    const options = [{ valueCoding: { system: 'urn:test', code: 'yes', display: 'Yes' } }];
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'choice', type: 'choice', text: 'Choice question', answerOption: options },
        { linkId: 'vs', type: 'choice', text: 'Value set question', answerValueSet: 'http://example.com/vs' },
        { linkId: 'boolean', type: 'boolean', text: 'Boolean question' },
        { linkId: 'integer', type: 'integer', text: 'Integer question' },
        { linkId: 'attachment', type: 'attachment', text: 'Attachment question' },
        {
          linkId: 'target',
          type: 'string',
          text: 'Conditional question',
          enableBehavior: 'any',
          enableWhen: [
            { question: 'choice', operator: '=', answerCoding: options[0].valueCoding },
            {
              question: 'vs',
              operator: '=',
              answerCoding: { system: 'x', code: 'test-code', display: 'Test Display' },
            },
            { question: 'boolean', operator: '=', answerBoolean: false },
            { question: 'integer', operator: '>', answerInteger: 3 },
            { question: 'attachment', operator: '=', answerString: 'x' },
            { question: 'integer', operator: 'exists', answerBoolean: false },
          ],
        },
      ]),
      onSubmit: vi.fn(),
    });

    await selectItem('Conditional question');
    expect(screen.getByLabelText('Show this item when')).toBeInTheDocument();
    expect(screen.getByText(/can only check whether it is answered/)).toBeInTheDocument();

    await click(screen.getByRole('button', { name: 'Add Condition' }));
    expect(screen.getAllByText('Select Question')).toHaveLength(1);
    await click(screen.getAllByRole('button', { name: 'Remove Condition', hidden: true })[6]);
    expect(screen.queryByText('Select Question')).not.toBeInTheDocument();
  });

  test('reference, attachment and quantity settings', async () => {
    const onSubmit = vi.fn();
    await setup({
      questionnaire: toQuestionnaire([
        { linkId: 'ref', type: 'reference', text: 'Reference question' },
        { linkId: 'file', type: 'attachment', text: 'Attachment question' },
        {
          linkId: 'qty',
          type: 'quantity',
          text: 'Quantity question',
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unitValueSet',
              valueCanonical: 'http://example.com/units',
            },
          ],
        },
      ]),
      onSubmit,
    });

    await selectItem('Reference question');
    await click(screen.getByRole('button', { name: 'Add resource type' }));
    expect(screen.getAllByPlaceholderText('Resource Type')[0]).toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Remove resource type' }));
    await type(screen.getByLabelText('Search filter'), 'active');
    expect(screen.getByText(/is not name=value/)).toBeInTheDocument();
    await type(screen.getByLabelText('Search filter'), 'active=true');

    await selectItem('Attachment question');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Maximum size (MB)'), { target: { value: '2' } });
    });

    await selectItem('Quantity question');
    expect(screen.getByText('http://example.com/units')).toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Remove unit value set' }));
    expect(screen.getByPlaceholderText('Search value sets')).toBeInTheDocument();
    await save();

    const [ref, file, qty] = saved(onSubmit).item ?? [];
    expect(ref.extension).toEqual(
      expect.arrayContaining([
        { url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceFilter', valueString: 'active=true' },
      ])
    );
    expect(file.extension).toEqual(
      expect.arrayContaining([{ url: 'http://hl7.org/fhir/StructureDefinition/maxSize', valueDecimal: 2097152 }])
    );
    expect(qty.extension?.some((ext) => ext.url.endsWith('questionnaire-unitValueSet'))).toBe(false);
  });

  test('answer options are taken from a LOINC answer list', async () => {
    const answers = [
      { AnswerStringID: 'LA6568-5', DisplayText: 'Not at all', SequenceNo: 1, Score: 0 },
      { AnswerStringID: 'LA6569-3', DisplayText: 'Several days', SequenceNo: 2, Score: 1 },
    ];
    // A Clinical Tables loinc_items search: [total, codes, extraFields, displayFields]
    const body = [
      2,
      ['44250-9', '44255-8'],
      { datatype: ['CNE', 'CNE'], answers: [answers, answers], units: [null, null] },
      [['Little interest or pleasure in doing things'], ['Feeling down, depressed, or hopeless']],
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => body }))
    );
    const onSubmit = vi.fn();
    await setup({ questionnaire: toQuestionnaire([{ linkId: 'q', type: 'choice', text: 'Interest' }]), onSubmit });
    await selectItem('Interest');

    await click(screen.getByRole('button', { name: 'Add answers from LOINC' }));
    expect(await screen.findByText(/Search by the wording of a question/)).toBeInTheDocument();
    const drawer = screen.getByRole('dialog');
    await act(async () => {
      fireEvent.change(within(drawer).getByPlaceholderText('Search'), { target: { value: 'interest' } });
    });
    expect(await within(drawer).findByText(/and 1 more question/)).toBeInTheDocument();
    await click(within(drawer).getByRole('button', { name: 'Use' }));
    await save();
    vi.unstubAllGlobals();

    expect(saved(onSubmit).item?.[0].answerOption).toMatchObject([
      { valueCoding: { code: 'LA6568-5', display: 'Not at all' } },
      { valueCoding: { code: 'LA6569-3', display: 'Several days' } },
    ]);
  });

  test('answer options are copied from a value set', async () => {
    await medplum.createResource({
      resourceType: 'ValueSet',
      status: 'active',
      name: 'colors',
      title: 'Colors',
      url: 'http://example.com/ValueSet/colors',
    });
    const onSubmit = vi.fn();
    await setup({ questionnaire: toQuestionnaire([{ linkId: 'q', type: 'choice', text: 'Color' }]), onSubmit });
    await selectItem('Color');

    await click(screen.getByRole('button', { name: 'Add answers from a value set' }));
    expect(await screen.findByText(/Search for a value set by name/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Search value sets'), { target: { value: 'colors' } });
    });
    await click(await screen.findByText('http://example.com/ValueSet/colors', {}, { timeout: 3000 }));
    await click(await screen.findByRole('button', { name: 'Use' }));
    await save();

    // The mock server expands every value set to the same codes.
    expect(saved(onSubmit).item?.[0].answerOption?.map((option) => option.valueCoding?.code)).toStrictEqual([
      'test-code',
      'test-code-2',
      'test-code-3',
    ]);
  });

  test('guidance: help, entry format and texts shown with the answer', async () => {
    const onSubmit = vi.fn();
    await setup({ questionnaire: toQuestionnaire([{ linkId: 'pain', type: 'integer', text: 'Pain' }]), onSubmit });
    await selectItem('Pain');

    await type(screen.getByLabelText('Help Text'), 'From 0 to 10');
    await click(screen.getByLabelText('Below the question'));
    await type(screen.getByLabelText('Entry Format'), 'nn');
    await type(screen.getByLabelText('Prompt'), 'Rate it');
    await type(screen.getByLabelText('Unit label'), 'points');
    await type(screen.getByLabelText('Lower label'), 'No pain');
    await type(screen.getByLabelText('Upper label'), 'Worst pain');
    await type(screen.getByLabelText('Min Value'), '0');
    await type(screen.getByLabelText('Max Value'), '10');
    await type(screen.getByLabelText('Design Note'), 'From the pain scale');
    await save();

    const [pain] = saved(onSubmit).item ?? [];
    expect(
      pain.item?.map((item) => [item.text, item.extension?.[0].valueCodeableConcept?.coding?.[0].code])
    ).toStrictEqual([
      ['From 0 to 10', 'inline'],
      ['Rate it', 'prompt'],
      ['points', 'unit'],
      ['No pain', 'lower'],
      ['Worst pain', 'upper'],
    ]);
    expect(pain.extension).toEqual(
      expect.arrayContaining([
        { url: 'http://hl7.org/fhir/StructureDefinition/entryFormat', valueString: 'nn' },
        { url: 'http://hl7.org/fhir/StructureDefinition/minValue', valueInteger: 0 },
        { url: 'http://hl7.org/fhir/StructureDefinition/maxValue', valueInteger: 10 },
        { url: 'http://hl7.org/fhir/StructureDefinition/designNote', valueMarkdown: 'From the pain scale' },
      ])
    );
  });

  test('the type, item control and usage mode are picked from their codes', async () => {
    const onSubmit = vi.fn();
    await setup({ questionnaire: toQuestionnaire([{ linkId: 'count', type: 'string', text: 'Count' }]), onSubmit });
    await selectItem('Count');

    await pick('Type', 'integer');
    await pick('Item Control', 'slider');
    await type(screen.getByLabelText('Slider Step Value'), '2');
    await pick('Usage mode', 'Test Display');
    await save();

    const [count] = saved(onSubmit).item ?? [];
    expect(count.type).toBe('integer');
    expect(count.extension).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: QUESTIONNAIRE_ITEM_CONTROL_URL,
          valueCodeableConcept: expect.objectContaining({ coding: [expect.objectContaining({ code: 'slider' })] }),
        }),
        { url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-sliderStepValue', valueInteger: 2 },
        { url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-usageMode', valueCode: 'test-code' },
      ])
    );
  });

  test('the tree expands groups, and marks items a paginated form does not show', async () => {
    await setup({
      questionnaire: toQuestionnaire([
        {
          linkId: 'page',
          type: 'group',
          text: 'Page one',
          extension: itemControl('page'),
          item: [{ linkId: 'inner', type: 'string', text: 'Inside the page' }],
        },
        { linkId: 'stray', type: 'string', text: 'Outside a page' },
      ]),
      onSubmit: vi.fn(),
    });
    expect(screen.getByLabelText('Not shown: outside a page')).toBeInTheDocument();

    const page = within(tree()).getAllByRole('treeitem')[0];
    expect(page).toHaveAttribute('aria-expanded', 'false');
    expect(within(tree()).queryByText('Inside the page')).not.toBeInTheDocument();
    await click(page.querySelector('[class*="chevron"]') as HTMLElement);
    expect(page).toHaveAttribute('aria-expanded', 'true');
    await selectItem('Inside the page');
    expect(screen.getByLabelText(/Primary text for the item/)).toHaveValue('Inside the page');
  });

  test('a code list the server does not have is shown as unavailable', async () => {
    const bare = new MockClient();
    await act(async () => {
      render(
        <MedplumProvider medplum={bare}>
          <QuestionnaireBuilderV2
            questionnaire={toQuestionnaire([{ linkId: 'q', type: 'string', text: 'Question' }])}
            onSubmit={vi.fn()}
          />
        </MedplumProvider>
      );
    });
    await selectItem('Question');
    expect(await screen.findAllByText('This field is unavailable.')).not.toHaveLength(0);
    expect(
      screen.getByRole('button', { name: `Why is this unavailable? Code system ${ITEM_TYPE_SYSTEM} is unavailable` })
    ).toBeInTheDocument();
  });

  test('a LOINC question is added from the add item menu', async () => {
    // A Clinical Tables loinc_items search: [total, codes, extraFields, displayFields]
    const body = [1, ['8480-6'], { datatype: ['REAL'], answers: [null], units: [null] }, [['Systolic blood pressure']]];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => body }))
    );
    const onSubmit = vi.fn();
    await setup({ questionnaire: toQuestionnaire([]), onSubmit });

    await chooseMenuItem(screen.getAllByRole('button', { name: 'Add item' })[0], 'Add LOINC Question');
    const drawer = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.change(within(drawer).getByPlaceholderText('Search'), { target: { value: 'systolic' } });
    });
    await click(await within(drawer).findByRole('button', { name: 'Add' }));
    await save();
    vi.unstubAllGlobals();

    expect(saved(onSubmit).item).toMatchObject([
      { type: 'decimal', text: 'Systolic blood pressure', code: [{ system: 'http://loinc.org', code: '8480-6' }] },
    ]);
  });

  test('a reference profile is removed', async () => {
    const onSubmit = vi.fn();
    const profile = 'http://example.com/StructureDefinition/patient';
    await setup({
      questionnaire: toQuestionnaire([
        {
          linkId: 'ref',
          type: 'reference',
          text: 'Reference question',
          extension: [
            { url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceProfile', valueCanonical: profile },
          ],
        },
      ]),
      onSubmit,
    });
    await selectItem('Reference question');

    expect(screen.getByText(profile)).toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Remove profile' }));
    expect(screen.queryByText(profile)).not.toBeInTheDocument();
    await save();
    expect(saved(onSubmit).item?.[0].extension?.some((ext) => ext.url.endsWith('referenceProfile'))).toBe(false);
  });
});
