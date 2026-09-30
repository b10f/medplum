// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { HTTP_HL7_ORG } from '@medplum/core';
import type { Coding, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
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
}

/**
 * Loads the codes the settings panel offers: question types, item controls, condition operators and behaviors, usage
 * modes and display categories.
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
  });

  useEffect(() => {
    const loadCodes = async (): Promise<void> => {
      try {
        const [itemTypes, enableOperators, enableBehaviors, itemControlCodes, usageModes, displayCategories] =
          await Promise.all([
            loadQuestionTypes(medplum),
            expandValueSet(medplum, VALUE_SET_URLS.questionnaireEnableOperator),
            expandValueSet(medplum, VALUE_SET_URLS.questionnaireEnableBehavior),
            loadItemControlCodes(medplum),
            expandValueSet(medplum, VALUE_SET_URLS.questionnaireUsageMode),
            expandValueSet(medplum, VALUE_SET_URLS.questionnaireDisplayCategory),
          ]);
        setCodes({
          loading: false,
          itemTypes,
          enableOperators,
          enableBehaviors,
          itemControlCodes,
          usageModes,
          displayCategories,
        });
      } catch (error: any) {
        console.error('Error loading value sets:', error);
        setCodes((current) => ({ ...current, loading: false }));
      }
    };

    loadCodes().catch(console.error);
  }, [medplum]);

  return codes;
}

/**
 * Loads the item controls from FHIR's item control code system, by the kind of item they are for: its top-level
 * (abstract) codes `group`, `text` and `question`.
 * @param medplum - The Medplum client.
 * @returns The item controls, by kind.
 */
async function loadItemControlCodes(medplum: MedplumClient): Promise<ItemControlCodes> {
  const codeSystem = await medplum.searchOne('CodeSystem', { url: ITEM_CONTROL_SYSTEM });
  const childrenOf = (code: string): Coding[] =>
    (codeSystem?.concept?.find((concept) => concept.code === code)?.concept ?? []).map((concept) => ({
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
 * @returns The question types.
 */
async function loadQuestionTypes(medplum: MedplumClient): Promise<Coding[]> {
  const codeSystem = await medplum.searchOne('CodeSystem', { url: ITEM_TYPE_SYSTEM });
  const question = codeSystem?.concept?.find((concept) => concept.code === 'question');
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
