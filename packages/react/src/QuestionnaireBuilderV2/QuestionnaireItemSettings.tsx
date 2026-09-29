// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Accordion,
  ActionIcon,
  Alert,
  Box,
  Button,
  Card,
  Code,
  Divider,
  Group,
  Loader,
  Stack,
  Text,
} from '@mantine/core';
import type { MedplumClient } from '@medplum/core';
import { generateId, HTTP_HL7_ORG, LOINC, UCUM } from '@medplum/core';
import type {
  Coding,
  QuestionnaireItemAnswerOption,
  ResourceType,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconList, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { ResourceTypeInput } from '../ResourceTypeInput/ResourceTypeInput';
import { ValueSetAutocomplete } from '../ValueSetAutocomplete/ValueSetAutocomplete';
import type {
  ExtendedQuestionnaireItem,
  ExtendedQuestionnaireItemAnswerOption,
  ExtendedQuestionnaireItemEnableWhen,
  ItemControlCodes,
} from './QuestionnaireBuilderV2.utils';
import {
  createManualAnswerOption,
  findFormItemByLinkId,
  fromFhirAnswerOptions,
  getAnswerItems,
  getAnswerOptionLabel,
  getAnswerOptionProblems,
  getChoiceValueKey,
  getItemControlOptions,
  getLocalAnswerOptionSystem,
  getValueByPath,
  hasFixedItemControl,
  isCodedAnswerOption,
  isManualAnswerOption,
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

/** FHIR's item control code system: `group`, `text` and `question` at the top, their controls under them. */
const ITEM_CONTROL_SYSTEM = `${HTTP_HL7_ORG}/fhir/questionnaire-item-control`;

/** FHIR's item type code system: `group`, `display` and `question` at the top, the question types under `question`. */
const ITEM_TYPE_SYSTEM = `${HTTP_HL7_ORG}/fhir/item-type`;

const VALUE_SET_URLS = {
  questionnaireEnableOperator: `${HTTP_HL7_ORG}/fhir/ValueSet/questionnaire-enable-operator`,
  questionnaireEnableBehavior: `${HTTP_HL7_ORG}/fhir/ValueSet/questionnaire-enable-behavior`,
  questionnaireUsageMode: `${HTTP_HL7_ORG}/fhir/ValueSet/questionnaire-usage-mode`,
  questionnaireDisplayCategory: `${HTTP_HL7_ORG}/fhir/ValueSet/questionnaire-display-category`,
} as const;

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
  const [itemControlCodes, setItemControlCodes] = useState<ItemControlCodes>();
  const [questionnaireUsageMode, setQuestionnaireUsageMode] = useState<Coding[]>([]);
  const [questionnaireDisplayCategory, setQuestionnaireDisplayCategory] = useState<Coding[]>([]);

  useEffect(() => {
    const loadValueSets = async (): Promise<void> => {
      try {
        const [
          itemTypeValueSet,
          questionnaireEnableOperatorValueSet,
          questionnaireEnableBehaviorValueSet,
          itemControlCodeSystem,
          questionnaireUsageModeValueSet,
          questionnaireDisplayCategoryValueSet,
        ] = await Promise.all([
          loadQuestionTypes(medplum),
          expandValueSet(medplum, VALUE_SET_URLS.questionnaireEnableOperator),
          expandValueSet(medplum, VALUE_SET_URLS.questionnaireEnableBehavior),
          loadItemControlCodes(medplum),
          expandValueSet(medplum, VALUE_SET_URLS.questionnaireUsageMode),
          expandValueSet(medplum, VALUE_SET_URLS.questionnaireDisplayCategory),
        ]);

        setItemType(itemTypeValueSet);
        setQuestionnaireEnableOperator(questionnaireEnableOperatorValueSet);
        setQuestionnaireEnableBehavior(questionnaireEnableBehaviorValueSet);
        setItemControlCodes(itemControlCodeSystem);
        setQuestionnaireUsageMode(questionnaireUsageModeValueSet);
        setQuestionnaireDisplayCategory(questionnaireDisplayCategoryValueSet);
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

  // Several initial values only for a repeating question, and no more than its maximum occurrences.
  const canAddInitial = (): boolean => {
    const maxOccurs = getValueByPath(form.getValues(), `${path}.maxOccurs`);
    const initialCount = (getValueByPath(form.getValues(), `${path}.initial`) ?? []).length;
    return !maxOccurs || initialCount < +maxOccurs;
  };

  const path = selectedItem.path;
  const type = getValueByPath(form.getValues(), `${path}.type`);
  const isGroup = type === 'group';
  // A page is a group whose item control makes it a page: the control is fixed, and a page does not repeat.
  // Pages, headers and footers are what their item control makes them: it is fixed, and they do not repeat.
  const hasFixedControl = hasFixedItemControl(getValueByPath(form.getValues(), path));
  const isDisplay = type === 'display';
  const isChoice = type === 'choice' || type === 'open-choice';
  const repeats = getValueByPath(form.getValues(), `${path}.repeats`);
  const isRequired = getValueByPath(form.getValues(), `${path}.required`);
  const itemControl = getValueByPath(form.getValues(), `${path}.itemControl`);
  const isSlider = (type === 'integer' || type === 'decimal') && itemControl?.code === 'slider';
  const answerOptions = (getValueByPath(form.getValues(), `${path}.answerOption`) ||
    []) as ExtendedQuestionnaireItemAnswerOption[];
  const answerValueSet: string | undefined = getValueByPath(form.getValues(), `${path}.answerValueSet`);
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

  // FHIR allows answer options or a value set, not both: listed options replace a value set.
  const setAnswerOptions = (options: ExtendedQuestionnaireItemAnswerOption[]): void => {
    form.setFieldValue(`${path}.answerOption`, options);
    form.setFieldValue(`${path}.answerValueSet`, undefined);
  };

  const addAnswerOption = (): void => {
    setAnswerOptions([...answerOptions, createManualAnswerOption(answerOptions, localAnswerSystem)]);
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

    // Walks group repetitions and the follow-up items of question answers.
    for (const answer of answers) {
      for (const answerItem of getAnswerItems(answer) ?? []) {
        if (answerItem.linkId === selectedItem?.linkId) {
          if (applyChange) {
            applyChange(answerItem);
          }
        } else {
          syncAnswers(answerItem, applyChange);
        }
      }
    }
  };

  const handleInitialInputChange = (value: any, index: number): void => {
    // The answers of a nested item are in copies under its ancestors' answers.
    const isNested = !!selectedItem?.parent;

    const applyChange = (item: ExtendedQuestionnaireItem): void => {
      const path = item.answerPath;
      const answerArray: { value: any }[] = getValueByPath(form.getValues(), `${path}.answer`) ?? [];

      if (index >= 0 && index < answerArray.length) {
        const current = answerArray[index].value;
        if (item.type === 'quantity') {
          // The initial value sets the number; a unit already chosen is kept.
          answerArray[index].value = { ...(current && typeof current === 'object' ? current : {}), value: +value };
        } else {
          answerArray[index].value = item.type === 'integer' || item.type === 'decimal' ? +value : value;
        }
        form.setFieldValue(`${path}.answer`, answerArray);
      }
    };

    if (isNested) {
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
    const isNested = !!parent;
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

    if (isNested) {
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
    const isNested = !!parent;

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

    if (isNested) {
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
    const isNested = !!parent;

    const initialArray = getValueByPath(form.getValues(), `${selectedItem.path}.initial`) ?? [];
    if (initialArray.length > maxOccurs) {
      form.setFieldValue(`${selectedItem.path}.initial`, initialArray.slice(0, maxOccurs));
    }

    const applyChange = (item: ExtendedQuestionnaireItem): void => {
      const path = item.answerPath;
      const answerArray = getValueByPath(form.getValues(), `${path}.answer`) ?? [];
      let i = answerArray.length;

      while (i-- > maxOccurs) {
        answerArray.pop();
        form.setFieldValue(`${path}.answer`, answerArray);
      }
    };

    if (isNested) {
      const root = findRootGroup(selectedItem);
      syncAnswers(root, applyChange);
    } else {
      applyChange(selectedItem);
    }
  };

  const itemControlOptions = itemControlCodes
    ? getItemControlOptions(itemControlCodes, getValueByPath(form.getValues(), path) ?? selectedItem)
    : [];

  return (
    <Box p={8}>
      <Stack gap="md">
        <Divider />
        <Text size="xl" fw={500}>
          {hasFixedControl ? (itemControl?.display ?? 'Page') : getTitle(selectedItem, type)}
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

        {isDisplay && (
          <FormSelect
            form={form}
            label="Display category"
            description="What the text is for; the form shows instructions, security notices and help each in their own style."
            placeholder="None"
            context={`${path}.displayCategory`}
            data={toSelectData(questionnaireDisplayCategory)}
            loading={loading}
            disabled={disabled}
            value={getValueByPath(form.getValues(), `${path}.displayCategory`)?.code ?? null}
            onChange={(code) => {
              const coding = questionnaireDisplayCategory.find((category) => category.code === code);
              form.setFieldValue(
                `${path}.displayCategory`,
                coding ? { system: coding.system, code: coding.code, display: coding.display } : {}
              );
            }}
          />
        )}

        {!isDisplay && !isGroup && (
          <>
            <FormSelect
              form={form}
              label="Type"
              context={`${path}.type`}
              loading={loading}
              data={toSelectData(itemType)}
            />

            {/* A reference or attachment answer is picked or uploaded in the form, not typed as an initial value. */}
            {!['choice', 'open-choice', 'reference', 'attachment'].includes(type) && answerOptions.length === 0 && (
              <FormFlatCollection
                form={form}
                context={`${path}.initial`}
                add={addInitial}
                addable={!!repeats}
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

            {type === 'reference' && <QuestionnaireReferenceTypes form={form} path={path} disabled={disabled} />}

            {type === 'quantity' && (
              <QuestionnaireUnitInput
                form={form}
                context={`${path}.unitOption`}
                label="Allowed units"
                description="The units the respondent chooses from. With one unit, the unit is fixed; with none, the respondent types a unit."
                multiple
                disabled={disabled}
              />
            )}

            {(type === 'integer' || type === 'decimal') && (
              <QuestionnaireUnitInput
                form={form}
                context={`${path}.unit`}
                label="Unit"
                description="The unit of the number, shown next to the answer."
                disabled={disabled}
              />
            )}
          </>
        )}

        {!hasFixedControl && itemControlOptions.length > 0 && (
          <>
            <FormSelect
              form={form}
              label="Item Control"
              placeholder="Item Control"
              context={`${path}.itemControl`}
              data={toSelectData(itemControlOptions)}
              loading={loading}
              disabled={disabled}
              value={itemControl?.code ?? getDefaultItemControl(type, !!repeats)}
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
                defaultValue="vertical"
                disabled={disabled}
              />
            )}
          </>
        )}

        {isChoice && answerValueSet && answerOptions.length === 0 && (
          <Card withBorder>
            <Stack gap="xs">
              <Text fw={500}>Answers from a value set</Text>
              <Text size="sm">
                The respondent searches the codes of <Code>{answerValueSet}</Code>.
              </Text>
              <Group>
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconTrash size={16} />}
                  onClick={() => form.setFieldValue(`${path}.answerValueSet`, undefined)}
                  disabled={disabled}
                >
                  Remove value set
                </Button>
              </Group>
            </Stack>
          </Card>
        )}
        {isChoice && !answerValueSet && answerOptions.length === 0 && (
          <Alert color="blue">No answer options added. Add at least one option for choice questions.</Alert>
        )}
        {isChoice && answerOptions.length > 0 && (
          <Card withBorder>
            <Card.Section withBorder inheritPadding py="xs">
              <Text fw={500}>Answer Options</Text>
            </Card.Section>
            <Card.Section inheritPadding py="md">
              <Accordion value={openedAnswerOption} onChange={setOpenedAnswerOption}>
                {answerOptions.map((answer: ExtendedQuestionnaireItemAnswerOption, index: number) => {
                  // Coded answers (LOINC, a value set) keep their code, text and score, so they mean the same everywhere.
                  const isCodedAnswer = !isManualAnswerOption(answer, localAnswerSystem);
                  // A plain value (string, integer, date, time) is its own text and code.
                  const isPlainValue = !isCodedAnswerOption(answer);
                  return (
                    <Accordion.Item key={answer.id ?? index} value={String(index)}>
                      <Accordion.Control>{getAnswerOptionLabel(answer)}</Accordion.Control>
                      <Accordion.Panel>
                        <Stack gap="md">
                          {isPlainValue && answer.valueType === 'valueReference' && (
                            <Text size="sm">Reference to {answer.value?.reference}; it cannot be edited here.</Text>
                          )}
                          {isPlainValue && answer.valueType !== 'valueReference' && (
                            <FormTextInput
                              form={form}
                              label="Value"
                              context={`${path}.answerOption.${index}.value`}
                              type={getPlainOptionInputType(answer.valueType)}
                              required={true}
                              disabled={disabled}
                            />
                          )}
                          {!isPlainValue && isCodedAnswer && (
                            <Text size="xs" c="dimmed">
                              {answer.value?.system === LOINC ? 'LOINC answer' : 'Coded answer'}: its text, code and
                              score are fixed so it means the same everywhere.
                            </Text>
                          )}
                          {!isPlainValue && (
                            <FormTextInput
                              form={form}
                              label="Display Text"
                              context={`${path}.answerOption.${index}.value.display`}
                              required={!isCodedAnswer}
                              disabled={disabled || isCodedAnswer}
                            />
                          )}

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

                          {!isPlainValue && (
                            <>
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
                            </>
                          )}

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
              onSelect={(answerOption) => setAnswerOptions(fromFhirAnswerOptions(answerOption))}
            />
            <QuestionnaireValueSetAnswersDrawer
              opened={valueSetSearchOpened}
              onClose={() => setValueSetSearchOpened(false)}
              replaces={answerOptions.length > 0}
              onSelect={(answerOption) => setAnswerOptions(fromFhirAnswerOptions(answerOption))}
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

            {!hasFixedControl && selectedItem.parent?.itemControl?.code !== 'gtable' && type !== 'boolean' && (
              <FormSwitch
                form={form}
                label="Repeats"
                context={`${path}.repeats`}
                onChange={(value) => handleRepeatsChange(value)}
                disabled={disabled}
              />
            )}

            {repeats && !hasFixedControl && (
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

            <FormRadioGroup
              form={form}
              label="Show help as"
              context={`${path}.helpDisplay`}
              options={[
                { value: 'help', label: 'Help button' },
                { value: 'flyover', label: 'On hover' },
                { value: 'inline', label: 'Below the question' },
              ]}
              defaultValue="help"
              disabled={disabled}
            />

            {/* Texts shown with the answer, each saved as a display item with that control. */}
            {!isGroup && (
              <FormTextInput
                form={form}
                label="Prompt"
                description="Shown below the answer, e.g. 'Drag the slider'."
                context={`${path}.displayTexts.prompt`}
                disabled={disabled}
              />
            )}
            {['string', 'integer', 'decimal'].includes(type) && (
              <FormTextInput
                form={form}
                label="Unit label"
                description="Shown next to the answer, e.g. 'per day'. A coded Unit is shown instead, when set."
                context={`${path}.displayTexts.unit`}
                disabled={disabled}
              />
            )}
            {['integer', 'decimal', 'choice', 'open-choice'].includes(type) && (
              <>
                <FormTextInput
                  form={form}
                  label="Lower label"
                  description="Shown at the start of a scale, e.g. 'No pain'."
                  context={`${path}.displayTexts.lower`}
                  disabled={disabled}
                />
                <FormTextInput
                  form={form}
                  label="Upper label"
                  description="Shown at the end of a scale, e.g. 'Worst pain'."
                  context={`${path}.displayTexts.upper`}
                  disabled={disabled}
                />
              </>
            )}
          </>
        )}

        <FormTextInput
          form={form}
          label="Support Link"
          context={`${path}.supportLink`}
          type="url"
          disabled={disabled}
        />

        <FormTextarea
          form={form}
          label="Design Note"
          description="For the people building this questionnaire; never shown to respondents."
          context={`${path}.designNote`}
          disabled={disabled}
        />

        {type !== 'display' && type !== 'group' && (
          <>
            {['string', 'text', 'url', 'integer', 'decimal', 'date', 'dateTime', 'time', 'quantity'].includes(type) && (
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

                {type === 'url' && (
                  <FormTextInput
                    form={form}
                    label="Max Length"
                    context={`${path}.maxLength`}
                    type="number"
                    disabled={disabled}
                  />
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
                        // An answer to another question means nothing for this one.
                        form.setFieldValue(`${path}.enableWhen.${index}.answer`, '');
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

interface QuestionnaireReferenceTypesProps {
  readonly form: QuestionnaireForm;
  readonly path: string;
  readonly disabled?: boolean;
}

/**
 * The resource types a reference question can point to, one ResourceTypeInput each, as in Medplum's
 * QuestionnaireBuilder. With none, any resource can be referenced.
 * @param props - The QuestionnaireReferenceTypes React props.
 * @returns The QuestionnaireReferenceTypes React node.
 */
function QuestionnaireReferenceTypes(props: QuestionnaireReferenceTypesProps): JSX.Element {
  const { form, path, disabled } = props;
  const context = `${path}.referenceResource`;
  const targetTypes: string[] = getValueByPath(form.getValues(), context) ?? [];
  const setTargetTypes = (types: string[]): void => form.setFieldValue(context, types);

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Resource types
      </Text>
      <Text size="xs" c="dimmed">
        The kinds of resource the answer can point to. With none, any resource can be picked.
      </Text>
      {targetTypes.map((targetType, index) => (
        <Group key={`${index}-${targetType}`} gap="xs" wrap="nowrap">
          <Box flex={1}>
            <ResourceTypeInput
              name={`resourceType-${index}`}
              placeholder="Resource Type"
              defaultValue={(targetType || undefined) as ResourceType | undefined}
              disabled={disabled}
              onChange={(value) => setTargetTypes(targetTypes.map((type, i) => (i === index ? (value ?? '') : type)))}
            />
          </Box>
          <ActionIcon
            variant="filled"
            color="red"
            size="input-sm"
            aria-label="Remove resource type"
            disabled={disabled}
            onClick={() => setTargetTypes(targetTypes.filter((_, i) => i !== index))}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      ))}
      <Group>
        <Button
          variant="default"
          size="xs"
          leftSection={<IconPlus size={16} />}
          disabled={disabled}
          onClick={() => setTargetTypes([...targetTypes, ''])}
        >
          Add resource type
        </Button>
      </Group>
    </Stack>
  );
}

/** Common UCUM units, the unit codes Medplum uses (UCUM); units not in it can be typed as UCUM codes. */
const UCUM_COMMON_VALUE_SET = 'http://hl7.org/fhir/ValueSet/ucum-common';

interface QuestionnaireUnitInputProps {
  readonly form: QuestionnaireForm;
  readonly context: string;
  readonly label: string;
  readonly description: string;
  /** Several units (questionnaire-unitOption) rather than one (questionnaire-unit). */
  readonly multiple?: boolean;
  readonly disabled?: boolean;
}

/**
 * Picks UCUM units for a question: searched in the common UCUM units, or typed as a UCUM code (e.g. mm[Hg]).
 * @param props - The QuestionnaireUnitInput React props.
 * @returns The QuestionnaireUnitInput React node.
 */
function QuestionnaireUnitInput(props: QuestionnaireUnitInputProps): JSX.Element {
  const { form, context, label, description, multiple, disabled } = props;
  const value = getValueByPath(form.getValues(), context);
  const units: Coding[] = (multiple ? (value ?? []) : [value]).filter(Boolean);

  return (
    <ValueSetAutocomplete
      key={context}
      label={label}
      description={description}
      binding={UCUM_COMMON_VALUE_SET}
      creatable
      clearable
      disabled={disabled}
      maxValues={multiple ? undefined : 1}
      placeholder="Search units, or type a UCUM code"
      defaultValue={units.map((unit) => ({ system: UCUM, code: unit.code, display: unit.display ?? unit.code }))}
      onChange={(selected) => {
        const codings = selected.map((entry) => ({
          system: UCUM,
          code: entry.code,
          display: entry.display ?? entry.code,
        }));
        form.setFieldValue(context, multiple ? codings : (codings[0] ?? null));
      }}
    />
  );
}

interface QuestionnaireEnableWhenAnswerProps {
  readonly form: QuestionnaireForm;
  readonly context: string;
  /** The question the condition checks (its current definition). */
  readonly question: ExtendedQuestionnaireItem;
  readonly disabled?: boolean;
}

/**
 * The answer a condition compares the question's answer with, entered as the question is answered: one of its
 * options, yes or no, a number, a date or time, or text.
 * @param props - The QuestionnaireEnableWhenAnswer React props.
 * @returns The QuestionnaireEnableWhenAnswer React node.
 */
function QuestionnaireEnableWhenAnswer(props: QuestionnaireEnableWhenAnswerProps): JSX.Element {
  const { form, context, question, disabled } = props;
  const answer = getValueByPath(form.getValues(), context);
  const type = question.type;

  if (type === 'choice' || type === 'open-choice') {
    const options: ExtendedQuestionnaireItemAnswerOption[] = question.answerOption ?? [];
    if (question.answerValueSet && options.length === 0) {
      return (
        <ValueSetAutocomplete
          label="Answer"
          binding={question.answerValueSet}
          maxValues={1}
          creatable={false}
          disabled={disabled}
          defaultValue={answer?.code ? [{ system: answer.system, code: answer.code, display: answer.display }] : []}
          onChange={(selected) =>
            form.setFieldValue(
              context,
              selected[0] ? { system: selected[0].system, code: selected[0].code, display: selected[0].display } : ''
            )
          }
        />
      );
    }
    return (
      <FormSelect
        form={form}
        label="Answer"
        context={context}
        required={true}
        disabled={disabled}
        data={options.map((option) => ({
          value: getChoiceValueKey(option.value),
          label: getAnswerOptionLabel(option),
        }))}
        value={answer === '' || answer === undefined || answer === null ? null : getChoiceValueKey(answer)}
        onChange={(key) =>
          form.setFieldValue(context, options.find((option) => getChoiceValueKey(option.value) === key)?.value ?? '')
        }
      />
    );
  }

  if (type === 'boolean') {
    return (
      <FormSelect
        form={form}
        label="Answer"
        context={context}
        disabled={disabled}
        data={[
          { value: 'true', label: 'Yes' },
          { value: 'false', label: 'No' },
        ]}
        value={answer === false ? 'false' : 'true'}
        onChange={(value) => form.setFieldValue(context, value !== 'false')}
      />
    );
  }

  const inputType = getEnableWhenAnswerInputType(type);
  if (!inputType) {
    return (
      <Text size="sm" c="dimmed">
        A condition on this type of question can only check whether it is answered.
      </Text>
    );
  }
  return (
    <FormTextInput form={form} label="Answer" context={context} type={inputType} required={true} disabled={disabled} />
  );
}

function getEnableWhenAnswerInputType(
  type: string
): 'number' | 'date' | 'datetime-local' | 'time' | 'text' | undefined {
  if (type === 'integer' || type === 'decimal' || type === 'quantity') {
    return 'number';
  }
  if (type === 'date' || type === 'time') {
    return type;
  }
  if (type === 'dateTime') {
    return 'datetime-local';
  }
  if (type === 'string' || type === 'text' || type === 'url') {
    return 'text';
  }
  return undefined;
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

/**
 * Loads the item controls from FHIR's item control code system, by the kind of item they are for: its top-level
 * (abstract) codes `group`, `text` and `question`.
 * @param medplum - The Medplum client.
 * @returns The item controls, by kind.
 */
async function loadItemControlCodes(medplum: MedplumClient): Promise<ItemControlCodes> {
  const codeSystem = await medplum.searchOne('CodeSystem', { url: ITEM_CONTROL_SYSTEM });
  const childrenOf = (code: string): Coding[] =>
    (codeSystem?.concept?.find((concept) => concept.code === code)?.concept ?? []).map((concept) => ({
      system: ITEM_CONTROL_SYSTEM,
      code: concept.code,
      display: concept.display,
    }));
  return { group: childrenOf('group'), text: childrenOf('text'), question: childrenOf('question') };
}

/**
 * Loads the question types: the codes under `question` in FHIR's item type code system. Its hierarchy is not declared
 * as is-a, so a value set expansion is flat (and cannot filter by it); the code system's own nesting is read instead.
 * @param medplum - The Medplum client.
 * @returns The question types.
 */
async function loadQuestionTypes(medplum: MedplumClient): Promise<Coding[]> {
  const codeSystem = await medplum.searchOne('CodeSystem', { url: ITEM_TYPE_SYSTEM });
  const question = codeSystem?.concept?.find((concept) => concept.code === 'question');
  return (question?.concept ?? []).map((concept) => ({
    system: ITEM_TYPE_SYSTEM,
    code: concept.code,
    display: concept.display,
  }));
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
  if (type === 'integer' || type === 'decimal' || type === 'quantity') {
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

function getPlainOptionInputType(valueType: string | undefined): 'number' | 'date' | 'time' | 'text' {
  if (valueType === 'valueInteger') {
    return 'number';
  }
  if (valueType === 'valueDate') {
    return 'date';
  }
  if (valueType === 'valueTime') {
    return 'time';
  }
  return 'text';
}

/**
 * The item control an item is rendered with when it has none: a group as a list, a number in a text box, a choice as
 * radio buttons (checkboxes when it repeats).
 * @param type - The item type.
 * @param repeats - True if the item repeats.
 * @returns The item control code, or null when the renderer's default has no item control of its own.
 */
function getDefaultItemControl(type: string, repeats: boolean): string | null {
  if (type === 'group') {
    return 'list';
  }
  if (type === 'display') {
    return 'inline';
  }
  if (type === 'choice' || type === 'open-choice') {
    return repeats ? 'check-box' : 'radio-button';
  }
  if (type === 'integer' || type === 'decimal') {
    return 'text-box';
  }
  return null;
}

function getRangeInputType(type: string): 'number' | 'date' | 'datetime-local' | 'time' | 'text' {
  if (type === 'integer' || type === 'decimal' || type === 'quantity') {
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
