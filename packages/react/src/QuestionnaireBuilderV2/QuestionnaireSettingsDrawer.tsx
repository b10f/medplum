// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Drawer } from '@mantine/core';
import type { JSX } from 'react';
import { QuestionnaireSettings } from './QuestionnaireSettings';

export interface QuestionnaireSettingsDrawerProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  /** Saves the questionnaire, as the Save button above the item tree does. */
  readonly onSave: () => void;
}

/**
 * Settings of the questionnaire itself, rather than of one item. Like item changes, they apply once saved.
 * @param props - The QuestionnaireSettingsDrawer React props.
 * @returns The QuestionnaireSettingsDrawer React node.
 */
export function QuestionnaireSettingsDrawer(props: QuestionnaireSettingsDrawerProps): JSX.Element {
  const { opened, onClose, onSave } = props;
  return (
    <Drawer opened={opened} onClose={onClose} position="left" title="Questionnaire settings">
      {/* Remounted on every opening, so it starts from the current values. */}
      {opened && <QuestionnaireSettings onSave={onSave} />}
    </Drawer>
  );
}
