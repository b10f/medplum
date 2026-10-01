// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Drawer } from '@mantine/core';
import type { QuestionnaireItem } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { LOINC_SEARCH_LABELS } from './QuestionnaireLoinc.utils';
import { QuestionnaireLoincSearch } from './QuestionnaireLoincSearch';

export interface QuestionnaireLoincSearchDrawerProps {
  readonly type: 'question' | 'panel';
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly onAdd: (item: QuestionnaireItem) => void;
}

/**
 * The LOINC question or panel search, in a drawer beside the builder.
 * @param props - The QuestionnaireLoincSearchDrawer React props.
 * @returns The QuestionnaireLoincSearchDrawer React node.
 */
export function QuestionnaireLoincSearchDrawer(props: QuestionnaireLoincSearchDrawerProps): JSX.Element {
  const { type, opened, onClose, onAdd } = props;
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={800}
      title={`Search LOINC ${LOINC_SEARCH_LABELS[type]}`}
    >
      <QuestionnaireLoincSearch type={type} onAddItem={onAdd} />
    </Drawer>
  );
}
