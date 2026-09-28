// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Accordion, Alert, Box, Button, Card, Divider, Group, Loader, Stack, Text } from '@mantine/core';
import type { MedplumClient } from '@medplum/core';
import { generateId, HTTP_HL7_ORG, LOINC } from '@medplum/core';
import type { Coding, QuestionnaireItemAnswerOption, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconList, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type {
  ExtendedQuestionnaireItem,
  ExtendedQuestionnaireItemAnswerOption,
  ExtendedQuestionnaireItemEnableWhen,
} from './QuestionnaireBuilderV2.utils';
import {
  createManualAnswerOption,
  fromFhirAnswerOptions,
  getAnswerOptionProblems,
  getLocalAnswerOptionSystem,
  getValueByPath,
  isManualAnswerOption,
  PAGE_ITEM_CONTROL,
} from './QuestionnaireBuilderV2.utils';
import type { QuestionnaireForm } from './QuestionnaireFormContext';
import { useQuestionnaireFormContext } from './QuestionnaireFormContext';
import {
  FormFlatCollection,
  FormRadioGroup,
  FormSelect,
  FormSwitch,
  FormTextarea,
  FormTextInput,
} from './QuestionnaireFormInputs';
import { QuestionnaireLoincAnswerListDrawer } from './QuestionnaireLoincAnswerListDrawer';
import { QuestionnaireValueSetAnswersDrawer } from './QuestionnaireValueSetAnswersDrawer';

const VALUE_SET_URLS = {
  itemType: `${HTTP_HL7_ORG}/fhir/ValueSet/item-type`,
  questionnaireEnableOperator: `${HTTP_HL7_ORG}/fhir/ValueSet/questionnaire-enable-operator`,
  questionnaireEnableBehavior: `${HTTP_HL7_ORG}/fhir/ValueSet/questionnaire-enable-behavior`,
  questionnaireItemControl: `${HTTP_HL7_ORG}/fhir/ValueSet/questionnaire-item-control`,
  questionnaireUsageMode: `${HTTP_HL7_ORG}/fhir/ValueSet/questionnaire-usage-mode`,
} as const;

// Medplum's expansion of item-type lists the abstract `question` code as a regular code, so it is excluded explicitly.
const EXCLUDED_ITEM_TYPES = ['group', 'display', 'attachment', 'reference', 'question'];

export interface QuestionnaireItemSettingsProps {
  readonly selectedItem: ExtendedQuestionnaireItem;
  readonly addAnswer: (item: ExtendedQuestionnaireItem, original?: ExtendedQuestionnaireItem) => void;
  readonly disabled?: boolean;
}

export function QuestionnaireItemSettings(props: QuestionnaireItemSettingsProps): JSX.Element {
  const { selectedItem, addAnswer, disabled = false } = props;
  const medplum = useMedplum();
  const form = useQuestionnaireFormContext();
  const [loading, setLoading] = useState(true);
  const [answerListSearchOpened, setAnswerListSearchOpened] = useState(false);
  const [valueSetSearchOpened, setValueSetSearchOpened] = useState(false);
  const [openedAnswerOption, setOpenedAnswerOption] = useState<string | null>(null);

  const [itemType, setItemType] = useState<Coding[]>([]);
  const [questionnaireEnableOperator, setQuestionnaireEnableOperator] = useState<Coding[]>([]);
  const [questionnaireEnableBehavior, setQuestionnaireEnableBehavior] = useState<Coding[]>([]);
  const [questionnaireItemControl, setQuestionnaireItemControl] = useState<Coding[]>();
  const [questionnaireUsageMode, setQuestionnaireUsageMode] = useState<Coding[]>([]);

  useEffect(() => {
    const loadValueSets = async (): Promise<void> => {
      try {
        const [
          itemTypeValueSet,
          questionnaireEnableOperatorValueSet,
          questionnaireEnableBehaviorValueSet,
          questionnaireItemControlValueSet,
          questionnaireUsageModeValueSet,
        ] = await Promise.all([
          expandValueSet(medplum, VALUE_SET_URLS.itemType),
          expandValueSet(medplum, VALUE_SET_URLS.questionnaireEnableOperator),
          expandValueSet(medplum, VALUE_SET_URLS.questionnaireEnableBehavior),
          expandValueSet(medplum, VALUE_SET_URLS.questionnaireItemControl),
          expandValueSet(medplum, VALUE_SET_URLS.questionnaireUsageMode),
        ]);

        setItemType(itemTypeValueSet);
        setQuestionnaireEnableOperator(questionnaireEnableOperatorValueSet);
        setQuestionnaireEnableBehavior(questionnaireEnableBehaviorValueSet);
        setQuestionnaireItemControl(questionnaireItemControlValueSet);
        setQuestionnaireUsageMode(questionnaireUsageModeValueSet);
      } catch (error: any) {
        console.error('Error loading value sets:', error);
      } finally {
        setLoading(false);
      }
    };

    loadValueSets().catch(console.error);
  }, [medplum]);

  const addInitial = (): void => {
    form.insertListItem(`${path}.initial`, { id: generateId(), value: '' });
  };

  const canAddInitial = (): boolean => {
    return true;
  };

  const getItemControlOptions = (): Coding[] => {
    const type = selectedItem?.type;
    const repeats = selectedItem?.repeats;
    const choiceTypes = ['drop-down', 'radio-button'];
    const repeatingChoiceTypes = ['drop-down', 'check-box'];
    const numericTypes = ['text-box', 'slider'];
    const groupTypes = ['list', 'gtable'];

    if (questionnaireItemControl) {
      const options = questionnaireItemControl.filter((itemType: Coding) => {
        const code = itemType.code as string;
        if (type === 'choice' || type === 'open-choice') {
          return repeats ? repeatingChoiceTypes.includes(code) : choiceTypes.includes(code);
        } else if (type === 'integer') {
          return numericTypes.includes(code);
        } else if (type === 'group') {
          return groupTypes.includes(code);
        }

        return true;
      });

      // `page` is not in the R4 item control value set; Medplum uses it to mark top-level groups as pages.
      if (
        type === 'group' &&
        !selectedItem.parent &&
        !options.some((option) => option.code === PAGE_ITEM_CONTROL.code)
      ) {
        options.push(PAGE_ITEM_CONTROL);
      }

      return options;
    }

    return [];
  };

  const path = selectedItem.path;
  const type = getValueByPath(form.getValues(), `${path}.type`);
  const isGroup = type === 'group';
  const isDisplay = type === 'display';
  const isChoice = type === 'choice' || type === 'open-choice';
  const repeats = getValueByPath(form.getValues(), `${path}.repeats`);
  const isRequired = getValueByPath(form.getValues(), `${path}.required`);
  const itemControl = getValueByPath(form.getValues(), `${path}.itemControl`);
  const isSlider = type === 'integer' && itemControl?.code === 'slider';
  const answerOptions = (getValueByPath(form.getValues(), `${path}.answerOption`) ||
    []) as ExtendedQuestionnaireItemAnswerOption[];
  const enableWhens = (getValueByPath(form.getValues(), `${path}.enableWhen`) ||
    []) as ExtendedQuestionnaireItemEnableWhen[];

  const findRootGroup = (item: ExtendedQuestionnaireItem): ExtendedQuestionnaireItem => {
    if (!item.parent) {
      return item;
    }

    return findRootGroup(item.parent);
  };

  const isDisabledByParent = (): boolean => {
    const parent = selectedItem?.parent;
    const isInGroup: boolean = parent?.type === 'group';

    if (!isInGroup) {
      return false;
    }

    const root = findRootGroup(selectedItem);

    return Boolean(root?.readOnly);
  };

  const getQuestionPredicates = (): ExtendedQuestionnaireItem[] => {
    const itemsArray = form.getValues().item;
    const selectedLinkId = selectedItem?.linkId;

    const extractQuestions = (array: ExtendedQuestionnaireItem[]): ExtendedQuestionnaireItem[] => {
      let questions: ExtendedQuestionnaireItem[] = [];

      array.forEach((item) => {
        const type = item.type;
        const linkId = item.linkId;

        if (type !== 'display' && type !== 'group' && linkId !== selectedLinkId) {
          questions.push(item);
        }

        if (item.item && Array.isArray(item.item)) {
          questions = questions.concat(extractQuestions(item.item));
        }
      });

      return questions;
    };

    return extractQuestions(itemsArray);
  };

  const getApplicableQuestionnaireEnableWhenOperators = (condition: ExtendedQuestionnaireItemEnableWhen): Coding[] => {
    const question = condition.question;
    const type = question?.type;

    if (['integer', 'decimal', 'quantity', 'date', 'dateTime', 'time'].includes(type)) {
      return questionnaireEnableOperator;
    }

    return questionnaireEnableOperator.filter((operator: Coding) => {
      return operator.code !== '<' && operator.code !== '<=' && operator.code !== '>' && operator.code !== '>=';
    });
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

  const removeEnableWhen = (index: number): void => {
    form.removeListItem(`${path}.enableWhen`, index);
  };

  const questionnaireValues = form.getValues();
  const localAnswerSystem = getLocalAnswerOptionSystem(
    questionnaireValues.url ??
      (questionnaireValues.id ? medplum.fhirUrl('Questionnaire', questionnaireValues.id).toString() : undefined)
  );

  const addAnswerOption = (): void => {
    form.insertListItem(`${path}.answerOption`, createManualAnswerOption(answerOptions, localAnswerSystem));
    setOpenedAnswerOption(String(answerOptions.length));
  };

  const removeAnswerOption = (index: number): void => {
    form.removeListItem(`${path}.answerOption`, index);
  };

  const syncAnswers = (
    node: ExtendedQuestionnaireItem,
    applyChange?: (answerItem: ExtendedQuestionnaireItem) => void
  ): void => {
    const path = node.answerPath;
    const answers = getValueByPath(form.getValues(), `${path}.answer`) ?? [];

    for (const answerGroup of answers) {
      for (const answerItem of answerGroup) {
        if (answerItem.linkId === selectedItem?.linkId) {
          if (applyChange) {
            applyChange(answerItem);
          }
        } else if (answerItem.type === 'group') {
          syncAnswers(answerItem);
        }
      }
    }
  };

  const handleInitialInputChange = (value: any, index: number): void => {
    const isInGroup: boolean = selectedItem?.parent?.type === 'group';

    const applyChange = (item: ExtendedQuestionnaireItem): void => {
      const path = item.answerPath;
      const answerArray: { value: any }[] = getValueByPath(form.getValues(), `${path}.answer`) ?? [];

      if (index >= 0 && index < answerArray.length) {
        answerArray[index].value = item.type === 'integer' || item.type === 'decimal' ? +value : value;
        form.setFieldValue(`${path}.answer`, answerArray);
      }
    };

    if (isInGroup) {
      const root = findRootGroup(selectedItem);
      syncAnswers(root, applyChange);
    } else {
      applyChange(selectedItem);
    }
  };

  const handleAnswerOptionSelectionChange = (value: boolean, index: number): void => {
    const path = selectedItem?.path;

    const answerOptionsArray: QuestionnaireItemAnswerOption[] =
      getValueByPath(form.getValues(), `${path}.answerOption`) ?? [];

    answerOptionsArray.forEach((option: QuestionnaireItemAnswerOption, i: number) => {
      option.initialSelected = value && i === index;
    });

    form.setFieldValue(`${path}.answerOption`, answerOptionsArray);
  };

  const handleRepeatsChange = (repeats: boolean): void => {
    const parent = selectedItem?.parent;
    const isInGroup: boolean = parent?.type === 'group';
    const initialArray = getValueByPath(form.getValues(), `${selectedItem.path}.initial`) ?? [];
    const minOccurs = getValueByPath(form.getValues(), `${selectedItem.path}.minOccurs`) ?? 1;

    const applyChange = (item: ExtendedQuestionnaireItem, original?: ExtendedQuestionnaireItem): void => {
      const path = item.answerPath;
      const answerArray = getValueByPath(form.getValues(), `${path}.answer`) ?? [];

      if (!repeats) {
        if (initialArray) {
          let i = initialArray.length;

          while (i-- > 1) {
            initialArray.pop();
            form.setFieldValue(`${selectedItem.path}.initial`, initialArray);
          }
        }

        if (answerArray) {
          let i = answerArray.length;

          while (i-- > 1) {
            answerArray.pop();
            form.setFieldValue(`${path}.answer`, answerArray);
          }
        }
      } else {
        let i = answerArray.length;

        while (i++ < minOccurs) {
          addAnswer(item, original);
        }
      }
    };

    if (isInGroup) {
      const root = findRootGroup(selectedItem);
      syncAnswers(root, applyChange);
    } else {
      applyChange(selectedItem);
    }

    const itemControl = getValueByPath(form.getValues(), `${selectedItem?.path}.itemControl`);

    if (itemControl) {
      form.setFieldValue(`${selectedItem?.path}.itemControl`, {});
    }
  };

  const handleMinOccursChange = (minOccurs: number): void => {
    // An empty or zero field is not a limit; applying it would delete every answer.
    if (!minOccurs) {
      return;
    }

    const parent = selectedItem?.parent;
    const isInGroup: boolean = parent?.type === 'group';

    const applyChange = (item: ExtendedQuestionnaireItem, original?: ExtendedQuestionnaireItem): void => {
      const path = item.answerPath;
      const answerArray = getValueByPath(form.getValues(), `${path}.answer`) ?? [];
      let i = answerArray.length;

      while (i++ < minOccurs) {
        addAnswer(item, original);
      }

      i = answerArray.length;
      while (i-- > minOccurs) {
        answerArray.pop();
        form.setFieldValue(`${path}.answer`, answerArray);
      }
    };

    if (isInGroup) {
      const root = findRootGroup(selectedItem);
      syncAnswers(root, applyChange);
    } else {
      applyChange(selectedItem);
    }
  };

  const handleMaxOccursChange = (maxOccurs: number): void => {
    // An empty or zero field means unlimited; applying it would delete every answer.
    if (!maxOccurs) {
      return;
    }

    const parent = selectedItem?.parent;
    const isInGroup: boolean = parent?.type === 'group';

    const applyChange = (item: ExtendedQuestionnaireItem): void => {
      const path = item.answerPath;
      const answerArray = getValueByPath(form.getValues(), `${path}.answer`) ?? [];
      let i = answerArray.length;

      while (i-- > maxOccurs) {
        answerArray.pop();
        form.setFieldValue(`${path}.answer`, answerArray);
      }
    };

    if (isInGroup) {
      const root = findRootGroup(selectedItem);
      syncAnswers(root, applyChange);
    } else {
      applyChange(selectedItem);
    }
  };

  const itemControlOptions = getItemControlOptions();

  return (
    <Box p={8}>
      <Stack gap="md">
        <Divider />
        <Text size="xl" fw={500}>
          {getTitle(selectedItem, type)}
        </Text>
        <Divider />

        <FormTextInput form={form} label="Prefix" context={`${path}.prefix`} disabled={disabled} />

        <FormTextarea
          form={form}
          label="Primary text for the item"
          context={`${path}.text`}
          rows={10}
          required={true}
          disabled={disabled}
        />

        {!isDisplay && <QuestionnaireItemCodes form={form} path={`${path}.code`} />}

        {!isDisplay && !isGroup && (
          <>
            <FormSelect
              form={form}
              label="Type"
              context={`${path}.type`}
              loading={loading}
              data={toSelectData(itemType.filter((t: Coding) => !EXCLUDED_ITEM_TYPES.includes(t.code as string)))}
            />

            {type !== 'choice' && type !== 'open-choice' && answerOptions.length === 0 && (
              <FormFlatCollection
                form={form}
                context={`${path}.initial`}
                add={addInitial}
                canAdd={canAddInitial}
                disabled={disabled}
              >
                {(index: number) => (
                  <Stack gap="md">
                    {type === 'boolean' && (
                      <FormSwitch
                        form={form}
                        label="Initial Value"
                        context={`${path}.initial.${index}.value`}
                        onChange={(value) => handleInitialInputChange(value, index)}
                        disabled={disabled}
                      />
                    )}

                    {type !== 'boolean' && (
                      <FormTextInput
                        form={form}
                        label="Initial Value"
                        context={`${path}.initial.${index}.value`}
                        type={getInitialInputType(type)}
                        onChange={(value) => handleInitialInputChange(value, index)}
                        disabled={disabled}
                      />
                    )}
                  </Stack>
                )}
              </FormFlatCollection>
            )}
          </>
        )}

        {questionnaireItemControl && ['group', 'choice', 'open-choice', 'integer'].includes(type) && (
          <>
            <FormSelect
              form={form}
              label="Item Control"
              placeholder="Item Control"
              context={`${path}.itemControl`}
              data={toSelectData(itemControlOptions)}
              loading={loading}
              disabled={disabled}
              value={itemControl?.code ?? null}
              onChange={(code) => {
                const coding = itemControlOptions.find((option: Coding) => option.code === code);
                form.setFieldValue(
                  `${path}.itemControl`,
                  coding ? { code: coding.code, display: coding.display, system: coding.system } : {}
                );
              }}
            />

            {isSlider && (
              <FormTextInput
                form={form}
                label="Slider Step Value"
                context={`${path}.sliderStepValue`}
                type="number"
                min="1"
                disabled={disabled}
              />
            )}

            {isChoice && (
              <FormRadioGroup
                form={form}
                label="Choice Orientation"
                description="Desired orientation when rendering a list of choices"
                context={`${path}.choiceOrientation`}
                options={[
                  { value: 'horizontal', label: 'Horizontal' },
                  { value: 'vertical', label: 'Vertical' },
                ]}
                disabled={disabled}
              />
            )}
          </>
        )}

        {isChoice && answerOptions.length === 0 ? (
          <Alert color="blue">No answer options added. Add at least one option for choice questions.</Alert>
        ) : (
          <Card withBorder>
            <Card.Section withBorder inheritPadding py="xs">
              <Text fw={500}>Answer Options</Text>
            </Card.Section>
            <Card.Section inheritPadding py="md">
              <Accordion value={openedAnswerOption} onChange={setOpenedAnswerOption}>
                {answerOptions.map((answer: ExtendedQuestionnaireItemAnswerOption, index: number) => {
                  // Coded answers (LOINC, a value set) keep their code, text and score, so they mean the same everywhere.
                  const isCodedAnswer = !isManualAnswerOption(answer, localAnswerSystem);
                  return (
                    <Accordion.Item key={answer.id ?? index} value={String(index)}>
                      <Accordion.Control>{answer.value.display}</Accordion.Control>
                      <Accordion.Panel>
                        <Stack gap="md">
                          {isCodedAnswer && (
                            <Text size="xs" c="dimmed">
                              {answer.value?.system === LOINC ? 'LOINC answer' : 'Coded answer'}: its text, code and
                              score are fixed so it means the same everywhere.
                            </Text>
                          )}
                          <FormTextInput
                            form={form}
                            label="Display Text"
                            context={`${path}.answerOption.${index}.value.display`}
                            required={!isCodedAnswer}
                            disabled={disabled || isCodedAnswer}
                          />

                          <FormSwitch
                            form={form}
                            label="Initially Selected"
                            context={`${path}.answerOption.${index}.initialSelected`}
                            onChange={(value) => {
                              handleAnswerOptionSelectionChange(value, index);
                              handleInitialInputChange(answer.value, 0);
                            }}
                            disabled={disabled}
                          />

                          <FormTextInput
                            form={form}
                            label="Code"
                            context={`${path}.answerOption.${index}.value.code`}
                            required={!isCodedAnswer}
                            disabled={disabled || isCodedAnswer}
                          />

                          <FormTextInput
                            form={form}
                            label="System"
                            context={`${path}.answerOption.${index}.value.system`}
                            disabled={true}
                          />

                          <FormTextInput
                            form={form}
                            label="Score"
                            context={`${path}.answerOption.${index}.value.score`}
                            type="number"
                            min="0"
                            disabled={disabled || isCodedAnswer}
                          />

                          <Button
                            variant="filled"
                            color="red"
                            onClick={() => removeAnswerOption(index)}
                            disabled={disabled}
                            leftSection={<IconTrash size={16} />}
                          >
                            Remove Answer Option
                          </Button>
                        </Stack>
                      </Accordion.Panel>
                    </Accordion.Item>
                  );
                })}
              </Accordion>
            </Card.Section>
          </Card>
        )}

        {getAnswerOptionProblems(answerOptions).map((problem) => (
          <Alert key={problem} color="yellow">
            {problem}
          </Alert>
        ))}

        {isChoice && (
          <>
            <Button
              variant="default"
              leftSection={<IconSearch size={16} />}
              onClick={() => setAnswerListSearchOpened(true)}
              disabled={disabled}
            >
              {answerOptions.length > 0 ? 'Replace with LOINC answers' : 'Add answers from LOINC'}
            </Button>
            <Button
              variant="default"
              leftSection={<IconList size={16} />}
              onClick={() => setValueSetSearchOpened(true)}
              disabled={disabled}
            >
              {answerOptions.length > 0 ? 'Replace with a value set' : 'Add answers from a value set'}
            </Button>
            <Button
              variant="default"
              leftSection={<IconPlus size={16} />}
              onClick={addAnswerOption}
              disabled={disabled}
            >
              Add answer option
            </Button>
            <QuestionnaireLoincAnswerListDrawer
              opened={answerListSearchOpened}
              onClose={() => setAnswerListSearchOpened(false)}
              replaces={answerOptions.length > 0}
              onSelect={(answerOption) =>
                form.setFieldValue(`${path}.answerOption`, fromFhirAnswerOptions(answerOption))
              }
            />
            <QuestionnaireValueSetAnswersDrawer
              opened={valueSetSearchOpened}
              onClose={() => setValueSetSearchOpened(false)}
              replaces={answerOptions.length > 0}
              onSelect={(answerOption) =>
                form.setFieldValue(`${path}.answerOption`, fromFhirAnswerOptions(answerOption))
              }
            />
          </>
        )}

        <Divider />
        <Text size="xl" fw={500}>
          Settings
        </Text>
        <Divider />

        <FormSwitch form={form} label="Hidden" context={`${path}.hidden`} disabled={disabled} />

        {!isDisplay && (
          <>
            <FormSwitch form={form} label="Required" context={`${path}.required`} disabled={disabled} />

            {selectedItem.parent?.itemControl?.code !== 'gtable' && type !== 'boolean' && (
              <FormSwitch
                form={form}
                label="Repeats"
                context={`${path}.repeats`}
                onChange={(value) => handleRepeatsChange(value)}
                disabled={disabled}
              />
            )}

            {repeats && (
              <>
                {isRequired && (
                  <FormTextInput
                    form={form}
                    label="Minimum Occurrences"
                    context={`${path}.minOccurs`}
                    type="number"
                    min="1"
                    onChange={(value) => handleMinOccursChange(+value)}
                    disabled={disabled}
                  />
                )}

                <FormTextInput
                  form={form}
                  label="Maximum Occurrences"
                  context={`${path}.maxOccurs`}
                  type="number"
                  min="2"
                  onChange={(value) => handleMaxOccursChange(+value)}
                  disabled={disabled}
                />
              </>
            )}

            {!isDisabledByParent() && (
              <FormSwitch form={form} label="Read Only" context={`${path}.readOnly`} disabled={disabled} />
            )}
          </>
        )}

        <Divider />
        <Text size="xl" fw={500}>
          Guidance
        </Text>
        <Divider />

        {!isDisplay && (
          <>
            {['string', 'text'].includes(type) && (
              <FormTextInput form={form} label="Entry Format" context={`${path}.entryFormat`} disabled={disabled} />
            )}

            <FormTextarea form={form} label="Help Text" context={`${path}.help`} disabled={disabled} />
          </>
        )}

        <FormTextInput
          form={form}
          label="Support Link"
          context={`${path}.supportLink`}
          type="url"
          disabled={disabled}
        />

        {type !== 'display' && type !== 'group' && (
          <>
            {['string', 'text', 'integer', 'decimal', 'date', 'dateTime', 'time', 'quantity'].includes(type) && (
              <>
                {['string', 'text'].includes(type) && (
                  <>
                    <FormTextInput
                      form={form}
                      label="Min Length"
                      context={`${path}.minLength`}
                      type="number"
                      disabled={disabled}
                    />

                    <FormTextInput
                      form={form}
                      label="Max Length"
                      context={`${path}.maxLength`}
                      type="number"
                      disabled={disabled}
                    />
                  </>
                )}

                {['integer', 'decimal', 'quantity', 'date', 'dateTime', 'time'].includes(type) && (
                  <>
                    <FormTextInput
                      form={form}
                      label="Min Value"
                      context={`${path}.minValue`}
                      type={getRangeInputType(type)}
                      disabled={disabled}
                    />

                    <FormTextInput
                      form={form}
                      label="Max Value"
                      context={`${path}.maxValue`}
                      type={getRangeInputType(type)}
                      disabled={disabled}
                    />
                  </>
                )}

                {['string', 'text'].includes(type) && (
                  <FormTextInput form={form} label="Regex Pattern" context={`${path}.regex`} disabled={disabled} />
                )}
              </>
            )}
          </>
        )}

        <Divider />
        <Text size="xl" fw={500}>
          Conditional Display
        </Text>
        <Divider />

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
                      }}
                    />

                    {enableWhens[index].question && (
                      <FormSelect
                        form={form}
                        label="Operator"
                        context={`${path}.enableWhen.${index}.operator`}
                        loading={loading}
                        data={toSelectData(getApplicableQuestionnaireEnableWhenOperators(condition))}
                      />
                    )}

                    <Button
                      variant="filled"
                      color="red"
                      onClick={() => removeEnableWhen(index)}
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
            data={toSelectData(questionnaireEnableBehavior)}
            loading={loading}
            disabled={disabled}
          />
        )}

        <FormSelect
          form={form}
          label="Usage mode"
          description='Identifies that the specified element should only appear in certain "modes" of operation.'
          placeholder="Usage mode"
          context={`${path}.usageMode`}
          data={toSelectData(questionnaireUsageMode)}
          loading={loading}
          disabled={disabled}
        />
      </Stack>
    </Box>
  );
}

interface QuestionnaireItemCodesProps {
  readonly form: QuestionnaireForm;
  readonly path: string;
  readonly mutable?: boolean;
  readonly disabled?: boolean;
}

function QuestionnaireItemCodes(props: QuestionnaireItemCodesProps): JSX.Element {
  const { form, path, mutable = false, disabled = false } = props;

  const addCode = (): void => {
    form.insertListItem(path, {
      id: generateId(),
      code: '',
      display: '',
      system: '',
    });
  };

  const canAddCode = (): boolean => {
    return true;
  };

  return (
    <FormFlatCollection form={form} context={path} add={addCode} canAdd={canAddCode} disabled={disabled || !mutable}>
      {(index: number) => (
        <Group grow align="flex-start">
          <FormTextInput form={form} label="Code" context={`${path}.${index}.code`} disabled={disabled || !mutable} />
          <FormTextInput
            form={form}
            label="Display"
            context={`${path}.${index}.display`}
            disabled={disabled || !mutable}
          />
          <FormTextInput
            form={form}
            label="System"
            context={`${path}.${index}.system`}
            disabled={disabled || !mutable}
          />
        </Group>
      )}
    </FormFlatCollection>
  );
}

async function expandValueSet(medplum: MedplumClient, url: string): Promise<Coding[]> {
  const valueSet = await medplum.valueSetExpand({ url, count: 1000 });
  return flattenExpansion(valueSet.expansion?.contains ?? []);
}

function flattenExpansion(contains: ValueSetExpansionContains[]): Coding[] {
  return contains.flatMap((item) => {
    if (item.abstract) {
      return flattenExpansion(item.contains ?? []);
    }
    return [{ code: item.code, display: item.display, system: item.system }];
  });
}

function toSelectData(codings: Coding[]): { value: string; label: string }[] {
  return codings.map((coding) => ({ value: coding.code as string, label: coding.display ?? (coding.code as string) }));
}

function getTitle(selectedItem: ExtendedQuestionnaireItem | undefined, type: string): string {
  if (!selectedItem) {
    return ' ';
  }
  if (type === 'display' || type === 'group') {
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  }
  return 'Question';
}

function getInitialInputType(type: string): 'number' | 'date' | 'datetime-local' | 'time' | 'text' {
  if (type === 'integer' || type === 'decimal') {
    return 'number';
  }
  if (type === 'date') {
    return 'date';
  }
  if (type === 'dateTime') {
    return 'datetime-local';
  }
  if (type === 'time') {
    return 'time';
  }
  return 'text';
}

function getRangeInputType(type: string): 'number' | 'date' | 'time' | 'text' {
  if (type === 'integer' || type === 'decimal') {
    return 'number';
  }
  if (type === 'date' || type === 'dateTime') {
    return 'date';
  }
  if (type === 'time') {
    return 'time';
  }
  return 'text';
}
