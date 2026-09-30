// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Stack } from '@mantine/core';
import type { JSX } from 'react';
import type { ExtendedQuestionnaireItem } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { QuestionnaireItemBehaviorSection } from './QuestionnaireItemBehaviorSection';
import { QuestionnaireItemConditionsSection } from './QuestionnaireItemConditionsSection';
import { QuestionnaireItemContentSection } from './QuestionnaireItemContentSection';
import { QuestionnaireItemGuidanceSection } from './QuestionnaireItemGuidanceSection';
import { useItemSettingsCodes } from './useItemSettingsCodes';

export interface QuestionnaireItemSettingsProps {
  readonly selectedItem: ExtendedQuestionnaireItem;
  readonly disabled?: boolean;
}

/**
 * The settings of the selected item, in sections: the item itself, its settings, guidance for the respondent, and when
 * it is shown.
 * @param props - The QuestionnaireItemSettings React props.
 * @returns The QuestionnaireItemSettings React node.
 */
export function QuestionnaireItemSettings(props: QuestionnaireItemSettingsProps): JSX.Element {
  const { selectedItem, disabled = false } = props;
  const codes = useItemSettingsCodes();
  const sectionProps = { selectedItem, disabled, codes };

  return (
    <Box p={8}>
      <Stack gap="md">
        <QuestionnaireItemContentSection {...sectionProps} />
        <QuestionnaireItemBehaviorSection {...sectionProps} />
        <QuestionnaireItemGuidanceSection {...sectionProps} />
        <QuestionnaireItemConditionsSection {...sectionProps} />
      </Stack>
    </Box>
  );
}
