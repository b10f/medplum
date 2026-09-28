// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { generateId, HTTP_HL7_ORG, LOINC, UCUM } from '@medplum/core';
import type {
  Extension,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
  QuestionnaireItemEnableWhen,
} from '@medplum/fhirtypes';

// TODO: Prefer the official LOINC FHIR server (https://fhir.loinc.org), called through a Medplum Bot that holds the
// LOINC account credentials in Project Secrets, and fall back to NLM Clinical Tables. Clinical Tables is used for now
// because it needs no credentials and can be called directly from the browser.
const CLINICAL_TABLES_LOINC_SEARCH_URL = 'https://clinicaltables.nlm.nih.gov/api/loinc_items/v3/search';
const CLINICAL_TABLES_LOINC_FORMS_URL = 'https://clinicaltables.nlm.nih.gov/loinc_form_definitions';

const STRUCTURE_DEFINITION_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition`;
const ORDINAL_VALUE_URL = `${STRUCTURE_DEFINITION_URL}/ordinalValue`;
const QUESTIONNAIRE_UNIT_URL = `${STRUCTURE_DEFINITION_URL}/questionnaire-unit`;
const QUESTIONNAIRE_UNIT_OPTION_URL = `${STRUCTURE_DEFINITION_URL}/questionnaire-unitOption`;
const QUESTIONNAIRE_ITEM_CONTROL_URL = `${STRUCTURE_DEFINITION_URL}/questionnaire-itemControl`;
const QUESTIONNAIRE_ITEM_CONTROL_SYSTEM = `${HTTP_HL7_ORG}/fhir/questionnaire-item-control`;

export interface LoincAnswer {
  readonly AnswerStringID: string;
  readonly DisplayText: string;
  readonly SequenceNo?: number;
  readonly Score?: number | string | null;
}

export interface LoincUnit {
  readonly code?: string;
  readonly name?: string;
}

/** A LOINC search result: a question (with its answers, units and datatype) or a panel. */
export interface LoincQuestion {
  readonly code: string;
  readonly text: string;
  readonly datatype?: string;
  readonly answers?: LoincAnswer[];
  readonly units?: LoincUnit[];
}

/**
 * Searches LOINC questions (with their answers, units and datatype) in NLM Clinical Tables.
 * @param term - The search text.
 * @param signal - Optional signal to cancel the request.
 * @returns The matching LOINC questions.
 */
export async function searchLoincQuestions(term: string, signal?: AbortSignal): Promise<LoincQuestion[]> {
  const params = new URLSearchParams({
    type: 'question',
    ef: 'answers,units,datatype',
    terms: term,
    maxList: '500',
  });
  const response = await fetch(`${CLINICAL_TABLES_LOINC_SEARCH_URL}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`LOINC search failed (${response.status})`);
  }
  return parseLoincQuestionSearch(await response.json());
}

/**
 * Searches LOINC panels and forms in NLM Clinical Tables.
 * @param term - The search text.
 * @param signal - Optional signal to cancel the request.
 * @returns The matching LOINC panels (code and name).
 */
export async function searchLoincPanels(term: string, signal?: AbortSignal): Promise<LoincQuestion[]> {
  const params = new URLSearchParams({ type: 'form_and_section', available: 'true', terms: term, maxList: '500' });
  const response = await fetch(`${CLINICAL_TABLES_LOINC_SEARCH_URL}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`LOINC search failed (${response.status})`);
  }
  return parseLoincQuestionSearch(await response.json());
}

/** A LOINC panel or form definition in LForms format, as returned by Clinical Tables `loinc_form_definitions`. */
export interface LoincFormDefinition {
  readonly code: string;
  readonly name: string;
  readonly codeSystem?: string;
  readonly copyrightNotice?: string;
  readonly items?: LFormsItem[];
}

export interface LFormsItem {
  readonly linkId?: string;
  readonly question?: string;
  readonly questionCode?: string;
  readonly questionCodeSystem?: string;
  readonly dataType?: string | null;
  readonly answers?: LFormsAnswer[] | null;
  readonly units?: LoincUnit[] | null;
  readonly questionCardinality?: { readonly min?: string; readonly max?: string };
  readonly answerCardinality?: { readonly min?: string; readonly max?: string };
  readonly codingInstructions?: string;
  readonly skipLogic?: LFormsSkipLogic;
  readonly items?: LFormsItem[];
}

/** When an LForms item is shown or hidden, based on the answers to other items. */
export interface LFormsSkipLogic {
  readonly action?: 'show' | 'hide';
  readonly logic?: 'ANY' | 'ALL';
  readonly conditions?: LFormsSkipLogicCondition[];
}

export interface LFormsSkipLogicCondition {
  /** The LForms linkId, or the question code, of the item whose answer is checked. */
  readonly source?: string;
  readonly trigger?: LFormsSkipLogicTrigger;
}

export interface LFormsSkipLogicTrigger {
  readonly value?: any;
  readonly notEqual?: any;
  readonly exists?: boolean;
  readonly minInclusive?: number | string;
  readonly maxInclusive?: number | string;
  readonly minExclusive?: number | string;
  readonly maxExclusive?: number | string;
  /** Older LForms versions: the answer code, instead of `value`. */
  readonly code?: string;
}

export interface LFormsAnswer {
  readonly code?: string;
  readonly text?: string;
  readonly system?: string;
  readonly score?: number | string | null;
}

/**
 * Loads a LOINC panel or form definition (LForms format) from NLM Clinical Tables.
 * @param code - The LOINC code of the panel or form.
 * @param signal - Optional signal to cancel the request.
 * @returns The LOINC form definition.
 */
export async function fetchLoincFormDefinition(code: string, signal?: AbortSignal): Promise<LoincFormDefinition> {
  const params = new URLSearchParams({ loinc_num: code });
  const response = await fetch(`${CLINICAL_TABLES_LOINC_FORMS_URL}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`LOINC panel ${code} could not be loaded (${response.status})`);
  }
  return response.json();
}

/**
 * Converts a LOINC panel definition into a FHIR group item: the group carries the panel's LOINC code and its items
 * keep their LOINC question and answer codes.
 * @param definition - The LOINC form definition.
 * @returns The FHIR group item.
 */
export function toFhirItemFromLoincPanel(definition: LoincFormDefinition): QuestionnaireItem {
  return {
    linkId: generateId(),
    text: definition.name,
    type: 'group',
    code: [{ system: toFhirCodeSystem(definition.codeSystem), code: definition.code, display: definition.name }],
    item: toFhirItemsFromLForms(definition.items ?? []),
  };
}

/**
 * Converts a LOINC form definition into a new, editable Questionnaire. It is coded with the form's LOINC code
 * (`Questionnaire.code`), points back to the LOINC form through `derivedFrom`, and keeps the copyright notice. It does
 * not take LOINC's canonical `url`: the copy is ours to edit, so it must not claim to be the LOINC form itself.
 * @param definition - The LOINC form definition.
 * @returns The new Questionnaire.
 */
export function toFhirQuestionnaireFromLoincForm(definition: LoincFormDefinition): Questionnaire {
  return {
    resourceType: 'Questionnaire',
    status: 'draft',
    title: definition.name,
    code: [{ system: toFhirCodeSystem(definition.codeSystem), code: definition.code, display: definition.name }],
    derivedFrom: [`${LOINC}/q/${definition.code}`],
    ...(definition.copyrightNotice && { copyright: definition.copyrightNotice }),
    item: toFhirItemsFromLForms(definition.items ?? []),
  };
}

/**
 * Converts LForms items into FHIR QuestionnaireItems. Every item gets a new linkId, so the same panel can be added
 * more than once without linkId collisions. Skip logic becomes enableWhen conditions on the new linkIds.
 * @param items - The LForms items.
 * @returns The FHIR QuestionnaireItems.
 */
export function toFhirItemsFromLForms(items: LFormsItem[]): QuestionnaireItem[] {
  const converted: ConvertedLFormsItem[] = [];
  const fhirItems = convertLFormsItems(items, converted);
  for (const { lformsItem, fhirItem } of converted) {
    if (lformsItem.skipLogic) {
      Object.assign(fhirItem, toFhirEnableWhenFromSkipLogic(lformsItem.skipLogic, converted));
    }
  }
  return fhirItems;
}

interface ConvertedLFormsItem {
  readonly lformsItem: LFormsItem;
  readonly fhirItem: QuestionnaireItem;
}

function convertLFormsItems(items: LFormsItem[], converted: ConvertedLFormsItem[]): QuestionnaireItem[] {
  return items.map((lformsItem) => {
    const type = toFhirItemType(lformsItem.dataType);
    const linkId = generateId();
    const answerOption = toFhirAnswerOptionsFromLForms(lformsItem.answers);
    const unitExtensions = ['quantity', 'integer', 'decimal'].includes(type)
      ? toFhirUnitExtensions(lformsItem.units ?? undefined, type)
      : [];
    const childItems = [
      ...toFhirHelpItems(linkId, lformsItem.codingInstructions),
      ...convertLFormsItems(lformsItem.items ?? [], converted),
    ];

    const fhirItem: QuestionnaireItem = {
      linkId,
      text: lformsItem.question,
      type,
      ...(lformsItem.questionCode && {
        code: [
          {
            system: toFhirCodeSystem(lformsItem.questionCodeSystem),
            code: lformsItem.questionCode,
            display: lformsItem.question,
          },
        ],
      }),
      ...(lformsItem.questionCardinality?.max === '*' && { repeats: true }),
      ...(lformsItem.answerCardinality?.min === '1' && { required: true }),
      ...(answerOption.length > 0 && { answerOption }),
      ...(unitExtensions.length > 0 && { extension: unitExtensions }),
      ...(childItems.length > 0 && { item: childItems }),
    };
    converted.push({ lformsItem, fhirItem });
    return fhirItem;
  });
}

const NEGATED_OPERATORS: Record<string, QuestionnaireItemEnableWhen['operator']> = {
  '=': '!=',
  '!=': '=',
  '>': '<=',
  '>=': '<',
  '<': '>=',
  '<=': '>',
};

/**
 * Converts LForms skip logic into enableWhen conditions. `hide` logic is negated, since enableWhen says when an item
 * is shown. Logic that enableWhen cannot express, or that refers to an unknown item, is dropped as a whole: the item
 * is then always shown, rather than hidden when it should not be.
 * @param skipLogic - The LForms skip logic.
 * @param converted - All converted items of the form, to find the conditions' source items.
 * @returns The enableWhen conditions and behavior, or nothing.
 */
function toFhirEnableWhenFromSkipLogic(
  skipLogic: LFormsSkipLogic,
  converted: ConvertedLFormsItem[]
): Pick<QuestionnaireItem, 'enableWhen' | 'enableBehavior'> {
  const conditions = skipLogic.conditions ?? [];
  // A single condition may need several enableWhen (e.g. a range), which must all hold for it.
  const all = conditions.length === 1 || skipLogic.logic === 'ALL';
  const hide = skipLogic.action === 'hide';
  const enableWhen: QuestionnaireItemEnableWhen[] = [];

  for (const condition of conditions) {
    const source = findLFormsSource(converted, condition.source);
    const parts = source && toFhirEnableWhenFromTrigger(source, condition.trigger);
    // Several parts of one condition hold together; ANY logic between conditions cannot express that.
    if (!parts?.length || (parts.length > 1 && !all)) {
      return {};
    }
    enableWhen.push(...(hide ? parts.map(negateEnableWhen) : parts));
  }

  if (enableWhen.length === 0) {
    return {};
  }
  // Not (A and B) is (not A or not B), and the other way round.
  const enableBehavior = all === hide ? 'any' : 'all';
  return { enableWhen, ...(enableWhen.length > 1 && { enableBehavior }) };
}

function findLFormsSource(converted: ConvertedLFormsItem[], source: string | undefined): QuestionnaireItem | undefined {
  if (!source) {
    return undefined;
  }
  return (
    converted.find(({ lformsItem }) => lformsItem.linkId === source)?.fhirItem ??
    converted.find(({ lformsItem }) => lformsItem.questionCode === source)?.fhirItem
  );
}

function toFhirEnableWhenFromTrigger(
  source: QuestionnaireItem,
  trigger: LFormsSkipLogicTrigger | undefined
): QuestionnaireItemEnableWhen[] | undefined {
  if (!trigger) {
    return undefined;
  }
  const question = source.linkId;

  if (trigger.exists !== undefined) {
    return [{ question, operator: 'exists', answerBoolean: trigger.exists }];
  }

  const value = trigger.value ?? (trigger.code ? { code: trigger.code } : undefined);
  const equality: [QuestionnaireItemEnableWhen['operator'], any][] = [];
  if (value !== undefined) {
    equality.push(['=', value]);
  }
  if (trigger.notEqual !== undefined) {
    equality.push(['!=', trigger.notEqual]);
  }
  const range: [QuestionnaireItemEnableWhen['operator'], any][] = (
    [
      ['>=', trigger.minInclusive],
      ['>', trigger.minExclusive],
      ['<=', trigger.maxInclusive],
      ['<', trigger.maxExclusive],
    ] as [QuestionnaireItemEnableWhen['operator'], any][]
  ).filter(([, bound]) => bound !== undefined && bound !== null && bound !== '');

  const parts = [...equality, ...range].map(([operator, answer]) => {
    const answerValue = toFhirEnableWhenAnswer(source, answer);
    return answerValue && { question, operator, ...answerValue };
  });
  if (parts.length === 0 || parts.some((part) => !part)) {
    return undefined;
  }
  return parts as QuestionnaireItemEnableWhen[];
}

/**
 * Types a skip logic trigger value as an enableWhen answer, by the type of the item it is compared with.
 * @param source - The FHIR item whose answer is compared.
 * @param value - The trigger value.
 * @returns The enableWhen answer[x], or undefined when the value does not fit the item.
 */
function toFhirEnableWhenAnswer(
  source: QuestionnaireItem,
  value: any
): Partial<QuestionnaireItemEnableWhen> | undefined {
  switch (source.type) {
    case 'choice':
    case 'open-choice': {
      const code = typeof value === 'object' ? value?.code : value;
      if (!code) {
        return undefined;
      }
      // Answers compare by code; the option carries its system and display.
      const option = source.answerOption?.find((answerOption) => answerOption.valueCoding?.code === code);
      return {
        answerCoding: option?.valueCoding ?? { system: toFhirCodeSystem(value?.system), code, display: value?.text },
      };
    }
    case 'boolean':
      return typeof value === 'boolean' ? { answerBoolean: value } : undefined;
    case 'integer':
      return Number.isInteger(Number(value)) ? { answerInteger: Number(value) } : undefined;
    case 'decimal':
      return Number.isFinite(Number(value)) ? { answerDecimal: Number(value) } : undefined;
    case 'quantity':
      return Number.isFinite(Number(value)) ? { answerQuantity: { value: Number(value) } } : undefined;
    case 'date':
      return typeof value === 'string' ? { answerDate: value } : undefined;
    case 'dateTime':
      return typeof value === 'string' ? { answerDateTime: value } : undefined;
    case 'time':
      return typeof value === 'string' ? { answerTime: value } : undefined;
    case 'string':
    case 'text':
    case 'url':
      return typeof value === 'string' ? { answerString: value } : undefined;
    default:
      return undefined;
  }
}

function negateEnableWhen(condition: QuestionnaireItemEnableWhen): QuestionnaireItemEnableWhen {
  if (condition.operator === 'exists') {
    return { ...condition, answerBoolean: !condition.answerBoolean };
  }
  return { ...condition, operator: NEGATED_OPERATORS[condition.operator] };
}

/**
 * Parses a Clinical Tables `loinc_items` search response: `[total, codes, extraFields, displayFields]`.
 * @param data - The response body.
 * @returns The LOINC questions.
 */
export function parseLoincQuestionSearch(data: any): LoincQuestion[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const codes: string[] = data[1] ?? [];
  const extraFields: Record<string, any[]> = data[2] ?? {};
  const descriptions: string[][] = data[3] ?? [];

  return codes.map((code, index) => ({
    code,
    text: descriptions[index]?.[0] ?? '',
    datatype: extraFields.datatype?.[index] ?? undefined,
    answers: extraFields.answers?.[index] ?? undefined,
    units: extraFields.units?.[index] ?? undefined,
  }));
}

/**
 * Converts a LOINC question into a FHIR QuestionnaireItem: the question and its answers keep their LOINC codes.
 * @param question - The LOINC question.
 * @returns The FHIR QuestionnaireItem.
 */
export function toFhirItemFromLoincQuestion(question: LoincQuestion): QuestionnaireItem {
  const type = toFhirItemType(question.datatype);
  const answerOption = toFhirAnswerOptions(question.answers);
  const unitExtensions = toFhirUnitExtensions(question.units, type);

  return {
    linkId: generateId(),
    code: [{ system: LOINC, code: question.code, display: question.text }],
    text: question.text,
    type,
    ...(answerOption.length > 0 && { answerOption }),
    ...(unitExtensions.length > 0 && { extension: unitExtensions }),
  };
}

/** A distinct LOINC answer list, found through the questions that use it. */
export interface LoincAnswerList {
  /** The list's answer codes in order, which identify it among the search results. */
  readonly key: string;
  readonly answers: LoincAnswer[];
  /** The first question in the results that uses this list. */
  readonly exampleQuestion: { readonly code: string; readonly text: string };
  readonly questionCount: number;
}

/**
 * Searches LOINC answer lists by the wording of the questions that use them.
 * TODO: Search answer lists (LL codes) directly on the official LOINC FHIR server, which Clinical Tables does not offer.
 * @param term - The search text.
 * @param signal - Optional signal to cancel the request.
 * @returns The distinct answer lists of the matching questions.
 */
export async function searchLoincAnswerLists(term: string, signal?: AbortSignal): Promise<LoincAnswerList[]> {
  return groupLoincAnswerLists(await searchLoincQuestions(term, signal));
}

/**
 * Groups questions by their answer list, so each distinct list (same answer codes in the same order) appears once.
 * @param questions - The LOINC questions.
 * @returns The distinct answer lists, in the order they first appear.
 */
export function groupLoincAnswerLists(questions: LoincQuestion[]): LoincAnswerList[] {
  const lists = new Map<string, LoincAnswerList>();

  for (const question of questions) {
    if (!question.answers?.length) {
      continue;
    }
    const answers = sortLoincAnswers(question.answers);
    const key = answers.map((answer) => answer.AnswerStringID).join('|');
    const existing = lists.get(key);
    lists.set(
      key,
      existing
        ? { ...existing, questionCount: existing.questionCount + 1 }
        : { key, answers, exampleQuestion: { code: question.code, text: question.text }, questionCount: 1 }
    );
  }

  return [...lists.values()];
}

/**
 * Converts a LOINC answer list into FHIR answer options with the LOINC answer codes and scores.
 * @param list - The LOINC answer list.
 * @returns The FHIR answer options.
 */
export function toFhirAnswerOptionsFromLoincAnswerList(list: LoincAnswerList): QuestionnaireItemAnswerOption[] {
  return toFhirAnswerOptions(list.answers);
}

/**
 * Maps a LOINC (LForms) datatype to a FHIR QuestionnaireItem type.
 * @param datatype - The LOINC datatype, e.g. `CNE`, `REAL`, `ST`.
 * @returns The FHIR item type.
 */
export function toFhirItemType(datatype: string | null | undefined): QuestionnaireItem['type'] {
  switch (datatype) {
    case 'INT':
      return 'integer';
    case 'REAL':
      return 'decimal';
    case 'DT':
    case 'DAY':
    case 'MONTH':
    case 'YEAR':
      return 'date';
    case 'DTM':
      return 'dateTime';
    case 'ST':
    case 'EMAIL':
    case 'PHONE':
      return 'string';
    case 'TITLE':
      return 'display';
    case 'TM':
      return 'time';
    case 'SECTION':
    case null:
      return 'group';
    case 'URL':
      return 'url';
    case 'QTY':
      return 'quantity';
    case 'CNE':
      return 'choice';
    case 'CWE':
      return 'open-choice';
    default:
      return 'string';
  }
}

function toFhirAnswerOptionsFromLForms(answers: LFormsAnswer[] | null | undefined): QuestionnaireItemAnswerOption[] {
  return (answers ?? []).map((answer) => ({
    valueCoding: { system: toFhirCodeSystem(answer.system), code: answer.code, display: answer.text },
    ...(answer.score !== undefined &&
      answer.score !== null &&
      answer.score !== '' && { extension: [{ url: ORDINAL_VALUE_URL, valueDecimal: +answer.score }] }),
  }));
}

/**
 * LOINC coding instructions are guidance for the respondent: they become the item's help text (a `help` display
 * child, as the builder stores help), with any HTML markup removed.
 * @param linkId - The linkId of the item the help belongs to.
 * @param codingInstructions - The LOINC coding instructions.
 * @returns The help item, or none.
 */
function toFhirHelpItems(linkId: string, codingInstructions: string | undefined): QuestionnaireItem[] {
  const text = codingInstructions?.replace(/<[^>]*>/g, '').trim();
  if (!text) {
    return [];
  }
  return [
    {
      linkId: `${linkId}_help`,
      text,
      type: 'display',
      extension: [
        {
          url: QUESTIONNAIRE_ITEM_CONTROL_URL,
          valueCodeableConcept: {
            coding: [{ system: QUESTIONNAIRE_ITEM_CONTROL_SYSTEM, code: 'help', display: 'Help-Button' }],
            text: 'Help-Button',
          },
        },
      ],
    },
  ];
}

/**
 * LForms names the LOINC code system `LOINC` (or leaves it out); FHIR codings use the system URL.
 * @param system - The LForms code system.
 * @returns The FHIR code system URL.
 */
function toFhirCodeSystem(system: string | undefined): string {
  return !system || system.toUpperCase() === 'LOINC' ? LOINC : system;
}

function sortLoincAnswers(answers: LoincAnswer[]): LoincAnswer[] {
  return [...answers].sort((a, b) => (a.SequenceNo ?? 0) - (b.SequenceNo ?? 0));
}

function toFhirAnswerOptions(answers: LoincAnswer[] | undefined): QuestionnaireItemAnswerOption[] {
  return sortLoincAnswers(answers ?? []).map((answer) => ({
    valueCoding: { system: LOINC, code: answer.AnswerStringID, display: answer.DisplayText },
    ...(answer.Score !== undefined &&
      answer.Score !== null &&
      answer.Score !== '' && { extension: [{ url: ORDINAL_VALUE_URL, valueDecimal: +answer.Score }] }),
  }));
}

/**
 * Converts LOINC units: a quantity offers every unit as a unit option; an integer or decimal takes the first unit.
 * @param units - The LOINC units.
 * @param type - The FHIR item type.
 * @returns The unit extensions.
 */
function toFhirUnitExtensions(units: LoincUnit[] | undefined, type: QuestionnaireItem['type']): Extension[] {
  const codings = (units ?? []).map((unit) => ({
    system: UCUM,
    code: unit.code || unit.name,
    display: unit.name || unit.code,
  }));

  if (type === 'quantity') {
    return codings.map((valueCoding) => ({ url: QUESTIONNAIRE_UNIT_OPTION_URL, valueCoding }));
  }
  if ((type === 'integer' || type === 'decimal') && codings.length > 0) {
    return [{ url: QUESTIONNAIRE_UNIT_URL, valueCoding: codings[0] }];
  }
  return [];
}
