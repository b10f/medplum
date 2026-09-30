// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Menu } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconDots, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useQuestionnaireFormContext } from '../QuestionnaireFormV2/QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem } from './QuestionnaireBuilderV2.utils';
import { getValueByPath, rebuildFormItems } from './QuestionnaireBuilderV2.utils';

export interface QuestionnaireItemMenuProps {
  readonly item: ExtendedQuestionnaireItem;
  readonly items: ExtendedQuestionnaireItem[];
  readonly index: number;
  readonly onAddItem?: (item: ExtendedQuestionnaireItem) => void;
}

export function QuestionnaireItemMenu(props: QuestionnaireItemMenuProps): JSX.Element {
  const { item, items, index } = props;
  const form = useQuestionnaireFormContext();

  return (
    <Menu position="bottom-end" width={192}>
      <Menu.Target>
        <ActionIcon variant="subtle" size="sm" aria-label="Item actions">
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onMouseDown={(e) => e.stopPropagation()}>
        <Menu.Item
          leftSection={<IconArrowUp size={16} />}
          disabled={index === 0}
          onClick={() => {
            const path: string = item.parent ? `${item.parent.path}.item` : 'item';
            const itemsArray = getValueByPath(form.getValues(), path);
            const updatedItems = [...itemsArray];

            [updatedItems[index - 1], updatedItems[index]] = [updatedItems[index], updatedItems[index - 1]];

            form.setFieldValue(path, updatedItems);
            form.setFieldValue('item', rebuildFormItems(form.getValues()));
          }}
        >
          Move Up
        </Menu.Item>
        <Menu.Item
          leftSection={<IconArrowDown size={16} />}
          disabled={index === items.length - 1}
          onClick={() => {
            const path: string = item.parent ? `${item.parent.path}.item` : 'item';
            const itemsArray = getValueByPath(form.getValues(), path);
            const updatedItems = [...itemsArray];

            [updatedItems[index], updatedItems[index + 1]] = [updatedItems[index + 1], updatedItems[index]];

            form.setFieldValue(path, updatedItems);
            form.setFieldValue('item', rebuildFormItems(form.getValues()));
          }}
        >
          Move Down
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconTrash size={16} />}
          color="red"
          onClick={() => {
            const path: string = item.parent ? `${item.parent.path}.item` : 'item';

            form.removeListItem(path, index);
            form.setFieldValue('item', rebuildFormItems(form.getValues()));
          }}
        >
          Delete
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
