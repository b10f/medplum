// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LOINC } from '@medplum/core';
import type { Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen, within } from '../test-utils/render';
import type { LoincFormDefinition } from './QuestionnaireLoinc.utils';
import type { QuestionnaireLoincSearchProps } from './QuestionnaireLoincSearch';
import { QuestionnaireLoincSearch } from './QuestionnaireLoincSearch';
import { QuestionnaireLoincSearchDrawer } from './QuestionnaireLoincSearchDrawer';

const medplum = new MockClient();

// Shape of a Clinical Tables loinc_items search: [total, codes, extraFields, displayFields]
const questionSearch = [
  1,
  ['44250-9'],
  {
    datatype: ['CNE'],
    answers: [[{ AnswerStringID: 'LA6568-5', DisplayText: 'Not at all', SequenceNo: 1, Score: 0 }]],
    units: [null],
  },
  [['Little interest or pleasure in doing things']],
];

const panelSearch = [1, ['55757-9'], {}, [['Patient Health Questionnaire 2 item (PHQ-2)']]];

const panel: LoincFormDefinition = {
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
      answers: [{ code: 'LA6568-5', text: 'Not at all', score: 0 }],
    },
  ],
};

let fetchMock: Mock;

/**
 * Answers Clinical Tables requests: searches by their `type`, form definitions by `loinc_num`.
 * @param responses - The response bodies, or an HTTP status for a failed request.
 * @param responses.search - The search response.
 * @param responses.form - The form definition response.
 */
function mockClinicalTables(responses: { search?: unknown; form?: unknown }): void {
  fetchMock = vi.fn(async (url: string) => {
    const body = url.includes('loinc_form_definitions') ? responses.form : responses.search;
    if (typeof body === 'number') {
      return { ok: false, status: body, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => body };
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function setup(props: QuestionnaireLoincSearchProps): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <QuestionnaireLoincSearch {...props} />
      </MedplumProvider>
    );
  });
}

async function search(term: string): Promise<void> {
  await act(async () => {
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: term } });
  });
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

describe('QuestionnaireLoincSearch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('a question is found and added with its LOINC code and answers', async () => {
    mockClinicalTables({ search: questionSearch });
    const onAddItem = vi.fn();
    await setup({ type: 'question', onAddItem });
    expect(screen.getByText('Type a keyword in the search bar above to find questions.')).toBeInTheDocument();

    await search('interest');
    expect(await screen.findByText('Little interest or pleasure in doing things')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Add' }));

    const item: QuestionnaireItem = onAddItem.mock.calls[0][0];
    expect(item).toMatchObject({
      type: 'choice',
      text: 'Little interest or pleasure in doing things',
      code: [{ system: LOINC, code: '44250-9' }],
      answerOption: [{ valueCoding: { system: LOINC, code: 'LA6568-5', display: 'Not at all' } }],
    });
    expect(fetchMock.mock.calls[0][0]).toContain('terms=interest');
  });

  test('a panel is previewed, then added as a group', async () => {
    mockClinicalTables({ search: panelSearch, form: panel });
    const onAddItem = vi.fn();
    await setup({ type: 'panel', onAddItem });

    await search('PHQ');
    await click(await screen.findByRole('button', { name: 'Preview' }));
    const preview = await screen.findByRole('dialog');
    expect(await within(preview).findByText('Little interest or pleasure in doing things')).toBeInTheDocument();
    expect(within(preview).getByText('Copyright notice')).toBeInTheDocument();

    await click(within(preview).getByRole('button', { name: 'Add panel' }));
    const group: QuestionnaireItem = onAddItem.mock.calls[0][0];
    expect(group).toMatchObject({ type: 'group', text: panel.name, code: [{ system: LOINC, code: '55757-9' }] });
  });

  test('a panel is added straight from the results', async () => {
    mockClinicalTables({ search: panelSearch, form: panel });
    const onAddItem = vi.fn();
    await setup({ type: 'panel', onAddItem });

    await search('PHQ');
    await click(await screen.findByRole('button', { name: 'Add' }));
    expect(onAddItem.mock.calls[0][0]).toMatchObject({ type: 'group', text: panel.name });
  });

  test('a form becomes a new questionnaire', async () => {
    mockClinicalTables({ search: panelSearch, form: panel });
    const onSelectQuestionnaire = vi.fn();
    await setup({ type: 'questionnaire', onSelectQuestionnaire });
    expect(screen.getByText('Type a keyword in the search bar above to find questionnaires.')).toBeInTheDocument();

    await search('PHQ');
    await click(await screen.findByRole('button', { name: 'Create' }));
    const questionnaire: Questionnaire = onSelectQuestionnaire.mock.calls[0][0];
    expect(questionnaire).toMatchObject({ resourceType: 'Questionnaire', title: panel.name });
  });

  test('a form is created from its preview, or the preview is cancelled', async () => {
    mockClinicalTables({ search: panelSearch, form: panel });
    const onSelectQuestionnaire = vi.fn();
    await setup({ type: 'questionnaire', onSelectQuestionnaire });

    await search('PHQ');
    await click(await screen.findByRole('button', { name: 'Preview' }));
    await click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(onSelectQuestionnaire).not.toHaveBeenCalled();

    await click(screen.getByRole('button', { name: 'Preview' }));
    await click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Create questionnaire' }));
    expect(onSelectQuestionnaire).toHaveBeenCalledTimes(1);
  });

  test('no results, a failed search and a form that cannot be loaded', async () => {
    mockClinicalTables({ search: [0, [], {}, []] });
    await setup({ type: 'panel', onAddItem: vi.fn() });
    await search('nothing');
    expect(await screen.findByText('No results found for "nothing".')).toBeInTheDocument();

    mockClinicalTables({ search: 500 });
    await search('broken');
    expect(await screen.findByText('LOINC search failed (500)')).toBeInTheDocument();

    mockClinicalTables({ search: panelSearch, form: 404 });
    await search('PHQ');
    await click(await screen.findByRole('button', { name: 'Add' }));
    expect(await screen.findByText('LOINC panel 55757-9 could not be loaded (404)')).toBeInTheDocument();
  });

  test('the drawer is titled by what it searches', async () => {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <QuestionnaireLoincSearchDrawer type="panel" opened onClose={vi.fn()} onAdd={vi.fn()} />
        </MedplumProvider>
      );
    });
    expect(await screen.findByText('Search LOINC panels')).toBeInTheDocument();
  });
});
