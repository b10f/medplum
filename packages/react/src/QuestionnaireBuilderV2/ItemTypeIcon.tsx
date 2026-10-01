// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  IconFiles,
  IconFileText,
  IconFolders,
  IconHelp,
  IconLayoutBottombar,
  IconLayoutNavbar,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import type { ExtendedQuestionnaireItem } from '../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { isPageItem } from '../QuestionnaireFormV2/QuestionnaireFormV2.utils';

export interface ItemTypeIconProps {
  readonly item: ExtendedQuestionnaireItem;
  /** The icon size; 16 by default. */
  readonly size?: number;
}

/**
 * The item's icon, the same as in the add item menu.
 * @param props - The ItemTypeIcon React props.
 * @returns The ItemTypeIcon React node.
 */
export function ItemTypeIcon(props: ItemTypeIconProps): JSX.Element {
  const { item, size = 16 } = props;
  if (isPageItem(item)) {
    return <IconFiles size={size} />;
  }
  if (item.itemControl?.code === 'header' && item.type === 'group') {
    return <IconLayoutNavbar size={size} />;
  }
  if (item.itemControl?.code === 'footer' && item.type === 'group') {
    return <IconLayoutBottombar size={size} />;
  }
  if (item.type === 'group') {
    return <IconFolders size={size} />;
  }
  if (item.type === 'display') {
    return <IconFileText size={size} />;
  }
  return <IconHelp size={size} />;
}
