// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Accordion, Alert, Button, Loader, Stack } from '@mantine/core';
import { generateId } from '@medplum/core';
import type { Coding } from '@medplum/fhirtypes';
import { IconGitBranch, IconPlus, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useQuestionnaireFormContext } from '../../QuestionnaireFormV2/QuestionnaireFormContext';
import type {
  ExtendedQuestionnaireItem,
  ExtendedQuestionnaireItemEnableWhen,
} from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { findFormItemByLinkId, getValueByPath } from '../../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import { FormSelect } from '../QuestionnaireFormInputs/FormSelect';
import { QuestionnaireEnableWhenAnswer } from './QuestionnaireEnableWhenAnswer';
import type { QuestionnaireItemSectionProps } from './QuestionnaireItemSettings.utils';
import { toSelectData } from './QuestionnaireItemSettings.utils';
import { QuestionnaireSettingsSectionTitle } from './QuestionnaireSettingsSectionTitle';

/** The question types a condition can compare by order (<, <=, >, >=). */
const ORDERED_TYPES = ['integer', 'decimal', 'quantity', 'date', 'dateTime', 'time'];

/**
 * The "Conditional Display" section: the conditions the item is shown on (enableWhen), whether all or any of them must
 * be met, and the modes it is used in (usage mode).
 * @param props - The section props.
 * @returns The QuestionnaireItemConditionsSection React node.
 */
export function QuestionnaireItemConditionsSection(props: QuestionnaireItemSectionProps): JSX.Element {
  const { selectedItem, disabled, codes } = props;
  const form = useQuestionnaireFormContext();
  const path = selectedItem.path;
  const enableWhens = (getValueByPath(form.getValues(), `${path}.enableWhen`) ||
    []) as ExtendedQuestionnaireItemEnableWhen[];

  // The questions a condition can check: every question but this item.
  const getQuestionPredicates = (): ExtendedQuestionnaireItem[] => {
    const extractQuestions = (items: ExtendedQuestionnaireItem[]): ExtendedQuestionnaireItem[] =>
      items.flatMap((item) => [
        ...(item.type !== 'display' && item.type !== 'group' && item.linkId !== selectedItem.linkId ? [item] : []),
        ...(Array.isArray(item.item) ? extractQuestions(item.item) : []),
      ]);
    return extractQuestions(form.getValues().item);
  };

  const getOperators = (condition: ExtendedQuestionnaireItemEnableWhen): Coding[] => {
    if (ORDERED_TYPES.includes(condition.question?.type)) {
      return codes.enableOperators;
    }
    return codes.enableOperators.filter(
      (operator: Coding) => !['<', '<=', '>', '>='].includes(operator.code as string)
    );
  };

  const addEnableWhen = (): void => {
    form.insertListItem(`${path}.enableWhen`, {
      id: generateId(),
      question: null,
      operator: '',
      answer: '',
      unit: null,
    });
  };

  return (
    <>
      <QuestionnaireSettingsSectionTitle icon={<IconGitBranch size={22} />}>
        Conditional Display
      </QuestionnaireSettingsSectionTitle>

      {enableWhens.length === 0 ? (
        <Alert color="blue">No conditions added. This item will always be shown.</Alert>
      ) : (
        <Accordion>
          {enableWhens.map((condition: ExtendedQuestionnaireItemEnableWhen, index: number) => (
            <Accordion.Item key={condition.id ?? index} value={String(index)}>
              <Accordion.Control>{condition.question?.text ?? 'Select Question'}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="md">
                  <FormSelect
                    form={form}
                    label="Question"
                    placeholder="Select an option"
                    context={`${path}.enableWhen.${index}.question`}
                    data={getQuestionPredicates().map((q: ExtendedQuestionnaireItem) => ({
                      value: q.linkId,
                      label: q.text as string,
                    }))}
                    required={true}
                    value={condition.question?.linkId ?? null}
                    onChange={(linkId) => {
                      const question = getQuestionPredicates().find(
                        (q: ExtendedQuestionnaireItem) => q.linkId === linkId
                      );
                      form.setFieldValue(`${path}.enableWhen.${index}.question`, question ?? null);
                      // An answer to another question means nothing for this one.
                      form.setFieldValue(`${path}.enableWhen.${index}.answer`, '');
                    }}
                  />

                  {condition.question && (
                    <FormSelect
                      form={form}
                      label="Operator"
                      context={`${path}.enableWhen.${index}.operator`}
                      loading={codes.loading}
                      unavailable={codes.unavailable.enableOperators}
                      data={toSelectData(getOperators(condition))}
                    />
                  )}

                  {condition.question && condition.operator && !['exists', 'empty'].includes(condition.operator) && (
                    <QuestionnaireEnableWhenAnswer
                      key={condition.question.linkId}
                      form={form}
                      context={`${path}.enableWhen.${index}.answer`}
                      question={
                        findFormItemByLinkId(form.getValues().item ?? [], condition.question.linkId) ??
                        (condition.question as unknown as ExtendedQuestionnaireItem)
                      }
                      disabled={disabled}
                    />
                  )}

                  <Button
                    variant="filled"
                    color="red"
                    onClick={() => form.removeListItem(`${path}.enableWhen`, index)}
                    disabled={disabled}
                    leftSection={<IconTrash size={16} />}
                  >
                    Remove Condition
                  </Button>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
      <Button
        variant="default"
        onClick={addEnableWhen}
        disabled={disabled}
        leftSection={disabled ? <Loader size={16} /> : <IconPlus size={16} />}
      >
        Add Condition
      </Button>

      {enableWhens.length > 1 && (
        <FormSelect
          form={form}
          label="Show this item when"
          description="Enable the question when all/any of the criteria are satisfied."
          placeholder="Show this item when"
          context={`${path}.enableBehavior`}
          data={toSelectData(codes.enableBehaviors)}
          loading={codes.loading}
          unavailable={codes.unavailable.enableBehaviors}
          disabled={disabled}
        />
      )}

      <FormSelect
        form={form}
        label="Usage mode"
        description='Identifies that the specified element should only appear in certain "modes" of operation.'
        placeholder="Usage mode"
        context={`${path}.usageMode`}
        data={toSelectData(codes.usageModes)}
        loading={codes.loading}
        unavailable={codes.unavailable.usageModes}
        disabled={disabled}
      />
    </>
  );
}
