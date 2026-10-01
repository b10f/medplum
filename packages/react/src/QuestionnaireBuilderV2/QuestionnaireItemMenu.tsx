// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Menu } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconDots, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useQuestionnaireFormContext } from '../QuestionnaireFormV2/QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem } from '../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { getValueByPath, rebuildFormItems } from '../QuestionnaireFormV2/QuestionnaireFormV2.utils';

export interface QuestionnaireItemMenuProps {
  readonly item: ExtendedQuestionnaireItem;
  readonly items: ExtendedQuestionnaireItem[];
  readonly index: number;
}

/**
 * An item's actions: move it up or down among its siblings, or delete it.
 * @param props - The QuestionnaireItemMenu React props.
 * @returns The QuestionnaireItemMenu React node.
 */
export function QuestionnaireItemMenu(props: QuestionnaireItemMenuProps): JSX.Element {
  const { item, items, index } = props;
  const form = useQuestionnaireFormContext();
  const path = item.parent ? `${item.parent.path}.item` : 'item';

  // Paths change with the order, so they are rebuilt after every change.
  const moveTo = (newIndex: number): void => {
    const updatedItems = [...getValueByPath(form.getValues(), path)];
    [updatedItems[index], updatedItems[newIndex]] = [updatedItems[newIndex], updatedItems[index]];
    form.setFieldValue(path, updatedItems);
    form.setFieldValue('item', rebuildFormItems(form.getValues()));
  };

  const remove = (): void => {
    form.removeListItem(path, index);
    form.setFieldValue('item', rebuildFormItems(form.getValues()));
  };

  return (
    <Menu position="bottom-end" width={192}>
      <Menu.Target>
        <ActionIcon variant="subtle" size="sm" aria-label="Item actions">
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onMouseDown={(e) => e.stopPropagation()}>
        <Menu.Item leftSection={<IconArrowUp size={16} />} disabled={index === 0} onClick={() => moveTo(index - 1)}>
          Move Up
        </Menu.Item>
        <Menu.Item
          leftSection={<IconArrowDown size={16} />}
          disabled={index === items.length - 1}
          onClick={() => moveTo(index + 1)}
        >
          Move Down
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item leftSection={<IconTrash size={16} />} color="red" onClick={remove}>
          Delete
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
