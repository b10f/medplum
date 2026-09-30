// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { HTTP_HL7_ORG } from '@medplum/core';
import type { Coding, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { isValueSetUnavailableError, useMedplum } from '@medplum/react-hooks';
import { useEffect, useState } from 'react';
import type { ItemControlCodes } from '../QuestionnaireBuilderV2.utils';

/** FHIR's item control code system: `group`, `text` and `question` at the top, their controls under them. */
const ITEM_CONTROL_SYSTEM = `${HTTP_HL7_ORG}/fhir/questionnaire-item-control`;

/** FHIR's item type code system: `group`, `display` and `question` at the top, the question types under `question`. */
const ITEM_TYPE_SYSTEM = `${HTTP_HL7_ORG}/fhir/item-type`;

const VALUE_SET_URLS = {
  questionnaireEnableOperator: `${HTTP_HL7_ORG}/fhir/ValueSet/questionnaire-enable-operator`,
  questionnaireEnableBehavior: `${HTTP_HL7_ORG}/fhir/ValueSet/questionnaire-enable-behavior`,
  questionnaireUsageMode: `${HTTP_HL7_ORG}/fhir/ValueSet/questionnaire-usage-mode`,
  questionnaireDisplayCategory: `${HTTP_HL7_ORG}/fhir/ValueSet/questionnaire-display-category`,
} as const;

/** The code lists the settings panel offers. */
export type ItemSettingsCodeList =
  'itemTypes' | 'enableOperators' | 'enableBehaviors' | 'itemControlCodes' | 'usageModes' | 'displayCategories';

/** The codes the settings panel offers, loaded from the server. */
export interface ItemSettingsCodes {
  /** True until the codes are loaded. */
  readonly loading: boolean;
  readonly itemTypes: Coding[];
  readonly enableOperators: Coding[];
  readonly enableBehaviors: Coding[];
  readonly itemControlCodes: ItemControlCodes | undefined;
  readonly usageModes: Coding[];
  readonly displayCategories: Coding[];
  /** Why a list could not be loaded, by list: its value set or code system is not on the server. */
  readonly unavailable: Partial<Record<ItemSettingsCodeList, string>>;
}

/**
 * Loads the codes the settings panel offers: question types, item controls, condition operators and behaviors, usage
 * modes and display categories. They are loaded once, for every item the panel shows. A list whose value set or code
 * system is not on the server is marked unavailable; a transient failure leaves the list empty, as Medplum's
 * QuestionnaireForm does.
 * @returns The codes, and whether they are still loading.
 */
export function useItemSettingsCodes(): ItemSettingsCodes {
  const medplum = useMedplum();
  const [codes, setCodes] = useState<ItemSettingsCodes>({
    loading: true,
    itemTypes: [],
    enableOperators: [],
    enableBehaviors: [],
    itemControlCodes: undefined,
    usageModes: [],
    displayCategories: [],
    unavailable: {},
  });

  useEffect(() => {
    let cancelled = false;

    const loadCodes = async (): Promise<void> => {
      const [itemTypes, enableOperators, enableBehaviors, itemControlCodes, usageModes, displayCategories] =
        await Promise.all([
          loadCodeList(() => loadQuestionTypes(medplum), `Code system ${ITEM_TYPE_SYSTEM} is unavailable`),
          loadValueSet(medplum, VALUE_SET_URLS.questionnaireEnableOperator),
          loadValueSet(medplum, VALUE_SET_URLS.questionnaireEnableBehavior),
          loadCodeList(() => loadItemControlCodes(medplum), `Code system ${ITEM_CONTROL_SYSTEM} is unavailable`),
          loadValueSet(medplum, VALUE_SET_URLS.questionnaireUsageMode),
          loadValueSet(medplum, VALUE_SET_URLS.questionnaireDisplayCategory),
        ]);
      if (cancelled) {
        return;
      }

      const unavailable: Partial<Record<ItemSettingsCodeList, string>> = {};
      const lists = { itemTypes, enableOperators, enableBehaviors, itemControlCodes, usageModes, displayCategories };
      for (const [name, list] of Object.entries(lists)) {
        if (list.unavailable) {
          unavailable[name as ItemSettingsCodeList] = list.unavailable;
        }
      }

      setCodes({
        loading: false,
        itemTypes: itemTypes.value ?? [],
        enableOperators: enableOperators.value ?? [],
        enableBehaviors: enableBehaviors.value ?? [],
        itemControlCodes: itemControlCodes.value,
        usageModes: usageModes.value ?? [],
        displayCategories: displayCategories.value ?? [],
        unavailable,
      });
    };

    loadCodes().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [medplum]);

  return codes;
}

interface LoadedCodeList<T> {
  readonly value?: T;
  /** Why the list is unavailable. */
  readonly unavailable?: string;
}

/**
 * Loads one code list. It is unavailable when its source is not on the server: a code system that is not found, or a
 * value set whose expansion fails with 400 or 404. Other failures are logged and leave the list empty.
 * @param load - Loads the list; resolves to undefined when its code system is not found.
 * @param unavailableMessage - Why the list is unavailable, when it is.
 * @returns The list, or why it is unavailable.
 */
async function loadCodeList<T>(
  load: () => Promise<T | undefined>,
  unavailableMessage: string
): Promise<LoadedCodeList<T>> {
  try {
    const value = await load();
    return value === undefined ? { unavailable: unavailableMessage } : { value };
  } catch (err) {
    if (isValueSetUnavailableError(err)) {
      return { unavailable: unavailableMessage };
    }
    console.error('Error loading codes:', err);
    return {};
  }
}

function loadValueSet(medplum: MedplumClient, url: string): Promise<LoadedCodeList<Coding[]>> {
  return loadCodeList(() => expandValueSet(medplum, url), `Value set ${url} is unavailable`);
}

/**
 * Loads the item controls from FHIR's item control code system, by the kind of item they are for: its top-level
 * (abstract) codes `group`, `text` and `question`.
 * @param medplum - The Medplum client.
 * @returns The item controls, by kind, or undefined when the code system is not found.
 */
async function loadItemControlCodes(medplum: MedplumClient): Promise<ItemControlCodes | undefined> {
  const codeSystem = await medplum.searchOne('CodeSystem', { url: ITEM_CONTROL_SYSTEM });
  if (!codeSystem) {
    return undefined;
  }
  const childrenOf = (code: string): Coding[] =>
    (codeSystem.concept?.find((concept) => concept.code === code)?.concept ?? []).map((concept) => ({
      system: ITEM_CONTROL_SYSTEM,
      code: concept.code,
      display: concept.display,
    }));
  return { group: childrenOf('group'), text: childrenOf('text'), question: childrenOf('question') };
}

/**
 * Loads the question types: the codes under `question` in FHIR's item type code system. Its hierarchy is not declared
 * as is-a, so a value set expansion is flat (and cannot filter by it); the code system's own nesting is read instead.
 * @param medplum - The Medplum client.
 * @returns The question types, or undefined when the code system is not found.
 */
async function loadQuestionTypes(medplum: MedplumClient): Promise<Coding[] | undefined> {
  const codeSystem = await medplum.searchOne('CodeSystem', { url: ITEM_TYPE_SYSTEM });
  if (!codeSystem) {
    return undefined;
  }
  const question = codeSystem.concept?.find((concept) => concept.code === 'question');
  return (question?.concept ?? []).map((concept) => ({
    system: ITEM_TYPE_SYSTEM,
    code: concept.code,
    display: concept.display,
  }));
}

async function expandValueSet(medplum: MedplumClient, url: string): Promise<Coding[]> {
  const valueSet = await medplum.valueSetExpand({ url, count: 1000 });
  return flattenExpansion(valueSet.expansion?.contains ?? []);
}

function flattenExpansion(contains: ValueSetExpansionContains[]): Coding[] {
  return contains.flatMap((item) => {
    if (item.abstract) {
      return flattenExpansion(item.contains ?? []);
    }
    return [{ code: item.code, display: item.display, system: item.system }];
  });
}
