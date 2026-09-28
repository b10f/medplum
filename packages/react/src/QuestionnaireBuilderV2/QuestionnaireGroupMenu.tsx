// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Button, Menu } from '@mantine/core';
import { generateId } from '@medplum/core';
import type { QuestionnaireItem } from '@medplum/fhirtypes';
import {
  IconFiles,
  IconFileText,
  IconFolders,
  IconHelp,
  IconLayoutGrid,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';
import type { JSX, SyntheticEvent } from 'react';
import { useCallback, useState } from 'react';
import { killEvent } from '../utils/dom';
import type { ExtendedQuestionnaireItem } from './QuestionnaireBuilderV2.utils';
import {
  createFollowUpEnableWhen,
  fromFhirQuestionnaireItem,
  getValueByPath,
  isQuestionItem,
  PAGE_ITEM_CONTROL,
  rebuildFormItems,
  toFhirQuestionnaireItem,
} from './QuestionnaireBuilderV2.utils';
import { useQuestionnaireFormContext } from './QuestionnaireFormContext';
import { QuestionnaireLoincSearchDrawer } from './QuestionnaireLoincSearch';

export interface QuestionnaireGroupMenuProps {
  /** The group, or the question to add follow-up items to; the questionnaire itself when undefined. */
  readonly item?: ExtendedQuestionnaireItem;
  readonly onAddItem?: (item: ExtendedQuestionnaireItem) => void;
  readonly variant?: 'icon' | 'action';
}

export function QuestionnaireGroupMenu(props: QuestionnaireGroupMenuProps): JSX.Element {
  const { item, onAddItem, variant = 'icon' } = props;
  const form = useQuestionnaireFormContext();
  const [loincSearchType, setLoincSearchType] = useState<'question' | 'panel'>('question');
  const [loincSearchOpened, setLoincSearchOpened] = useState(false);
  const isFollowUp = isQuestionItem(item);

  const addItem = useCallback(
    (
      type: 'group' | 'display' | 'question' | 'page',
      context?: ExtendedQuestionnaireItem,
      fhirItem?: QuestionnaireItem
    ) => {
      const path: string = context ? `${context.path}.item` : 'item';
      const newItem =
        type === 'page'
          ? { linkId: generateId(), type: 'group', text: 'New Page', itemControl: PAGE_ITEM_CONTROL }
          : { linkId: generateId(), type: type === 'question' ? 'string' : type, text: 'New Item' };

      // A ready-made FHIR item (e.g. from LOINC) is already in FHIR form; converting it again would drop its extensions.
      const extendedQuestionnaireItem = fhirItem ?? toFhirQuestionnaireItem(newItem);
      const currentItems = getValueByPath(form.getValues(), path) || [];

      const added = fromFhirQuestionnaireItem(extendedQuestionnaireItem, null, currentItems.length);
      if (context && isQuestionItem(context)) {
        added.enableWhen = [createFollowUpEnableWhen(context)];
      }

      form.setFieldValue(path, [...currentItems, added]);

      if (context) {
        // to rebuild the parent item reference chain, and give each answer of a question its follow-up items
        form.setFieldValue('item', rebuildFormItems(form.getValues()));
      }

      const updatedItems = getValueByPath(form.getValues(), path) || [];

      onAddItem?.(updatedItems.at(-1));
    },
    [form, onAddItem]
  );

  return (
    <>
      <Menu position="bottom-start" width={240}>
        <Menu.Target>
          {variant === 'action' ? (
            <ActionIcon variant="subtle" size="sm" aria-label="Add item" onMouseDown={killEvent} onClick={killEvent}>
              <IconPlus size={16} />
            </ActionIcon>
          ) : (
            <Button
              variant="outline"
              size="compact-sm"
              aria-label="Add item"
              onMouseDown={killEvent}
              onClick={killEvent}
            >
              <IconPlus size={16} />
            </Button>
          )}
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconHelp size={16} />}
            onClick={(e) => {
              e.stopPropagation();
              addItem('question', item);
            }}
          >
            {isFollowUp ? 'Add Follow-up Question' : 'Add Question'}
          </Menu.Item>
          <Menu.Item
            leftSection={<IconFileText size={16} />}
            onClick={(e) => {
              e.stopPropagation();
              addItem('display', item);
            }}
          >
            Add Display Text
          </Menu.Item>
          {!isFollowUp && (
            <Menu.Item
              leftSection={<IconFolders size={16} />}
              onClick={(e) => {
                e.stopPropagation();
                addItem('group', item);
              }}
            >
              Add Question Group
            </Menu.Item>
          )}
          {!item && (
            <Menu.Item
              leftSection={<IconFiles size={16} />}
              onClick={(e) => {
                e.stopPropagation();
                addItem('page');
              }}
            >
              Add Page
            </Menu.Item>
          )}
          <Menu.Divider />
          <Menu.Item
            leftSection={<IconSearch size={16} />}
            onClick={(e) => {
              e.stopPropagation();
              setLoincSearchType('question');
              setLoincSearchOpened(true);
            }}
          >
            Add LOINC Question
          </Menu.Item>
          {!isFollowUp && (
            <Menu.Item
              leftSection={<IconLayoutGrid size={16} />}
              onClick={(e) => {
                e.stopPropagation();
                setLoincSearchType('panel');
                setLoincSearchOpened(true);
              }}
            >
              Add LOINC Panel
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
      {/* The drawer is portalled, but React still bubbles its events to the tree row this menu sits in. */}
      <div onClick={stopPropagation} onMouseDown={stopPropagation} onKeyDown={stopPropagation}>
        <QuestionnaireLoincSearchDrawer
          key={loincSearchType}
          type={loincSearchType}
          opened={loincSearchOpened}
          onClose={() => setLoincSearchOpened(false)}
          onAdd={(fhirItem) => addItem(fhirItem.type === 'group' ? 'group' : 'question', item, fhirItem)}
        />
      </div>
    </>
  );
}

function stopPropagation(e: SyntheticEvent): void {
  e.stopPropagation();
}
