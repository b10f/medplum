// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Anchor,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  MultiSelect,
  NativeSelect,
  Popover,
  Radio,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import type { Coding, QuestionnaireItem } from '@medplum/fhirtypes';
import type { QuestionnaireFormPaginationState } from '@medplum/react-hooks';
import { IconExternalLink, IconInfoCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX, ReactNode } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { QuestionnaireFormStepper } from '../QuestionnaireForm/QuestionnaireFormStepper';
import type {
  ExtendedQuestionnaireItem,
  ExtendedQuestionnaireItemAnswer,
  ExtendedQuestionnaireItemAnswerOption,
} from './QuestionnaireBuilderV2.utils';
import {
  evaluateEnableWhen,
  findRootItem,
  getPageItems,
  getValueByPath,
  isEmptyAnswerValue,
  isHorizontalChoiceLayout,
  rebuildFollowUpAnswers,
  validateAnswerValue,
  validateFormAnswers,
} from './QuestionnaireBuilderV2.utils';
import type { QuestionnaireForm } from './QuestionnaireFormContext';
import { useQuestionnaireFormContext } from './QuestionnaireFormContext';
import classes from './QuestionnairePreview.module.css';

type AddAnswer = (item: ExtendedQuestionnaireItem, original?: ExtendedQuestionnaireItem) => void;

export interface QuestionnairePreviewProps {
  readonly items: ExtendedQuestionnaireItem[];
  readonly selectedItem?: ExtendedQuestionnaireItem | undefined;
  readonly addAnswer: AddAnswer;
  readonly ignoreValidation?: boolean;
  readonly submitButtonText?: string;
  /** Hides the Submit (and, when paginated, Back/Next) buttons, e.g. for a read-only preview. */
  readonly excludeButtons?: boolean;
  /** Called on submit once all shown answers are valid. */
  readonly onSubmit?: () => void;
}

export function QuestionnairePreview(props: QuestionnairePreviewProps): JSX.Element {
  const { items, selectedItem, addAnswer, ignoreValidation, submitButtonText, excludeButtons, onSubmit } = props;
  const form = useQuestionnaireFormContext();
  const pageItems = getPageItems(items);
  const selectedLinkId = selectedItem?.linkId;
  const [activePage, setActivePage] = useState(0);
  const [prevSelectedLinkId, setPrevSelectedLinkId] = useState(selectedLinkId);

  // Show the page that holds the newly selected item, so it can be highlighted and scrolled to.
  if (selectedLinkId !== prevSelectedLinkId) {
    setPrevSelectedLinkId(selectedLinkId);
    const rootLinkId = selectedItem ? findRootItem(selectedItem).linkId : undefined;
    const pageIndex = pageItems?.findIndex((page) => page.linkId === rootLinkId) ?? -1;
    if (pageIndex >= 0) {
      setActivePage(pageIndex);
    }
  }

  const currentPage = pageItems ? Math.min(activePage, pageItems.length - 1) : 0;

  /**
   * Validates the given items, shows their errors and reports whether they are valid.
   * @param scope - The items to validate.
   * @returns True if the items have no errors.
   */
  const validate = (scope: ExtendedQuestionnaireItem[]): boolean => {
    if (ignoreValidation) {
      return true;
    }
    const errors = validateFormAnswers(form.getValues(), scope);
    form.setErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextPage = (): void => {
    if (pageItems && validate([pageItems[currentPage]])) {
      setActivePage(currentPage + 1);
    }
  };

  const handleSubmit = (): void => {
    if (pageItems) {
      const invalidPage = pageItems.findIndex((page) => !validate([page]));
      if (invalidPage >= 0) {
        setActivePage(invalidPage);
        return;
      }
    } else if (!validate(items)) {
      return;
    }
    onSubmit?.();
  };

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    const element = document.querySelector(`[data-preview-link-id="${CSS.escape(selectedItem.linkId)}"]`);
    const scrollContainer = element?.closest('.mantine-ScrollArea-viewport');

    if (element && scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const scrollOffset =
        elementRect.top -
        containerRect.top +
        scrollContainer.scrollTop -
        containerRect.height / 2 +
        elementRect.height / 2;

      scrollContainer.scrollTo({ top: scrollOffset, behavior: 'smooth' });
    }
  }, [selectedItem]);

  return (
    <div className={classes.root}>
      <Card withBorder>
        <Card.Section withBorder inheritPadding py="md">
          <Title order={3} ta="center">
            {form.getValues().title || 'Untitled'}
          </Title>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <Form onSubmit={handleSubmit}>
            {pageItems ? (
              <>
                <QuestionnaireFormStepper
                  excludeButtons
                  formState={
                    {
                      pages: pageItems.map((page, index) => ({
                        linkId: page.linkId,
                        title: page.text ?? `Page ${index + 1}`,
                        group: page as unknown as QuestionnaireItem & { type: 'group' },
                      })),
                      activePage: currentPage,
                    } as QuestionnaireFormPaginationState
                  }
                >
                  <PreviewPage
                    key={pageItems[currentPage].linkId}
                    page={pageItems[currentPage]}
                    selectedItem={selectedItem}
                    addAnswer={addAnswer}
                    ignoreValidation={ignoreValidation}
                  />
                </QuestionnaireFormStepper>
                {/* Same layout as QuestionnaireFormStepper's buttons, with our validation instead of reportValidity. */}
                {!excludeButtons && (
                  <Group justify="flex-end" mt="xl" gap="xs">
                    {currentPage > 0 && <Button onClick={() => setActivePage(currentPage - 1)}>Back</Button>}
                    {currentPage < pageItems.length - 1 && <Button onClick={handleNextPage}>Next</Button>}
                    {currentPage === pageItems.length - 1 && (
                      <SubmitButton>{submitButtonText ?? 'Submit'}</SubmitButton>
                    )}
                  </Group>
                )}
              </>
            ) : (
              <Stack gap="md">
                {items.map((item: ExtendedQuestionnaireItem, index: number) => (
                  <PreviewItem
                    key={`${item.linkId}-${index}`}
                    item={item}
                    original={item}
                    selectedItem={selectedItem}
                    index={index}
                    addAnswer={addAnswer}
                    ignoreValidation={ignoreValidation}
                  />
                ))}
                {!excludeButtons && (
                  <Group justify="flex-end" mt="xl">
                    <SubmitButton>{submitButtonText ?? 'Submit'}</SubmitButton>
                  </Group>
                )}
              </Stack>
            )}
          </Form>
        </Card.Section>
      </Card>
    </div>
  );
}

interface PreviewPageProps {
  readonly page: ExtendedQuestionnaireItem;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly addAnswer: AddAnswer;
  readonly ignoreValidation?: boolean;
}

/**
 * A page's items, rendered without the group header and border: the stepper shows the page title.
 * @param props - The PreviewPage props.
 * @returns The PreviewPage React node.
 */
function PreviewPage(props: PreviewPageProps): JSX.Element {
  const { page, selectedItem, addAnswer, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();
  const repetitions = (page.answer ?? []) as unknown as ExtendedQuestionnaireItem[][];

  return (
    <Stack gap="md" mt="md">
      {repetitions
        .filter(Array.isArray)
        .map((answerGroup, repetitionIndex) =>
          answerGroup.map((child: ExtendedQuestionnaireItem, childIndex: number) => (
            <PreviewItem
              key={`${page.linkId}-${repetitionIndex}-${childIndex}`}
              item={child}
              original={getValueByPath(form.getValues(), child.path)}
              selectedItem={selectedItem}
              index={childIndex}
              addAnswer={addAnswer}
              ignoreValidation={ignoreValidation}
            />
          ))
        )}
    </Stack>
  );
}

interface PreviewItemProps {
  readonly item: ExtendedQuestionnaireItem;
  readonly original: ExtendedQuestionnaireItem | undefined;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly index: number;
  readonly addAnswer: AddAnswer;
  readonly ignoreValidation?: boolean;
}

function PreviewItem(props: PreviewItemProps): JSX.Element | null {
  const { item, original, selectedItem, index, addAnswer, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();

  if (!original) {
    return null;
  }

  if (original.hidden || !evaluateEnableWhen(form.getValues(), item)) {
    return null;
  }

  if (original.type === 'group') {
    return (
      <PreviewGroup
        item={item}
        original={original}
        selectedItem={selectedItem}
        index={index}
        addAnswer={addAnswer}
        ignoreValidation={ignoreValidation}
      />
    );
  } else if (original.type === 'display') {
    return (
      <PreviewSelectedItem item={item} selectedItem={selectedItem} index={index}>
        <PreviewQuestion item={item} original={original} index={index} addAnswer={addAnswer} />
        <Divider my="md" />
      </PreviewSelectedItem>
    );
  }

  const followUpProps = { selectedItem, addAnswer, ignoreValidation };

  if (isChoiceType(original.type) && original.repeats) {
    return (
      <PreviewSelectedItem item={item} selectedItem={selectedItem} index={index}>
        <Stack gap="md">
          <PreviewRepeatingChoice item={item} original={original} answerIndex={0} addAnswer={addAnswer} />
          {/* Each selected option has its own follow-up items. */}
          {(item.answer ?? []).map((answer, answerIndex) => (
            <PreviewFollowUpItems
              key={`${item.linkId}-${answer.value?.code ?? answerIndex}`}
              answer={answer}
              label={answer.value?.display}
              {...followUpProps}
            />
          ))}
        </Stack>
      </PreviewSelectedItem>
    );
  }

  return (
    <PreviewSelectedItem item={item} selectedItem={selectedItem} index={index}>
      <Stack gap="md">
        {item.answer.map((answer, answerIndex: number) => {
          const answerProps: PreviewAnswerProps = {
            item,
            original,
            answerIndex,
            addAnswer,
            ignoreValidation,
          };
          return (
            <Fragment key={`${item.linkId}-${answerIndex}`}>
              <PreviewAnswer {...answerProps} />
              <PreviewFollowUpItems answer={answer} {...followUpProps} />
            </Fragment>
          );
        })}
      </Stack>
    </PreviewSelectedItem>
  );
}

function PreviewAnswer(props: PreviewAnswerProps): JSX.Element | null {
  const type = props.original.type;
  if (['string', 'integer', 'decimal', 'quantity', 'url'].includes(type)) {
    return <PreviewInput {...props} />;
  } else if (type === 'boolean') {
    return <PreviewBoolean {...props} />;
  } else if (type === 'text') {
    return <PreviewTextarea {...props} />;
  } else if (['date', 'dateTime', 'time'].includes(type)) {
    return <PreviewDateTime {...props} />;
  } else if (isChoiceType(type)) {
    return <PreviewChoice {...props} />;
  }
  return null;
}

interface PreviewFollowUpItemsProps {
  readonly answer: ExtendedQuestionnaireItemAnswer;
  /** Names the answer the items belong to, when a question has several answers. */
  readonly label?: string;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly addAnswer: AddAnswer;
  readonly ignoreValidation?: boolean;
}

/**
 * The follow-up items of one answer of a question, shown once the question is answered.
 * @param props - The PreviewFollowUpItems props.
 * @returns The PreviewFollowUpItems React node, or null when none are shown.
 */
function PreviewFollowUpItems(props: PreviewFollowUpItemsProps): JSX.Element | null {
  const { answer, label, selectedItem, addAnswer, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();
  const values = form.getValues();

  if (isEmptyAnswerValue(answer.value)) {
    return null;
  }

  const shownItems = (answer.item ?? []).filter((child) => {
    const original: ExtendedQuestionnaireItem | undefined = getValueByPath(values, child.path);
    return original && !original.hidden && evaluateEnableWhen(values, child);
  });

  if (shownItems.length === 0) {
    return null;
  }

  return (
    <div className={classes.groupAnswers}>
      {label && (
        <Text size="sm" c="dimmed" mb="xs">
          {label}
        </Text>
      )}
      {shownItems.map((child, childIndex) => (
        <PreviewItem
          key={`${child.answerPath}-${childIndex}`}
          item={child}
          original={getValueByPath(values, child.path)}
          selectedItem={selectedItem}
          index={childIndex}
          addAnswer={addAnswer}
          ignoreValidation={ignoreValidation}
        />
      ))}
    </div>
  );
}

interface PreviewGroupProps {
  readonly item: ExtendedQuestionnaireItem;
  readonly original: ExtendedQuestionnaireItem;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly index: number;
  readonly addAnswer: AddAnswer;
  readonly ignoreValidation?: boolean;
}

function PreviewGroup(props: PreviewGroupProps): JSX.Element {
  const { item, original, selectedItem, index, addAnswer, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();

  const getOriginal = (item: ExtendedQuestionnaireItem): ExtendedQuestionnaireItem | undefined => {
    return getValueByPath(form.getValues(), item.path);
  };

  return (
    <PreviewSelectedItem item={item} selectedItem={selectedItem} index={index}>
      {item.item?.length === 0 && (
        <>
          <PreviewQuestion item={item} original={original} addAnswer={addAnswer} />
          <Divider my="xs" />
        </>
      )}

      {((item.answer ?? []) as unknown as ExtendedQuestionnaireItem[][]).map(
        (answerGroup: ExtendedQuestionnaireItem[], answerGroupIndex: number) => (
          <Fragment key={`${item.linkId}-${answerGroupIndex}`}>
            {item.item?.length !== 0 && (
              <>
                <PreviewQuestion
                  item={item}
                  original={original}
                  index={index}
                  groupIndex={answerGroupIndex}
                  addAnswer={addAnswer}
                />
                <Divider my="xs" />
              </>
            )}

            {Array.isArray(answerGroup) && (
              <div className={classes.groupAnswers}>
                {answerGroup.map((answer: ExtendedQuestionnaireItem, answerItemIndex: number) => (
                  <PreviewItem
                    key={`${item.linkId}-${answerGroupIndex}-${answerItemIndex}`}
                    item={answer}
                    original={getOriginal(answer)}
                    selectedItem={selectedItem}
                    index={answerItemIndex}
                    addAnswer={addAnswer}
                    ignoreValidation={ignoreValidation}
                  />
                ))}
              </div>
            )}
          </Fragment>
        )
      )}
    </PreviewSelectedItem>
  );
}

interface PreviewSelectedItemProps {
  readonly item: ExtendedQuestionnaireItem;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly index: number;
  readonly children: ReactNode;
}

function PreviewSelectedItem(props: PreviewSelectedItemProps): JSX.Element {
  const { item, selectedItem, index, children } = props;
  const isSelected = selectedItem?.linkId === item.linkId;

  return (
    <div
      id={`item-${item.linkId}-${index}`}
      data-preview-link-id={item.linkId}
      className={cx(classes.item, isSelected && classes.selected)}
    >
      {children}
    </div>
  );
}

interface PreviewQuestionProps {
  readonly item: ExtendedQuestionnaireItem;
  readonly original: ExtendedQuestionnaireItem;
  readonly index?: number;
  readonly groupIndex?: number;
  readonly addAnswer: AddAnswer;
}

function PreviewQuestion(props: PreviewQuestionProps): JSX.Element {
  const { item, original, index = 0, groupIndex = 0, addAnswer } = props;
  const form = useQuestionnaireFormContext();

  const title = original.prefix ? `${original.prefix} ${original.text}` : original.text;
  const repeatIndex = original.type === 'group' ? groupIndex : index;
  // A repeating choice question holds one answer per selected option, not one per repetition.
  const showIndex = item.answer?.length > 1 && !isChoiceType(original.type) ? repeatIndex + 1 : null;
  const isLastRepeat = repeatIndex + 1 === item.answer?.length;
  const canRemove = item.answer?.length > original.minOccurs;
  const canAdd = isLastRepeat && (!original.maxOccurs || item.answer?.length < +original.maxOccurs);

  const removeAnswer = (item: ExtendedQuestionnaireItem, index: number): void => {
    const path = item.answerPath;

    if (path) {
      const answerArray = getValueByPath(form.getValues(), `${path}.answer`) || [];
      const newArray = [...answerArray];
      newArray.splice(index, 1);
      form.setFieldValue(`${path}.answer`, newArray);
      rebuildFollowUpAnswers(form, original);
    }
  };

  const required = original.required && (
    <Text component="span" c="red">
      *
    </Text>
  );

  return (
    <Group gap="xs" flex={1} align="center">
      <div className={classes.questionText}>
        {original.type === 'group' || original.type === 'display' ? (
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

      {original.supportLink && (
        <Tooltip label={`For more information visit: ${original.supportLink}`} maw={300}>
          <Anchor href={original.supportLink} target="_blank" rel="noopener noreferrer" size="sm">
            <Group gap={4}>
              Help
              <IconExternalLink size={14} />
            </Group>
          </Anchor>
        </Tooltip>
      )}

      {original.help && (
        <Popover width={256} position="bottom" withArrow>
          <Popover.Target>
            <Tooltip label="Help">
              <ActionIcon variant="subtle" size="sm" aria-label="Help">
                <IconInfoCircle size={16} />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <Text size="sm">{original.help}</Text>
          </Popover.Dropdown>
        </Popover>
      )}

      {original.repeats && !original.readOnly && original.type !== 'choice' && original.type !== 'open-choice' && (
        <Group gap="xs">
          {canRemove && (
            <ActionIcon
              variant="filled"
              color="red"
              size="sm"
              aria-label="Remove answer"
              onClick={() => removeAnswer(item, repeatIndex)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          )}

          {canAdd && (
            <ActionIcon variant="outline" size="sm" aria-label="Add answer" onClick={() => addAnswer(item, original)}>
              <IconPlus size={16} />
            </ActionIcon>
          )}
        </Group>
      )}
    </Group>
  );
}

interface PreviewAnswerProps {
  readonly item: ExtendedQuestionnaireItem;
  readonly original: ExtendedQuestionnaireItem;
  readonly answerIndex: number;
  readonly addAnswer: AddAnswer;
  readonly ignoreValidation?: boolean;
}

/**
 * Writes an answer value and shows its constraint error (length, regex, range) right away.
 * @param form - The questionnaire form.
 * @param fieldPath - The form path of the answer value.
 * @param original - The item definition holding the constraints.
 * @param value - The new value.
 * @param ignoreValidation - Skips validation when true.
 */
function setAnswerValue(
  form: QuestionnaireForm,
  fieldPath: string,
  original: ExtendedQuestionnaireItem,
  value: any,
  ignoreValidation?: boolean
): void {
  form.setFieldValue(fieldPath, value);
  const message = ignoreValidation ? undefined : validateAnswerValue(original, value);
  if (message) {
    form.setFieldError(fieldPath, message);
  }
}

function getFieldPath(item: ExtendedQuestionnaireItem, answerIndex: number): string {
  return `${item.answerPath}.answer.${answerIndex}.value`;
}

function PreviewInput(props: PreviewAnswerProps): JSX.Element {
  const { item, original, answerIndex, addAnswer, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();
  const fieldPath = getFieldPath(item, answerIndex);
  const value = getValueByPath(form.getValues(), fieldPath);
  const type = original.type;
  const isSlider = (type === 'integer' || type === 'decimal') && original.itemControl?.code === 'slider';
  const minValue = Number(original.minValue ?? 0);
  const maxValue = Number(original.maxValue ?? 100);
  const sliderStepValue = Number(original.sliderStepValue ?? 1);
  const unit = original.unit;
  const label = <PreviewQuestion item={item} original={original} index={answerIndex} addAnswer={addAnswer} />;

  if (isSlider) {
    return (
      <Stack gap="xs">
        {label}
        <Slider
          value={Number(value) || minValue}
          min={minValue}
          max={maxValue}
          step={sliderStepValue}
          onChange={(val) => form.setFieldValue(fieldPath, val)}
        />
      </Stack>
    );
  }

  if (type === 'quantity' || (type === 'integer' && unit) || (type === 'decimal' && unit)) {
    return (
      <TextInput
        label={label}
        type="number"
        step="any"
        value={value ?? ''}
        error={form.errors[fieldPath]}
        onChange={(e) => setAnswerValue(form, fieldPath, original, e.currentTarget.value, ignoreValidation)}
      />
    );
  }

  return (
    <TextInput
      label={label}
      type={type === 'integer' || type === 'decimal' ? 'number' : 'text'}
      step={type === 'decimal' ? 'any' : undefined}
      placeholder={original.entryFormat}
      maxLength={!ignoreValidation && original.maxLength ? original.maxLength : undefined}
      value={value ?? ''}
      error={form.errors[fieldPath]}
      onChange={(e) => setAnswerValue(form, fieldPath, original, e.currentTarget.value, ignoreValidation)}
    />
  );
}

function PreviewTextarea(props: PreviewAnswerProps): JSX.Element {
  const { item, original, answerIndex, addAnswer, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();
  const fieldPath = getFieldPath(item, answerIndex);

  return (
    <Textarea
      label={<PreviewQuestion item={item} original={original} index={answerIndex} addAnswer={addAnswer} />}
      placeholder={original.entryFormat}
      rows={6}
      maxLength={!ignoreValidation && original.maxLength ? original.maxLength : undefined}
      value={getValueByPath(form.getValues(), fieldPath) ?? ''}
      error={form.errors[fieldPath]}
      onChange={(e) => setAnswerValue(form, fieldPath, original, e.currentTarget.value, ignoreValidation)}
    />
  );
}

function PreviewBoolean(props: PreviewAnswerProps): JSX.Element {
  const { item, original, answerIndex, addAnswer } = props;
  const form = useQuestionnaireFormContext();
  const fieldPath = getFieldPath(item, answerIndex);

  return (
    <Group justify="space-between">
      <PreviewQuestion item={item} original={original} index={answerIndex} addAnswer={addAnswer} />
      <Switch
        checked={Boolean(getValueByPath(form.getValues(), fieldPath))}
        onChange={(e) => form.setFieldValue(fieldPath, e.currentTarget.checked)}
      />
    </Group>
  );
}

function PreviewDateTime(props: PreviewAnswerProps): JSX.Element {
  const { item, original, answerIndex, addAnswer, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();
  const fieldPath = getFieldPath(item, answerIndex);
  const inputType = original.type === 'dateTime' ? 'datetime-local' : original.type;

  return (
    <TextInput
      label={<PreviewQuestion item={item} original={original} index={answerIndex} addAnswer={addAnswer} />}
      type={inputType}
      value={getValueByPath(form.getValues(), fieldPath) ?? ''}
      error={form.errors[fieldPath]}
      onChange={(e) => setAnswerValue(form, fieldPath, original, e.currentTarget.value, ignoreValidation)}
    />
  );
}

/**
 * A non-repeating choice question: one answer, rendered as a drop-down or radio buttons based on the item control.
 * @param props - The preview answer props.
 * @returns The PreviewChoice React node.
 */
function PreviewChoice(props: PreviewAnswerProps): JSX.Element {
  const { item, original, answerIndex, addAnswer } = props;
  const form = useQuestionnaireFormContext();
  const fieldPath = getFieldPath(item, answerIndex);
  const value = getValueByPath(form.getValues(), fieldPath);
  const answerOption: ExtendedQuestionnaireItemAnswerOption[] = original.answerOption ?? [];
  const isHorizontal = isHorizontalChoiceLayout(original);
  const label = <PreviewQuestion item={item} original={original} index={answerIndex} addAnswer={addAnswer} />;

  if (original.itemControl?.code === 'drop-down') {
    return (
      <NativeSelect
        label={label}
        data={[{ value: '', label: 'Select an option' }, ...toOptionData(answerOption)]}
        value={value?.code ?? ''}
        error={form.errors[fieldPath]}
        onChange={(e) => form.setFieldValue(fieldPath, findOption(answerOption, e.currentTarget.value))}
      />
    );
  }

  const radios = answerOption.map((option) => (
    <Radio key={`${item.linkId}-${option.value.code}`} value={option.value.code} label={option.value.display} />
  ));

  return (
    <Radio.Group
      label={label}
      value={value?.code ?? null}
      error={form.errors[fieldPath]}
      onChange={(code) => form.setFieldValue(fieldPath, findOption(answerOption, code))}
    >
      <Stack gap={isHorizontal ? 'md' : 'xs'} mt="xs">
        {isHorizontal ? <Group gap="xl">{radios}</Group> : radios}
      </Stack>
    </Radio.Group>
  );
}

/**
 * A repeating choice question: multiple answers are allowed, one per selected option. Rendered as a multi-select
 * drop-down or checkboxes based on the item control.
 * @param props - The preview answer props.
 * @returns The PreviewRepeatingChoice React node.
 */
function PreviewRepeatingChoice(props: PreviewAnswerProps): JSX.Element {
  const { item, original, addAnswer } = props;
  const form = useQuestionnaireFormContext();
  const answersPath = `${item.answerPath}.answer`;
  const answers: { value: any }[] = getValueByPath(form.getValues(), answersPath) ?? [];
  const answerOption: ExtendedQuestionnaireItemAnswerOption[] = original.answerOption ?? [];
  const selectedCodes = answers.map((answer) => answer.value?.code).filter((code): code is string => Boolean(code));
  const label = <PreviewQuestion item={item} original={original} index={0} addAnswer={addAnswer} />;

  const setSelectedCodes = (codes: string[]): void => {
    // Options that stay selected keep their answers, including their follow-up items.
    form.setFieldValue(
      answersPath,
      codes
        .map(
          (code) => answers.find((answer) => answer.value?.code === code) ?? { value: findOption(answerOption, code) }
        )
        .filter((answer) => answer.value)
    );
    rebuildFollowUpAnswers(form, original);
  };

  if (original.itemControl?.code === 'drop-down') {
    return (
      <MultiSelect
        label={label}
        placeholder="Select items"
        data={toOptionData(answerOption)}
        value={selectedCodes}
        error={form.errors[answersPath]}
        onChange={setSelectedCodes}
      />
    );
  }

  return (
    <Checkbox.Group label={label} value={selectedCodes} error={form.errors[answersPath]} onChange={setSelectedCodes}>
      <Stack gap="xs" mt="xs">
        {answerOption.map((option) => (
          <Checkbox
            key={`${item.linkId}-${option.value.code}`}
            value={option.value.code}
            label={option.value.display}
          />
        ))}
      </Stack>
    </Checkbox.Group>
  );
}

function isChoiceType(type: string | undefined): boolean {
  return type === 'choice' || type === 'open-choice';
}

function findOption(answerOption: ExtendedQuestionnaireItemAnswerOption[], code: string | null): Coding | undefined {
  return answerOption.find((option) => option.value.code === code)?.value;
}

function toOptionData(answerOption: ExtendedQuestionnaireItemAnswerOption[]): { value: string; label: string }[] {
  return answerOption.map((option) => ({ value: option.value.code, label: option.value.display }));
}
