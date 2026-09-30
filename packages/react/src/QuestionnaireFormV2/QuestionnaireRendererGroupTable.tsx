// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Button, Table, Text } from '@mantine/core';
import type { QuestionnaireResponse } from '@medplum/fhirtypes';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useContext } from 'react';
import { useQuestionnaireFormContext, useQuestionnaireResponseFormContext } from './QuestionnaireFormContext';
import { isReadOnlyFormItem, isUsedInMode } from './QuestionnaireFormV2.utils';
import { QuestionnaireModeContext } from './QuestionnaireModeContext';
import { addRepetition } from './QuestionnaireRenderer.utils';
import type { QuestionnaireRendererGroupProps } from './QuestionnaireRendererGroup';
import { QuestionnaireRendererItem } from './QuestionnaireRendererItem/QuestionnaireRendererItem';
import { QuestionnaireRendererLabel } from './QuestionnaireRendererLabel';
import { QuestionnaireRendererRequiredGroupError } from './QuestionnaireRendererRequiredGroupError';
import { QuestionnaireRendererSelectedItem } from './QuestionnaireRendererSelectedItem';
import { evaluateEnableWhen, getResponseItemIndexes } from './QuestionnaireResponse.utils';

/**
 * A group rendered as a table: its questions are the columns and each repetition is a row.
 * @param props - The QuestionnaireRendererGroup props.
 * @returns The QuestionnaireRendererGroupTable React node.
 */
export function QuestionnaireRendererGroupTable(props: QuestionnaireRendererGroupProps): JSX.Element {
  const { item, context, selectedItem, index, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();
  const responseForm = useQuestionnaireResponseFormContext();
  const mode = useContext(QuestionnaireModeContext);
  const values = form.getValues();
  const response = responseForm.getValues() as QuestionnaireResponse;
  const readOnly = isReadOnlyFormItem(values, item);
  const columns = item.item.filter((column) => !column.hidden && isUsedInMode(column.usageMode, mode));
  const rows = getResponseItemIndexes(response, context, item.linkId);
  const canRemove = item.repeats && !readOnly && rows.length > (+item.minOccurs || 1);
  const canAdd = item.repeats && !readOnly && (!item.maxOccurs || rows.length < +item.maxOccurs);

  return (
    <QuestionnaireRendererSelectedItem item={item} selectedItem={selectedItem} index={index}>
      <QuestionnaireRendererLabel item={item} />
      <Table withTableBorder withColumnBorders mt="xs">
        <Table.Thead>
          <Table.Tr>
            {columns.map((column) => (
              <Table.Th key={column.linkId}>
                {[column.prefix, column.text].filter(Boolean).join(' ')}
                {column.required && (
                  <Text component="span" c="red">
                    {' '}
                    *
                  </Text>
                )}
              </Table.Th>
            ))}
            {canRemove && <Table.Th w={48} />}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row, rowIndex) => {
            const rowContext = `${context}.${row}.item`;
            return (
              <Table.Tr key={`${item.linkId}-${rowIndex}`}>
                {columns.map((column) => {
                  const cellIndexes = getResponseItemIndexes(response, rowContext, column.linkId);
                  return (
                    <Table.Td key={column.linkId}>
                      {cellIndexes.length > 0 && evaluateEnableWhen(values, response, column, rowContext) && (
                        <QuestionnaireRendererItem
                          item={column}
                          answersPath={`${rowContext}.${cellIndexes[0]}.answer`}
                          answerIndex={0}
                          ignoreValidation={ignoreValidation}
                          readOnly={isReadOnlyFormItem(values, column)}
                          inline
                        />
                      )}
                    </Table.Td>
                  );
                })}
                {canRemove && (
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Remove row"
                      onClick={() => responseForm.removeListItem(context, row)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                )}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      {canAdd && (
        <Button
          variant="default"
          size="xs"
          mt="xs"
          leftSection={<IconPlus size={16} />}
          onClick={() => addRepetition(responseForm, context, item.linkId)}
        >
          Add row
        </Button>
      )}
      <QuestionnaireRendererRequiredGroupError item={item} context={context} />
    </QuestionnaireRendererSelectedItem>
  );
}
