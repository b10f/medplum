// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Anchor, Group, Popover, Text, Tooltip } from '@mantine/core';
import { IconExternalLink, IconInfoCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useQuestionnaireFormContext } from './QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem } from './QuestionnaireFormV2.utils';
import { isChoiceItemType, isReadOnlyFormItem } from './QuestionnaireFormV2.utils';
import classes from './QuestionnaireRenderer.module.css';

/** One answer of a repeating question, or one repetition of a repeating group, with its add and remove buttons. */
export interface RepeatControls {
  readonly index: number;
  readonly count: number;
  readonly onAdd: () => void;
  readonly onRemove: () => void;
}

export interface QuestionnaireRendererLabelProps {
  readonly item: ExtendedQuestionnaireItem;
  /** The answer (or group repetition) the question is shown for, when the item repeats. */
  readonly repeat?: RepeatControls;
}

export function QuestionnaireRendererLabel(props: QuestionnaireRendererLabelProps): JSX.Element {
  const { item, repeat } = props;
  const form = useQuestionnaireFormContext();
  const readOnly = isReadOnlyFormItem(form.getValues(), item);

  const text = item.prefix ? `${item.prefix} ${item.text}` : item.text;
  // Help is shown behind a help button, when the question text is hovered, or below the question.
  const helpDisplay = item.help ? (item.helpDisplay ?? 'help') : undefined;
  const title =
    helpDisplay === 'flyover' ? (
      <Tooltip label={item.help} multiline maw={300} withArrow>
        <span className={classes.flyover}>{text}</span>
      </Tooltip>
    ) : (
      text
    );
  // A repeating choice question holds one answer per selected option, not one per repetition.
  const showIndex = repeat && repeat.count > 1 && !isChoiceItemType(item.type) ? repeat.index + 1 : null;
  const canRemove = !!repeat && repeat.count > item.minOccurs;
  const canAdd = !!repeat && repeat.index + 1 === repeat.count && (!item.maxOccurs || repeat.count < +item.maxOccurs);

  const required = item.required && (
    <Text component="span" c="red">
      *
    </Text>
  );

  return (
    <Group gap="xs" flex={1} align="center">
      <div className={classes.questionText}>
        {item.type === 'group' || item.type === 'display' ? (
          <Text fw={500}>
            {title} {showIndex}
            {required}
          </Text>
        ) : (
          <>
            {title} {showIndex}
            {required}
          </>
        )}
      </div>

      {item.supportLink && (
        <Tooltip label={`For more information visit: ${item.supportLink}`} maw={300}>
          <Anchor href={item.supportLink} target="_blank" rel="noopener noreferrer" size="sm">
            <Group gap={4}>
              Help
              <IconExternalLink size={14} />
            </Group>
          </Anchor>
        </Tooltip>
      )}

      {helpDisplay === 'help' && (
        <Popover width={256} position="bottom" withArrow>
          <Popover.Target>
            <Tooltip label="Help">
              <ActionIcon variant="subtle" size="sm" aria-label="Help">
                <IconInfoCircle size={16} />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <Text size="sm">{item.help}</Text>
          </Popover.Dropdown>
        </Popover>
      )}

      {repeat && item.repeats && !readOnly && !isChoiceItemType(item.type) && (
        <Group gap="xs">
          {canRemove && (
            <ActionIcon variant="filled" color="red" size="sm" aria-label="Remove answer" onClick={repeat.onRemove}>
              <IconTrash size={16} />
            </ActionIcon>
          )}

          {canAdd && (
            <ActionIcon variant="outline" size="sm" aria-label="Add answer" onClick={repeat.onAdd}>
              <IconPlus size={16} />
            </ActionIcon>
          )}
        </Group>
      )}
      {helpDisplay === 'inline' && (
        <Text size="sm" c="dimmed" w="100%" fw={400}>
          {item.help}
        </Text>
      )}
    </Group>
  );
}
