// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { UseTreeReturnType } from '@mantine/core';
import { Group, Portal, Tooltip, useTree } from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconCornerDownRight,
  IconEyeOff,
  IconFiles,
  IconFileText,
  IconFolders,
  IconGripVertical,
  IconHelp,
  IconLayoutBottombar,
  IconLayoutNavbar,
} from '@tabler/icons-react';
import cx from 'clsx';
import type { CSSProperties, JSX, MouseEvent } from 'react';
import { useMemo, useState } from 'react';
import type { ExtendedQuestionnaireItem, FlattenedFormItem } from './QuestionnaireBuilderV2.utils';
import {
  findFormItemByLinkId,
  flattenFormItems,
  getFormItemDropTarget,
  getPageItems,
  hasFollowUpItems,
  isHeaderOrFooterItem,
  isPageItem,
  isQuestionItem,
  moveFormItem,
} from './QuestionnaireBuilderV2.utils';
import { useQuestionnaireFormContext } from './QuestionnaireFormContext';
import { QuestionnaireGroupMenu } from './QuestionnaireGroupMenu';
import { QuestionnaireItemMenu } from './QuestionnaireItemMenu';
import classes from './QuestionnaireItemTree.module.css';

const INDENT_WIDTH = 24;

interface DragState {
  readonly activeLinkId: string;
  readonly overLinkId: string;
  readonly offsetX: number;
}

export interface QuestionnaireItemTreeProps {
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly items: ExtendedQuestionnaireItem[];
  readonly onSelectItem?: (item: ExtendedQuestionnaireItem | undefined) => void;
}

/**
 * The questionnaire's item tree. Items are dragged by their handle to any position in the tree: the row they are
 * dragged over sets the position, dragging left or right sets the depth (e.g. into or out of a group).
 * @param props - The QuestionnaireItemTree React props.
 * @returns The QuestionnaireItemTree React node.
 */
export function QuestionnaireItemTree(props: QuestionnaireItemTreeProps): JSX.Element | null {
  const { selectedItem, items, onSelectItem } = props;
  const form = useQuestionnaireFormContext();
  const tree = useTree();
  const [drag, setDrag] = useState<DragState>();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // While a group is dragged, its items are hidden: they move with it and cannot be its drop target.
  const rows = useMemo(
    () => flattenFormItems(items, tree.expandedState, drag?.activeLinkId),
    [items, tree.expandedState, drag?.activeLinkId]
  );
  const dropTarget =
    drag && getFormItemDropTarget(rows, drag.activeLinkId, drag.overLinkId, drag.offsetX, INDENT_WIDTH);
  const activeItem = drag && findFormItemByLinkId(items, drag.activeLinkId);
  const hasPages = !!getPageItems(items);

  const handleDragStart = ({ active }: DragStartEvent): void => {
    setDrag({ activeLinkId: String(active.id), overLinkId: String(active.id), offsetX: 0 });
  };

  const handleDragMove = ({ delta }: DragMoveEvent): void => {
    setDrag((current) => current && { ...current, offsetX: delta.x });
  };

  const handleDragOver = ({ over }: DragOverEvent): void => {
    if (over) {
      setDrag((current) => current && { ...current, overLinkId: String(over.id) });
    }
  };

  const handleDragEnd = ({ active, over }: DragEndEvent): void => {
    setDrag(undefined);
    if (!over || !dropTarget) {
      return;
    }
    form.setFieldValue('item', moveFormItem(form.getValues(), String(active.id), dropTarget));
    if (dropTarget.parentLinkId) {
      tree.expand(dropTarget.parentLinkId);
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDrag(undefined)}
    >
      <SortableContext items={rows.map((row) => row.item.linkId)} strategy={verticalListSortingStrategy}>
        <div role="tree">
          {rows.map((row) => (
            <SortableTreeNode
              key={row.item.linkId}
              row={row}
              depth={row.item.linkId === drag?.activeLinkId && dropTarget ? dropTarget.depth : row.depth}
              treeController={tree}
              selected={selectedItem?.linkId === row.item.linkId}
              notShown={hasPages && row.depth === 0 && !isPageItem(row.item) && !isHeaderOrFooterItem(row.item)}
              onSelectItem={onSelectItem}
            />
          ))}
        </div>
      </SortableContext>
      <Portal>
        <DragOverlay>{activeItem && <TreeNodeContent item={activeItem} className={classes.overlay} />}</DragOverlay>
      </Portal>
    </DndContext>
  );
}

interface SortableTreeNodeProps {
  readonly row: FlattenedFormItem;
  /** The row's depth, or for the dragged row, the depth it is dropped at. */
  readonly depth: number;
  readonly treeController: UseTreeReturnType;
  readonly selected: boolean;
  /** True for a top-level item outside a page in a questionnaire with pages, which the form does not show. */
  readonly notShown: boolean;
  readonly onSelectItem?: (item: ExtendedQuestionnaireItem | undefined) => void;
}

function SortableTreeNode(props: SortableTreeNodeProps): JSX.Element {
  const { row, depth, treeController, selected, notShown, onSelectItem } = props;
  const { item, index, siblings } = row;
  const isGroup = item.type === 'group';
  const expandable = isGroup || hasFollowUpItems(item);
  const expanded = !!treeController.expandedState[item.linkId];
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.linkId,
  });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    paddingInlineStart: depth * INDENT_WIDTH,
  };

  const handleChevronClick = (e: MouseEvent): void => {
    e.stopPropagation();
    treeController.toggleExpanded(item.linkId);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={expandable ? expanded : undefined}
      className={cx(isDragging && classes.placeholder)}
    >
      <TreeNodeContent
        item={item}
        className={cx(selected && classes.selected)}
        expanded={expanded}
        notShown={notShown}
        onClick={() => onSelectItem?.(item)}
        onChevronClick={handleChevronClick}
        handle={
          <span
            ref={setActivatorNodeRef}
            className={classes.dragHandle}
            aria-label="Drag to move"
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <IconGripVertical size={14} />
          </span>
        }
        actions={
          <Group gap={4} onClick={(e) => e.stopPropagation()}>
            {(isGroup || isQuestionItem(item)) && (
              <QuestionnaireGroupMenu
                item={item}
                variant="action"
                onAddItem={(newItem) => {
                  onSelectItem?.(newItem);
                  if (newItem?.type === 'group') {
                    treeController.expand(newItem.linkId);
                  }
                  treeController.expand(item.linkId);
                }}
              />
            )}
            <QuestionnaireItemMenu item={item} items={siblings} index={index} />
          </Group>
        }
      />
    </div>
  );
}

interface TreeNodeContentProps {
  readonly item: ExtendedQuestionnaireItem;
  readonly className?: string;
  readonly expanded?: boolean;
  readonly notShown?: boolean;
  readonly handle?: JSX.Element;
  readonly actions?: JSX.Element;
  readonly onClick?: () => void;
  readonly onChevronClick?: (e: MouseEvent) => void;
}

function TreeNodeContent(props: TreeNodeContentProps): JSX.Element {
  const { item, className, expanded, notShown, handle, actions, onClick, onChevronClick } = props;
  const isGroup = item.type === 'group';
  const expandable = isGroup || hasFollowUpItems(item);
  const isFollowUp = !!item.parent && item.parent.type !== 'group';
  const title = [item.prefix, item.text].filter(Boolean).join(' ');

  return (
    <Group gap="xs" wrap="nowrap" onClick={onClick} className={cx(classes.node, className)}>
      {handle ?? (
        <span className={classes.dragHandle}>
          <IconGripVertical size={14} />
        </span>
      )}
      {expandable ? (
        <span onClick={onChevronClick} className={classes.chevron}>
          {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        </span>
      ) : (
        <span className={classes.chevron} />
      )}
      {isFollowUp && <IconCornerDownRight size={14} className={classes.followUpIcon} aria-label="Follow-up item" />}
      <ItemTypeIcon item={item} />
      <span className={cx(classes.label, notShown && classes.notShown)}>{title}</span>
      {notShown && (
        <Tooltip label="Not shown: outside a page. Drag it into a page to show it." withArrow>
          <IconEyeOff size={16} className={classes.notShownIcon} aria-label="Not shown: outside a page" />
        </Tooltip>
      )}
      {actions}
    </Group>
  );
}

/**
 * The item's icon, the same as in the add item menu.
 * @param props - The item.
 * @param props.item - The builder form item.
 * @returns The icon.
 */
function ItemTypeIcon(props: { readonly item: ExtendedQuestionnaireItem }): JSX.Element {
  const { item } = props;
  if (isPageItem(item)) {
    return <IconFiles size={16} />;
  }
  if (item.itemControl?.code === 'header' && item.type === 'group') {
    return <IconLayoutNavbar size={16} />;
  }
  if (item.itemControl?.code === 'footer' && item.type === 'group') {
    return <IconLayoutBottombar size={16} />;
  }
  if (item.type === 'group') {
    return <IconFolders size={16} />;
  }
  if (item.type === 'display') {
    return <IconFileText size={16} />;
  }
  return <IconHelp size={16} />;
}
