// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { RenderTreeNodePayload, TreeNodeData, UseTreeReturnType } from '@mantine/core';
import { Group, Tree, useTree } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconFile, IconFolder } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX, MouseEvent } from 'react';
import { memo, useCallback, useMemo } from 'react';
import type { ExtendedQuestionnaireItem } from './QuestionnaireBuilderV2.utils';
import { QuestionnaireGroupMenu } from './QuestionnaireGroupMenu';
import { QuestionnaireItemMenu } from './QuestionnaireItemMenu';
import classes from './QuestionnaireItemTree.module.css';

export interface QuestionnaireItemTreeProps {
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly items: ExtendedQuestionnaireItem[];
  readonly onSelectItem?: (item: ExtendedQuestionnaireItem | undefined) => void;
}

export function QuestionnaireItemTree(props: QuestionnaireItemTreeProps): JSX.Element | null {
  const { selectedItem, items, onSelectItem } = props;
  const tree = useTree();

  const renderTreeNode = useCallback(
    (payload: RenderTreeNodePayload) => (
      <TreeNode {...payload} treeController={tree} selectedItem={selectedItem} onSelectItem={onSelectItem} />
    ),
    [tree, selectedItem, onSelectItem]
  );

  const treeData = useMemo(() => convertToTreeData(items), [items]);

  if (items.length === 0) {
    return null;
  }

  return <Tree data={treeData} tree={tree} renderNode={renderTreeNode} expandOnClick={false} levelOffset={24} />;
}

function convertToTreeData(items: ExtendedQuestionnaireItem[]): TreeNodeData[] {
  return items.map((item, index) => {
    const title = [item.prefix, item.text].filter(Boolean).join(' ');
    const isGroup = item.type === 'group';

    return {
      value: item.linkId,
      label: title,
      children: isGroup && item.item && item.item.length > 0 ? convertToTreeData(item.item) : undefined,
      nodeProps: {
        item: item,
        index: index,
        siblings: items,
      },
    };
  });
}

interface TreeNodeProps extends RenderTreeNodePayload {
  readonly treeController: UseTreeReturnType;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly onSelectItem?: (item: ExtendedQuestionnaireItem | undefined) => void;
}

const TreeNode = memo(function TreeNode(props: TreeNodeProps): JSX.Element {
  const { node, expanded, treeController, selectedItem, onSelectItem, elementProps } = props;
  const item = node.nodeProps?.item as ExtendedQuestionnaireItem;
  const isGroup = item.type === 'group';
  const isSelected = selectedItem?.linkId === item.linkId;

  const handleClick = (e: MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    elementProps.onClick?.(e);
    onSelectItem?.(item);
  };

  const handleChevronClick = (e: MouseEvent): void => {
    e.stopPropagation();
    treeController.toggleExpanded(node.value);
  };

  return (
    <Group
      gap="xs"
      {...elementProps}
      onClick={handleClick}
      className={cx(elementProps.className, classes.node, isSelected && classes.selected)}
    >
      {isGroup && (
        <span onClick={handleChevronClick} className={classes.chevron}>
          {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        </span>
      )}
      {isGroup ? <IconFolder size={16} /> : <IconFile size={16} />}
      <span className={classes.label}>{node.label}</span>
      <Group gap={4} onClick={(e) => e.stopPropagation()}>
        {isGroup && (
          <QuestionnaireGroupMenu
            item={item}
            variant="action"
            onAddItem={(newItem) => {
              onSelectItem?.(newItem);
              if (newItem?.type === 'group') {
                treeController.expand(newItem.linkId);
              }
              treeController.expand(node.value);
            }}
          />
        )}
        <QuestionnaireItemMenu item={item} items={node.nodeProps?.siblings} index={node.nodeProps?.index} />
      </Group>
    </Group>
  );
});
