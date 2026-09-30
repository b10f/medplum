// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { TextInputProps } from '@mantine/core';
import {
  ActionIcon,
  Alert,
  Anchor,
  Autocomplete,
  Button,
  Card,
  Center,
  Checkbox,
  Divider,
  Group,
  Input,
  MultiSelect,
  NativeSelect,
  NumberInput,
  Popover,
  Radio,
  Select,
  Slider,
  Stack,
  Switch,
  Table,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { deepEquals, normalizeErrorString } from '@medplum/core';
import type { Coding, Quantity, QuestionnaireItem, Signature, ValueSetExpansionContains } from '@medplum/fhirtypes';
import type { QuestionnaireFormPaginationState } from '@medplum/react-hooks';
import { getQuestionnaireItemReferenceFilter } from '@medplum/react-hooks';
import { IconExternalLink, IconHelp, IconInfoCircle, IconLock, IconPlus, IconTrash } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX, ReactNode, RefObject, WheelEvent } from 'react';
import { createContext, Fragment, useContext, useEffect, useRef, useState } from 'react';
import { AttachmentInput } from '../AttachmentInput/AttachmentInput';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { QuestionnaireFormStepper } from '../QuestionnaireForm/QuestionnaireFormStepper';
import { ReferenceInput } from '../ReferenceInput/ReferenceInput';
import { SignatureInput } from '../SignatureInput/SignatureInput';
import { ValueSetAutocomplete } from '../ValueSetAutocomplete/ValueSetAutocomplete';
import type {
  ExtendedQuestionnaireItem,
  ExtendedQuestionnaireItemAnswer,
  ExtendedQuestionnaireItemAnswerOption,
  QuestionDisplayText,
  QuestionnaireMode,
} from './QuestionnaireBuilderV2.utils';
import {
  applyExclusiveOptions,
  evaluateEnableWhen,
  findAnswerOption,
  findRootItem,
  getAnswerOptionDisplay,
  getAnswerOptionLabel,
  getCalculatedAnswers,
  getChoiceValueKey,
  getPageItems,
  getRequiredGroupError,
  getRequiredSignatureType,
  getValueByPath,
  isEmptyAnswerValue,
  isHeaderOrFooterItem,
  isHorizontalChoiceLayout,
  isQuantityAnswer,
  isQuestionItem,
  isReadOnlyFormItem,
  isShownInMode,
  isUsedInMode,
  rebuildAnswerItems,
  toQuantityUnit,
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
  /** The signature to show, e.g. from a QuestionnaireResponse being edited. */
  readonly defaultSignature?: Signature;
  /** Called on submit once all shown answers are valid (and the form is signed, if a signature is required). */
  readonly onSubmit?: (signature?: Signature) => void;
  /**
   * Fill in the form (capture, the default), or view its answers read-only (display). Items appear in either by their
   * usage mode (questionnaire-usageMode).
   */
  readonly mode?: QuestionnaireMode;
}

interface CalculationState {
  /** The values the answers were last calculated from. */
  evaluated?: Record<string, any>;
  /** The values after the calculated answers were last written. */
  written?: Record<string, any>;
  /** How many calculations in a row were caused only by calculated answers. */
  rounds: number;
  /** Expressions that failed, by the form path of their answer value. */
  errors: Record<string, string>;
}

/** Stops calculated answers that depend on each other in a loop from being recalculated forever. */
const MAX_CALCULATION_ROUNDS = 10;

/**
 * Keeps the answers of questions with a calculatedExpression up to date: after every change, recalculates them and
 * writes those that changed. Answers calculated from other calculated answers follow in the next round. Failed
 * expressions are shown as their answer's error.
 * @param form - The questionnaire form.
 * @param enabled - False to leave the answers as they are.
 * @returns The calculation state, with the current expression errors.
 */
function useCalculatedAnswers(form: QuestionnaireForm, enabled: boolean): RefObject<CalculationState> {
  const state = useRef<CalculationState>({ rounds: 0, errors: {} });

  useEffect(() => {
    const current = state.current;
    const values = form.getValues();
    if (!enabled || values === current.evaluated) {
      return;
    }
    current.rounds = values === current.written ? current.rounds + 1 : 0;
    current.evaluated = values;
    if (current.rounds >= MAX_CALCULATION_ROUNDS) {
      return;
    }

    const errors: Record<string, string> = {};
    for (const { fieldPath, value, error } of getCalculatedAnswers(values)) {
      if (error) {
        errors[fieldPath] = error;
      } else if (!deepEquals(getValueByPath(form.getValues(), fieldPath), value)) {
        form.setFieldValue(fieldPath, value);
      }
    }
    for (const fieldPath of Object.keys(current.errors)) {
      if (!errors[fieldPath]) {
        form.clearFieldError(fieldPath);
      }
    }
    for (const [fieldPath, error] of Object.entries(errors)) {
      if (form.errors[fieldPath] !== error) {
        form.setFieldError(fieldPath, error);
      }
    }
    current.errors = errors;
    if (form.getValues() !== values) {
      current.written = form.getValues();
    }
  });

  return state;
}

/** The mode the preview renders in, for the items deep in its tree. */
const PreviewModeContext = createContext<QuestionnaireMode>('capture');

export function QuestionnairePreview(props: QuestionnairePreviewProps): JSX.Element {
  const {
    items,
    selectedItem,
    addAnswer,
    ignoreValidation,
    submitButtonText,
    excludeButtons,
    defaultSignature,
    onSubmit,
    mode = 'capture',
  } = props;
  const form = useQuestionnaireFormContext();
  const viewing = mode === 'display';
  // With pages, only pages are shown, and of those only the pages that are not hidden and whose conditions are met.
  const pageItems = getPageItems(items)?.filter(
    (page) => !page.hidden && evaluateEnableWhen(form.getValues(), page) && isShownInMode(form.getValues(), page, mode)
  );
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

  const currentPage = pageItems ? Math.max(0, Math.min(activePage, pageItems.length - 1)) : 0;
  // Headers and footers stay in view above and below the form, on every page.
  const headerItems = items.filter((item) => isHeaderOrFooterItem(item) && item.itemControl?.code === 'header');
  const footerItems = items.filter((item) => isHeaderOrFooterItem(item) && item.itemControl?.code === 'footer');
  const bodyItems = items.filter((item) => !isHeaderOrFooterItem(item));
  const fixedItemProps = { selectedItem, addAnswer, ignoreValidation, viewing };
  // As in Medplum's QuestionnaireForm: one signature for the whole form, below its last page.
  const signatureRequired = !!getRequiredSignatureType(form.getValues());
  const [signature, setSignature] = useState<Signature | undefined>(defaultSignature);
  const [signatureMissing, setSignatureMissing] = useState(false);
  // Answers are not calculated when viewing them: they are the answers given.
  const calculation = useCalculatedAnswers(form, !viewing);

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
    form.setErrors({ ...calculation.current.errors, ...errors });
    return Object.keys(errors).length === 0;
  };

  const handleNextPage = (): void => {
    // Viewing answers pages through them without checking.
    if (pageItems && (viewing || validate([pageItems[currentPage]]))) {
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
      if (!validate([...headerItems, ...footerItems])) {
        return;
      }
    } else if (!validate(items)) {
      return;
    }
    if (signatureRequired && !signature && !ignoreValidation) {
      setSignatureMissing(true);
      return;
    }
    onSubmit?.(signatureRequired ? signature : undefined);
  };

  const signatureSection = signatureRequired && !viewing && (!pageItems || currentPage === pageItems.length - 1) && (
    <Stack mt="md" gap={4}>
      <Text size="sm" fw={500}>
        Signature
      </Text>
      <SignatureInput
        defaultValue={signature}
        onChange={(value) => {
          setSignature(value);
          setSignatureMissing(false);
        }}
      />
      {signatureMissing && (
        <Text c="red" size="sm">
          Signature is required.
        </Text>
      )}
    </Stack>
  );

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
      {/* Visible overflow lets a header or footer stick to the scrolling view. */}
      <Card withBorder style={headerItems.length + footerItems.length > 0 ? { overflow: 'visible' } : undefined}>
        <Card.Section withBorder inheritPadding py="md">
          <Title order={3} ta="center">
            {form.getValues().title || 'Untitled'}
          </Title>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <PreviewModeContext.Provider value={mode}>
            <Form onSubmit={handleSubmit}>
              {pageItems?.length === 0 && (
                <Text c="dimmed" ta="center">
                  No pages are shown.
                </Text>
              )}
              <PreviewFixedItems items={headerItems} position="header" {...fixedItemProps} />
              {pageItems && pageItems.length > 0 && (
                <>
                  <QuestionnaireFormStepper
                    excludeButtons
                    formState={
                      {
                        pages: pageItems.map((page, index) => ({
                          linkId: page.linkId,
                          title: [page.prefix, page.text].filter(Boolean).join(' ') || `Page ${index + 1}`,
                          group: page as unknown as QuestionnaireItem & { type: 'group' },
                        })),
                        activePage: currentPage,
                      } as QuestionnaireFormPaginationState
                    }
                  >
                    <ViewOnly viewing={viewing}>
                      <PreviewPage
                        key={pageItems[currentPage].linkId}
                        page={pageItems[currentPage]}
                        selectedItem={selectedItem}
                        addAnswer={addAnswer}
                        ignoreValidation={ignoreValidation}
                      />
                    </ViewOnly>
                  </QuestionnaireFormStepper>
                  <PreviewFixedItems items={footerItems} position="footer" {...fixedItemProps} />
                  {signatureSection}
                  {/* Same layout as QuestionnaireFormStepper's buttons, with our validation instead of reportValidity. */}
                  {!excludeButtons && (
                    <Group justify="flex-end" mt="xl" gap="xs">
                      {currentPage > 0 && <Button onClick={() => setActivePage(currentPage - 1)}>Back</Button>}
                      {currentPage < pageItems.length - 1 && <Button onClick={handleNextPage}>Next</Button>}
                      {currentPage === pageItems.length - 1 && !viewing && (
                        <SubmitButton>{submitButtonText ?? 'Submit'}</SubmitButton>
                      )}
                    </Group>
                  )}
                </>
              )}
              {!pageItems && (
                <Stack gap="md">
                  <ViewOnly viewing={viewing}>
                    <Stack gap="md">
                      {bodyItems.map((item: ExtendedQuestionnaireItem, index: number) => (
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
                    </Stack>
                  </ViewOnly>
                  <PreviewFixedItems items={footerItems} position="footer" {...fixedItemProps} />
                  {signatureSection}
                  {!excludeButtons && !viewing && (
                    <Group justify="flex-end" mt="xl">
                      <SubmitButton>{submitButtonText ?? 'Submit'}</SubmitButton>
                    </Group>
                  )}
                </Stack>
              )}
            </Form>
          </PreviewModeContext.Provider>
        </Card.Section>
      </Card>
    </div>
  );
}

interface PreviewFixedItemsProps {
  readonly items: ExtendedQuestionnaireItem[];
  readonly position: 'header' | 'footer';
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly addAnswer: AddAnswer;
  readonly ignoreValidation?: boolean;
  readonly viewing: boolean;
}

/**
 * Header or footer groups (item control `header`/`footer`), kept in view at the top or bottom of the scrolling form.
 * @param props - The PreviewFixedItems props.
 * @returns The PreviewFixedItems React node, or null without such groups.
 */
function PreviewFixedItems(props: PreviewFixedItemsProps): JSX.Element | null {
  const { items, position, selectedItem, addAnswer, ignoreValidation, viewing } = props;
  if (items.length === 0) {
    return null;
  }
  return (
    <div className={cx(classes.fixedItems, position === 'header' ? classes.header : classes.footer)}>
      <ViewOnly viewing={viewing}>
        {items.map((item, index) => (
          <PreviewItem
            key={item.linkId}
            item={item}
            original={item}
            selectedItem={selectedItem}
            index={index}
            addAnswer={addAnswer}
            ignoreValidation={ignoreValidation}
          />
        ))}
      </ViewOnly>
    </div>
  );
}

/**
 * Makes everything inside read-only when viewing answers: a disabled fieldset disables all its inputs and buttons.
 * @param props - The ViewOnly props.
 * @param props.viewing - True when viewing answers.
 * @param props.children - The content.
 * @returns The content, read-only when viewing.
 */
function ViewOnly(props: { readonly viewing: boolean; readonly children: ReactNode }): JSX.Element {
  if (!props.viewing) {
    return <>{props.children}</>;
  }
  return (
    <fieldset disabled className={classes.viewOnly}>
      {props.children}
    </fieldset>
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
      <RequiredGroupError item={page} />
      {/* The stepper shows the page title; the page's guidance goes above its items. */}
      {(page.help || page.supportLink) && (
        <Stack gap={4}>
          {page.help && (
            <Text size="sm" c="dimmed">
              {page.help}
            </Text>
          )}
          {page.supportLink && (
            <Anchor href={page.supportLink} target="_blank" rel="noopener noreferrer" size="sm">
              <Group gap={4}>
                More information
                <IconExternalLink size={14} />
              </Group>
            </Anchor>
          )}
        </Stack>
      )}
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
  const mode = useContext(PreviewModeContext);

  if (!original) {
    return null;
  }

  if (original.hidden || !evaluateEnableWhen(form.getValues(), item) || !isShownInMode(form.getValues(), item, mode)) {
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
        <PreviewDisplay item={item} original={original} index={index} addAnswer={addAnswer} />
      </PreviewSelectedItem>
    );
  }

  const followUpProps = { selectedItem, addAnswer, ignoreValidation };
  const readOnly = isReadOnlyFormItem(form.getValues(), item);

  if (isChoiceType(original.type) && original.repeats) {
    return (
      <PreviewSelectedItem item={item} selectedItem={selectedItem} index={index}>
        <Stack gap="md">
          <Stack gap={4}>
            <PreviewRepeatingChoice
              item={item}
              original={original}
              answerIndex={0}
              addAnswer={addAnswer}
              readOnly={readOnly}
            />
            <PreviewAttachedTexts original={original} />
          </Stack>
          {/* Each selected option has its own follow-up items. */}
          {(item.answer ?? []).map((answer, answerIndex) => (
            <PreviewFollowUpItems
              key={`${item.linkId}-${getChoiceValueKey(answer.value)}-${answerIndex}`}
              answer={answer}
              label={toChoiceText(original.answerOption ?? [], answer.value)}
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
            readOnly,
          };
          return (
            <Fragment key={`${item.linkId}-${answerIndex}`}>
              <Stack gap={4}>
                <PreviewAnswer {...answerProps} />
                <PreviewAttachedTexts original={original} />
              </Stack>
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
  if (isChoiceType(type) && props.original.repeats) {
    return <PreviewRepeatingChoice {...props} />;
  } else if (type === 'quantity') {
    return <PreviewQuantity {...props} />;
  } else if (type === 'reference') {
    return <PreviewReference {...props} />;
  } else if (type === 'attachment') {
    return <PreviewAttachment {...props} />;
  } else if (['string', 'integer', 'decimal', 'url'].includes(type)) {
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

/**
 * Display text, styled by its display category (questionnaire-displayCategory): instructions and security notices as
 * boxes, help as muted text; other text as before.
 * @param props - The PreviewDisplay props.
 * @param props.item - The display item.
 * @param props.original - Its definition.
 * @param props.index - Its index.
 * @param props.addAnswer - Adds an answer (unused by display text; passed on to its title).
 * @returns The PreviewDisplay React node.
 */
function PreviewDisplay(props: {
  readonly item: ExtendedQuestionnaireItem;
  readonly original: ExtendedQuestionnaireItem;
  readonly index: number;
  readonly addAnswer: AddAnswer;
}): JSX.Element {
  const { item, original, index, addAnswer } = props;
  const title = <PreviewQuestion item={item} original={original} index={index} addAnswer={addAnswer} />;

  switch (original.displayCategory?.code) {
    case 'instructions':
      return (
        <Alert variant="light" color="blue" icon={<IconInfoCircle size={20} />}>
          {title}
        </Alert>
      );
    case 'security':
      return (
        <Alert variant="light" color="orange" icon={<IconLock size={20} />}>
          {title}
        </Alert>
      );
    case 'help':
      return (
        <Group gap="xs" wrap="nowrap" c="dimmed" fz="sm">
          <IconHelp size={16} />
          {title}
        </Group>
      );
    default:
      return (
        <>
          {title}
          <Divider my="md" />
        </>
      );
  }
}

/**
 * Returns the text of a display item that belongs to a question by its item control (prompt, unit, lower, upper,
 * flyover): shown with the question, rather than as an item of its own.
 * @param original - The question's definition.
 * @param code - The item control code.
 * @returns The text, or undefined.
 */
function getAttachedText(original: ExtendedQuestionnaireItem, code: QuestionDisplayText): string | undefined {
  return original.displayTexts?.[code] || undefined;
}

function getDecimalPlaces(original: ExtendedQuestionnaireItem): number | undefined {
  const places = original.maxDecimalPlaces;
  return places === null || places === undefined || (places as any) === '' ? undefined : Number(places);
}

function getUnitSection(
  unit: string | undefined
): Pick<TextInputProps, 'rightSection' | 'rightSectionWidth' | 'rightSectionProps'> {
  if (!unit) {
    return {};
  }
  return {
    rightSection: <Text size="sm">{unit}</Text>,
    rightSectionWidth: 'auto',
    rightSectionProps: { style: { paddingInline: 'var(--mantine-spacing-sm)' } },
  };
}

/**
 * A question's lower and upper bound labels (e.g. "Strongly disagree" / "Strongly agree"), at either end below its
 * answer, and its prompt below them.
 * @param props - The question's definition.
 * @param props.original - The question's definition.
 * @returns The texts, or null without any.
 */
function PreviewAttachedTexts(props: { readonly original: ExtendedQuestionnaireItem }): JSX.Element | null {
  const { original } = props;
  const lower = getAttachedText(original, 'lower');
  const upper = getAttachedText(original, 'upper');
  const prompt = getAttachedText(original, 'prompt');
  if (!lower && !upper && !prompt) {
    return null;
  }
  return (
    <>
      {(lower || upper) && (
        <Group justify="space-between" gap="md" wrap="nowrap">
          <Text size="sm" c="dimmed">
            {lower}
          </Text>
          <Text size="sm" c="dimmed" ta="right">
            {upper}
          </Text>
        </Group>
      )}
      {prompt && (
        <Text size="sm" c="dimmed">
          {prompt}
        </Text>
      )}
    </>
  );
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
  const mode = useContext(PreviewModeContext);
  const values = form.getValues();

  if (isEmptyAnswerValue(answer.value)) {
    return null;
  }

  const shownItems = (answer.item ?? []).filter((child) => {
    const original: ExtendedQuestionnaireItem | undefined = getValueByPath(values, child.path);
    return original && !original.hidden && evaluateEnableWhen(values, child) && isShownInMode(values, child, mode);
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

  if (isGroupTable(original)) {
    return <PreviewGroupTable {...props} />;
  }

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

            {Array.isArray(answerGroup) && isChoiceTable(original) && (
              <PreviewChoiceTable
                answerGroup={answerGroup}
                transposed={original.itemControl?.code === 'htable'}
                ignoreValidation={ignoreValidation}
              />
            )}
            {Array.isArray(answerGroup) && !isChoiceTable(original) && (
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
      <RequiredGroupError item={item} />
    </PreviewSelectedItem>
  );
}

/**
 * A choice table (`table`, `atable` or `htable` item control) has only choice questions with answer options: their
 * answers are picked in a grid of questions and options.
 * @param group - The group's definition.
 * @returns True if the group is rendered as a choice table.
 */
function isChoiceTable(group: ExtendedQuestionnaireItem): boolean {
  const code = group.itemControl?.code;
  return (
    (code === 'table' || code === 'atable' || code === 'htable') &&
    (group.item ?? []).length > 0 &&
    group.item.every((child) => isChoiceType(child.type) && (child.answerOption ?? []).length > 0)
  );
}

interface PreviewChoiceTableProps {
  /** One repetition of the group: copies of its questions. */
  readonly answerGroup: ExtendedQuestionnaireItem[];
  /** False: questions are rows and options columns (`table`, `atable`); true: the other way round (`htable`). */
  readonly transposed: boolean;
  readonly ignoreValidation?: boolean;
}

/**
 * The choice questions of a table group as a grid: one radio button (or checkbox, for a repeating question) per
 * question and option. Options are the questions' own, in the order they first appear.
 * @param props - The PreviewChoiceTable props.
 * @returns The PreviewChoiceTable React node.
 */
function PreviewChoiceTable(props: PreviewChoiceTableProps): JSX.Element {
  const { answerGroup, transposed } = props;
  const form = useQuestionnaireFormContext();
  const mode = useContext(PreviewModeContext);
  const values = form.getValues();
  const questions = answerGroup
    .map((copy) => ({ copy, original: getValueByPath(values, copy.path) as ExtendedQuestionnaireItem | undefined }))
    .filter(
      ({ copy, original }) =>
        original && !original.hidden && evaluateEnableWhen(values, copy) && isShownInMode(values, copy, mode)
    ) as { copy: ExtendedQuestionnaireItem; original: ExtendedQuestionnaireItem }[];

  const options: ExtendedQuestionnaireItemAnswerOption[] = [];
  for (const { original } of questions) {
    for (const option of original.answerOption ?? []) {
      if (!options.some((known) => getChoiceValueKey(known.value) === getChoiceValueKey(option.value))) {
        options.push(option);
      }
    }
  }

  const cell = (
    copy: ExtendedQuestionnaireItem,
    original: ExtendedQuestionnaireItem,
    option: ExtendedQuestionnaireItemAnswerOption
  ): JSX.Element | null => {
    const own = findAnswerOption(original.answerOption, option.value);
    if (!own) {
      return null;
    }
    const answersPath = `${copy.answerPath}.answer`;
    const answers: ExtendedQuestionnaireItemAnswer[] = getValueByPath(values, answersPath) ?? [];
    const checked = answers.some((answer) => getChoiceValueKey(answer.value) === getChoiceValueKey(own.value));
    const readOnly = isReadOnlyFormItem(values, copy);
    const label = `${original.text ?? ''}: ${getAnswerOptionDisplay(own)}`;

    if (original.repeats) {
      return (
        <Checkbox
          aria-label={label}
          checked={checked}
          disabled={readOnly}
          onChange={(e) => {
            const previous = answers.map((answer) => answer.value).filter((value) => !isEmptyAnswerValue(value));
            const others = previous.filter((value) => getChoiceValueKey(value) !== getChoiceValueKey(own.value));
            const newValues = applyExclusiveOptions(
              original.answerOption,
              previous,
              e.currentTarget.checked ? [...others, own.value] : others
            );
            form.setFieldValue(
              answersPath,
              newValues.map(
                (value) =>
                  answers.find((answer) => getChoiceValueKey(answer.value) === getChoiceValueKey(value)) ?? { value }
              )
            );
            rebuildAnswerItems(form, original);
          }}
        />
      );
    }
    return (
      <Radio
        aria-label={label}
        checked={checked}
        disabled={readOnly}
        onChange={() => form.setFieldValue(`${answersPath}.0.value`, own.value)}
      />
    );
  };

  const questionHeader = (copy: ExtendedQuestionnaireItem, original: ExtendedQuestionnaireItem): JSX.Element => {
    const errorPath = original.repeats ? `${copy.answerPath}.answer` : `${copy.answerPath}.answer.0.value`;
    return (
      <>
        {[original.prefix, original.text].filter(Boolean).join(' ')}
        {original.required && (
          <Text component="span" c="red">
            {' '}
            *
          </Text>
        )}
        {form.errors[errorPath] && <Input.Error>{form.errors[errorPath]}</Input.Error>}
      </>
    );
  };

  return (
    <Table withTableBorder withColumnBorders mt="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th />
          {transposed
            ? questions.map(({ copy, original }) => (
                <Table.Th key={copy.answerPath}>{questionHeader(copy, original)}</Table.Th>
              ))
            : options.map((option) => (
                <Table.Th key={getChoiceValueKey(option.value)} ta="center">
                  {getAnswerOptionDisplay(option)}
                </Table.Th>
              ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {transposed
          ? options.map((option) => (
              <Table.Tr key={getChoiceValueKey(option.value)}>
                <Table.Th>{getAnswerOptionDisplay(option)}</Table.Th>
                {questions.map(({ copy, original }) => (
                  <Table.Td key={copy.answerPath}>
                    <Center>{cell(copy, original, option)}</Center>
                  </Table.Td>
                ))}
              </Table.Tr>
            ))
          : questions.map(({ copy, original }) => (
              <Table.Tr key={copy.answerPath}>
                <Table.Td>{questionHeader(copy, original)}</Table.Td>
                {options.map((option) => (
                  <Table.Td key={getChoiceValueKey(option.value)}>
                    <Center>{cell(copy, original, option)}</Center>
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
      </Table.Tbody>
    </Table>
  );
}

/**
 * A group table (`gtable` item control) has only questions: each question is a column, each repetition a row.
 * @param group - The group's definition.
 * @returns True if the group is rendered as a table.
 */
function isGroupTable(group: ExtendedQuestionnaireItem): boolean {
  return group.itemControl?.code === 'gtable' && (group.item ?? []).length > 0 && group.item.every(isQuestionItem);
}

/**
 * A group rendered as a table: its questions are the columns and each repetition is a row.
 * @param props - The PreviewGroup props.
 * @returns The PreviewGroupTable React node.
 */
function PreviewGroupTable(props: PreviewGroupProps): JSX.Element {
  const { item, original, selectedItem, index, addAnswer, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();
  const values = form.getValues();
  const readOnly = isReadOnlyFormItem(values, item);
  const mode = useContext(PreviewModeContext);
  const columns = original.item.filter((column) => !column.hidden && isUsedInMode(column.usageMode, mode));
  const rows = ((item.answer ?? []) as unknown as ExtendedQuestionnaireItem[][]).filter(Array.isArray);
  const canRemove = original.repeats && !readOnly && rows.length > (+original.minOccurs || 1);
  const canAdd = original.repeats && !readOnly && (!original.maxOccurs || rows.length < +original.maxOccurs);

  return (
    <PreviewSelectedItem item={item} selectedItem={selectedItem} index={index}>
      <PreviewQuestion item={item} original={original} index={index} addAnswer={addAnswer} showRepeatControls={false} />
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
          {rows.map((row, rowIndex) => (
            <Table.Tr key={`${item.answerPath}-${rowIndex}`}>
              {columns.map((column) => {
                const cell = row.find((cellItem) => cellItem.linkId === column.linkId);
                return (
                  <Table.Td key={column.linkId}>
                    {cell && evaluateEnableWhen(values, cell) && (
                      <PreviewAnswer
                        item={cell}
                        original={column}
                        answerIndex={0}
                        addAnswer={addAnswer}
                        ignoreValidation={ignoreValidation}
                        readOnly={isReadOnlyFormItem(values, cell)}
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
                    onClick={() => removeFormAnswer(form, item, rowIndex, original)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {canAdd && (
        <Button
          variant="default"
          size="xs"
          mt="xs"
          leftSection={<IconPlus size={16} />}
          onClick={() => addAnswer(item, original)}
        >
          Add row
        </Button>
      )}
      <RequiredGroupError item={item} />
    </PreviewSelectedItem>
  );
}

/**
 * Shows a required group's error once validation has found it, until the group is answered.
 * @param props - The group (or its answer copy).
 * @param props.item - The group.
 * @returns The error, or null.
 */
function RequiredGroupError(props: { readonly item: ExtendedQuestionnaireItem }): JSX.Element | null {
  const form = useQuestionnaireFormContext();
  const values = form.getValues();
  const message = form.errors[`${props.item.answerPath}.answer`] && getRequiredGroupError(values, props.item);
  return message ? <Input.Error mt="xs">{message}</Input.Error> : null;
}

/**
 * Removes one answer of an item (for a group, one repetition), and recomputes the items answered under the others.
 * @param form - The questionnaire form.
 * @param item - The item (or answer copy).
 * @param index - The index of the answer to remove.
 * @param original - The item's definition.
 */
function removeFormAnswer(
  form: QuestionnaireForm,
  item: ExtendedQuestionnaireItem,
  index: number,
  original: ExtendedQuestionnaireItem
): void {
  const path = item.answerPath;
  if (!path) {
    return;
  }
  const answers = [...(getValueByPath(form.getValues(), `${path}.answer`) ?? [])];
  answers.splice(index, 1);
  form.setFieldValue(`${path}.answer`, answers);
  rebuildAnswerItems(form, original);
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
  /** Shows the add and remove answer buttons of a repeating item; a group table has its own. */
  readonly showRepeatControls?: boolean;
}

function PreviewQuestion(props: PreviewQuestionProps): JSX.Element {
  const { item, original, index = 0, groupIndex = 0, addAnswer, showRepeatControls = true } = props;
  const form = useQuestionnaireFormContext();
  const readOnly = isReadOnlyFormItem(form.getValues(), item);

  const text = original.prefix ? `${original.prefix} ${original.text}` : original.text;
  // Help is shown behind a help button, when the question text is hovered, or below the question.
  const helpDisplay = original.help ? (original.helpDisplay ?? 'help') : undefined;
  const title =
    helpDisplay === 'flyover' ? (
      <Tooltip label={original.help} multiline maw={300} withArrow>
        <span className={classes.flyover}>{text}</span>
      </Tooltip>
    ) : (
      text
    );
  const repeatIndex = original.type === 'group' ? groupIndex : index;
  // A repeating choice question holds one answer per selected option, not one per repetition.
  const showIndex = item.answer?.length > 1 && !isChoiceType(original.type) ? repeatIndex + 1 : null;
  const isLastRepeat = repeatIndex + 1 === item.answer?.length;
  const canRemove = item.answer?.length > original.minOccurs;
  const canAdd = isLastRepeat && (!original.maxOccurs || item.answer?.length < +original.maxOccurs);

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
            <Text size="sm">{original.help}</Text>
          </Popover.Dropdown>
        </Popover>
      )}

      {showRepeatControls && original.repeats && !readOnly && !isChoiceType(original.type) && (
        <Group gap="xs">
          {canRemove && (
            <ActionIcon
              variant="filled"
              color="red"
              size="sm"
              aria-label="Remove answer"
              onClick={() => removeFormAnswer(form, item, repeatIndex, original)}
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
      {helpDisplay === 'inline' && (
        <Text size="sm" c="dimmed" w="100%" fw={400}>
          {original.help}
        </Text>
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
  readonly readOnly?: boolean;
  /** Renders the input without its question label, e.g. in a group table cell. */
  readonly inline?: boolean;
}

/**
 * The question label of an answer input, or none for an inline input.
 * @param props - The preview answer props.
 * @returns The label and the input's accessible name.
 */
function getAnswerLabel(props: PreviewAnswerProps): {
  label?: JSX.Element;
  labelProps?: { className: string };
  'aria-label'?: string;
} {
  const { item, original, answerIndex, addAnswer, inline } = props;
  if (inline) {
    return { 'aria-label': original.text };
  }
  return {
    label: <PreviewQuestion item={item} original={original} index={answerIndex} addAnswer={addAnswer} />,
    // Full width, so the question's buttons sit on the right as in a group header.
    labelProps: { className: classes.answerLabel },
  };
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
  const { item, original, answerIndex, ignoreValidation, readOnly } = props;
  const form = useQuestionnaireFormContext();
  const fieldPath = getFieldPath(item, answerIndex);
  const value = getValueByPath(form.getValues(), fieldPath);
  const type = original.type;
  const isSlider = (type === 'integer' || type === 'decimal') && original.itemControl?.code === 'slider';
  const minValue = Number(original.minValue ?? 0);
  const maxValue = Number(original.maxValue ?? 100);
  const sliderStepValue = Number(original.sliderStepValue ?? 1);
  const unit = original.unit;
  const labelProps = getAnswerLabel(props);

  if (isSlider) {
    return (
      <Stack gap="xs">
        {labelProps.label}
        <Slider
          aria-label={labelProps['aria-label']}
          disabled={readOnly}
          value={Number(value) || minValue}
          min={minValue}
          max={maxValue}
          step={sliderStepValue}
          onChange={(val) => form.setFieldValue(fieldPath, val)}
        />
      </Stack>
    );
  }

  if ((type === 'integer' || type === 'decimal') && original.itemControl?.code === 'spinner') {
    return (
      <NumberInput
        {...labelProps}
        disabled={readOnly}
        // Typing is limited to the decimal places (maxDecimalPlaces); other inputs are checked by validateAnswerValue.
        allowDecimal={type === 'decimal' && getDecimalPlaces(original) !== 0}
        decimalScale={type === 'decimal' ? getDecimalPlaces(original) : undefined}
        {...getUnitSection(unit ? (unit.display ?? unit.code) : getAttachedText(original, 'unit'))}
        min={original.minValue === null || original.minValue === '' ? undefined : Number(original.minValue)}
        max={original.maxValue === null || original.maxValue === '' ? undefined : Number(original.maxValue)}
        value={value ?? ''}
        error={form.errors[fieldPath]}
        onChange={(val) => setAnswerValue(form, fieldPath, original, val, ignoreValidation)}
      />
    );
  }

  if ((type === 'integer' && unit) || (type === 'decimal' && unit)) {
    return (
      <TextInput
        {...labelProps}
        disabled={readOnly}
        type="number"
        rightSection={<Text size="sm">{unit.display ?? unit.code}</Text>}
        rightSectionWidth="auto"
        rightSectionProps={{ style: { paddingInline: 'var(--mantine-spacing-sm)' } }}
        step="any"
        value={value ?? ''}
        error={form.errors[fieldPath]}
        onChange={(e) => setAnswerValue(form, fieldPath, original, e.currentTarget.value, ignoreValidation)}
      />
    );
  }

  return (
    <TextInput
      {...labelProps}
      disabled={readOnly}
      type={type === 'integer' || type === 'decimal' ? 'number' : 'text'}
      // A URL keyboard on mobile, without the browser's own URL check: validateAnswerValue checks the value.
      inputMode={type === 'url' ? 'url' : undefined}
      step={type === 'decimal' ? 'any' : undefined}
      placeholder={original.entryFormat}
      maxLength={!ignoreValidation && original.maxLength ? original.maxLength : undefined}
      {...getUnitSection(getAttachedText(original, 'unit'))}
      value={value ?? ''}
      error={form.errors[fieldPath]}
      onChange={(e) => setAnswerValue(form, fieldPath, original, e.currentTarget.value, ignoreValidation)}
    />
  );
}

/**
 * A reference answer, picked with Medplum's ReferenceInput from the question's resource types
 * (questionnaire-referenceResource), narrowed by its search filter (questionnaire-referenceFilter).
 * @param props - The preview answer props.
 * @returns The PreviewReference React node.
 */
function PreviewReference(props: PreviewAnswerProps): JSX.Element {
  const { item, original, answerIndex, readOnly } = props;
  const form = useQuestionnaireFormContext();
  const fieldPath = getFieldPath(item, answerIndex);
  const value = getValueByPath(form.getValues(), fieldPath);
  // With profiles, the answer must conform to one of them (ReferenceInput searches each profile's resource type by
  // `_profile`); otherwise it is any resource of the resource types.
  const profiles = (original.referenceProfile ?? []).filter(Boolean);
  const targetTypes = profiles.length > 0 ? profiles : (original.referenceResource ?? []).filter(Boolean);
  // The filter extension is kept as the builder loaded it; Medplum's helper reads it the same way the form does.
  const searchCriteria = getQuestionnaireItemReferenceFilter(
    { linkId: original.linkId, type: 'reference', extension: original.preserved?.extension },
    undefined,
    undefined
  );
  const { label, labelProps } = getAnswerLabel(props);

  return (
    <Input.Wrapper label={label} labelProps={labelProps} error={form.errors[fieldPath]}>
      <ReferenceInput
        // A new set of resource types starts a new search.
        key={`${fieldPath}-${targetTypes.join(',')}`}
        name={fieldPath}
        targetTypes={targetTypes.length > 0 ? targetTypes : undefined}
        searchCriteria={searchCriteria}
        disabled={readOnly}
        defaultValue={value && typeof value === 'object' ? value : undefined}
        onChange={(reference) => form.setFieldValue(fieldPath, reference ?? '')}
      />
    </Input.Wrapper>
  );
}

/**
 * An attachment answer, uploaded with Medplum's AttachmentInput: the file is stored as a Binary and the answer holds
 * its URL, as in Medplum's QuestionnaireForm.
 * @param props - The preview answer props.
 * @returns The PreviewAttachment React node.
 */
function PreviewAttachment(props: PreviewAnswerProps): JSX.Element {
  const { item, original, answerIndex, readOnly } = props;
  const form = useQuestionnaireFormContext();
  const fieldPath = getFieldPath(item, answerIndex);
  const value = getValueByPath(form.getValues(), fieldPath);
  const { label, labelProps } = getAnswerLabel(props);

  return (
    <Input.Wrapper label={label} labelProps={labelProps} error={form.errors[fieldPath]}>
      <Group py={4}>
        <AttachmentInput
          path=""
          name={fieldPath}
          disabled={readOnly}
          // Files of another type, or too large, are not uploaded (mimeType, maxSize).
          accept={original.mimeType?.length ? original.mimeType : undefined}
          maxSize={original.maxSize ? Number(original.maxSize) : undefined}
          onUploadError={(outcome) => form.setFieldError(fieldPath, normalizeErrorString(outcome))}
          defaultValue={value && typeof value === 'object' ? value : undefined}
          onChange={(attachment) => form.setFieldValue(fieldPath, attachment ?? '')}
        />
      </Group>
    </Input.Wrapper>
  );
}

const QUANTITY_COMPARATORS = ['', '<', '<=', '>=', '>'];

/**
 * A quantity answer, as Medplum's QuantityInput: a comparator, the value and the unit. The unit is picked from the
 * question's unit options, fixed by its unit, or typed.
 * @param props - The preview answer props.
 * @returns The PreviewQuantity React node.
 */
function PreviewQuantity(props: PreviewAnswerProps): JSX.Element {
  const { item, original, answerIndex, ignoreValidation, readOnly } = props;
  const form = useQuestionnaireFormContext();
  const fieldPath = getFieldPath(item, answerIndex);
  const current = getValueByPath(form.getValues(), fieldPath);
  // Always with a value key, so an answer with only a unit still counts as unanswered.
  const quantity: Quantity = isQuantityAnswer(current) ? current : { value: current === '' ? undefined : current };
  const unitOptions: Coding[] = (original.unitOption ?? []).filter(Boolean);
  // One allowed unit is the unit; with none, the question's own unit (if any) is.
  let fixedUnit: ReturnType<typeof toQuantityUnit>;
  if (original.unitValueSet) {
    fixedUnit = undefined;
  } else if (unitOptions.length === 1) {
    fixedUnit = toQuantityUnit(unitOptions[0]);
  } else if (unitOptions.length === 0) {
    fixedUnit = toQuantityUnit(original.unit);
  }
  const { label, labelProps, 'aria-label': ariaLabel } = getAnswerLabel(props);

  const setQuantity = (changes: Partial<Quantity>): void => {
    setAnswerValue(form, fieldPath, original, { ...quantity, ...changes }, ignoreValidation);
  };

  let unitInput: JSX.Element;
  if (original.unitValueSet) {
    // Units searched in a value set (questionnaire-unitValueSet).
    unitInput = (
      <ValueSetAutocomplete
        aria-label="Unit"
        name={`${fieldPath}-unit`}
        binding={original.unitValueSet}
        creatable={false}
        clearable
        maxValues={1}
        placeholder="Unit"
        disabled={readOnly}
        defaultValue={quantity.code ? [{ system: quantity.system, code: quantity.code, display: quantity.unit }] : []}
        onChange={(selected) =>
          setQuantity(
            toQuantityUnit(
              selected[0] && { system: selected[0].system, code: selected[0].code, display: selected[0].display }
            ) ?? {
              unit: undefined,
              system: undefined,
              code: undefined,
            }
          )
        }
      />
    );
  } else if (unitOptions.length > 1) {
    unitInput = (
      <NativeSelect
        aria-label="Unit"
        disabled={readOnly}
        data={[
          { value: '', label: 'Unit' },
          ...unitOptions.map((unit) => ({ value: unit.code ?? '', label: unit.display ?? unit.code ?? '' })),
        ]}
        value={quantity.code ?? ''}
        onChange={(e) => {
          const unit = unitOptions.find((option) => option.code === e.currentTarget.value);
          setQuantity(toQuantityUnit(unit) ?? { unit: undefined, system: undefined, code: undefined });
        }}
      />
    );
  } else if (fixedUnit) {
    unitInput = <TextInput aria-label="Unit" disabled value={fixedUnit.unit ?? ''} />;
  } else {
    unitInput = (
      <TextInput
        aria-label="Unit"
        placeholder="Unit"
        disabled={readOnly}
        value={quantity.unit ?? ''}
        onChange={(e) => setQuantity({ unit: e.currentTarget.value, system: undefined, code: undefined })}
      />
    );
  }

  return (
    <Input.Wrapper label={label} labelProps={labelProps} error={form.errors[fieldPath]}>
      <Group gap="xs" grow wrap="nowrap">
        <NativeSelect
          aria-label="Comparator"
          disabled={readOnly}
          style={{ width: 80 }}
          data={QUANTITY_COMPARATORS}
          value={quantity.comparator ?? ''}
          onChange={(e) => setQuantity({ comparator: (e.currentTarget.value || undefined) as Quantity['comparator'] })}
        />
        <TextInput
          aria-label={ariaLabel ?? 'Value'}
          disabled={readOnly}
          type="number"
          step="any"
          placeholder="Value"
          // The typed text is kept as it is (e.g. "1."), and converted to a number when the response is written.
          value={quantity.value ?? ''}
          error={!!form.errors[fieldPath]}
          onWheel={(e: WheelEvent<HTMLInputElement>) => e.currentTarget.blur()}
          onChange={(e) => setQuantity({ value: e.currentTarget.value as unknown as number })}
        />
        {unitInput}
      </Group>
    </Input.Wrapper>
  );
}

function PreviewTextarea(props: PreviewAnswerProps): JSX.Element {
  const { item, original, answerIndex, ignoreValidation, readOnly } = props;
  const form = useQuestionnaireFormContext();
  const fieldPath = getFieldPath(item, answerIndex);

  return (
    <Textarea
      {...getAnswerLabel(props)}
      disabled={readOnly}
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
  const { item, original, answerIndex, readOnly } = props;
  const form = useQuestionnaireFormContext();
  const fieldPath = getFieldPath(item, answerIndex);
  const labelProps = getAnswerLabel(props);
  const value = getValueByPath(form.getValues(), fieldPath);

  if (original.itemControl?.code === 'check-box') {
    return (
      <Stack gap="xs">
        {labelProps.label}
        <Checkbox
          aria-label={labelProps['aria-label'] ?? original.text}
          disabled={readOnly}
          checked={value === true}
          onChange={(e) => form.setFieldValue(fieldPath, e.currentTarget.checked)}
        />
      </Stack>
    );
  }

  if (original.itemControl?.code === 'radio-button') {
    // Yes and No as buttons: until one is picked, the question is unanswered.
    return (
      <Radio.Group
        {...labelProps}
        value={typeof value === 'boolean' ? String(value) : null}
        error={form.errors[fieldPath]}
        onChange={(picked) => form.setFieldValue(fieldPath, picked === 'true')}
      >
        <Group gap="xl" mt="xs">
          <Radio value="true" label="Yes" disabled={readOnly} />
          <Radio value="false" label="No" disabled={readOnly} />
        </Group>
      </Radio.Group>
    );
  }

  return (
    <Group justify="space-between">
      {labelProps.label}
      <Switch
        aria-label={labelProps['aria-label']}
        disabled={readOnly}
        checked={Boolean(getValueByPath(form.getValues(), fieldPath))}
        onChange={(e) => form.setFieldValue(fieldPath, e.currentTarget.checked)}
      />
    </Group>
  );
}

function PreviewDateTime(props: PreviewAnswerProps): JSX.Element {
  const { item, original, answerIndex, ignoreValidation, readOnly } = props;
  const form = useQuestionnaireFormContext();
  const fieldPath = getFieldPath(item, answerIndex);
  const inputType = original.type === 'dateTime' ? 'datetime-local' : original.type;

  return (
    <TextInput
      {...getAnswerLabel(props)}
      disabled={readOnly}
      type={inputType}
      value={getValueByPath(form.getValues(), fieldPath) ?? ''}
      error={form.errors[fieldPath]}
      onChange={(e) => setAnswerValue(form, fieldPath, original, e.currentTarget.value, ignoreValidation)}
    />
  );
}

const OTHER_OPTION = '__other__';

/**
 * A non-repeating choice question: one answer, rendered as a drop-down or radio buttons based on the item control.
 * An open-choice question also takes an answer typed by the respondent.
 * @param props - The preview answer props.
 * @returns The PreviewChoice React node.
 */
function PreviewChoice(props: PreviewAnswerProps): JSX.Element {
  const { item, original, answerIndex, readOnly } = props;
  const form = useQuestionnaireFormContext();
  const fieldPath = getFieldPath(item, answerIndex);
  const value = getValueByPath(form.getValues(), fieldPath);
  const answerOption: ExtendedQuestionnaireItemAnswerOption[] = original.answerOption ?? [];
  const isOpen = original.type === 'open-choice';
  const isHorizontal = isHorizontalChoiceLayout(original);
  const labelProps = getAnswerLabel(props);
  const typedAnswer = isOpen && isTypedAnswer(answerOption, value);
  const [otherSelected, setOtherSelected] = useState(typedAnswer);
  const setValue = (newValue: any): void => form.setFieldValue(fieldPath, newValue);

  if (original.answerValueSet && answerOption.length === 0) {
    return <PreviewValueSetChoice {...props} values={isEmptyAnswerValue(value) ? [] : [value]} />;
  }

  if (original.itemControl?.code === 'drop-down' || original.itemControl?.code === 'autocomplete') {
    if (isOpen) {
      // Suggests the options, and takes any other text as the answer.
      return (
        <Autocomplete
          {...labelProps}
          disabled={readOnly}
          placeholder="Select or type an answer"
          data={[...new Set(answerOption.map(getAnswerOptionLabel))]}
          value={toChoiceText(answerOption, value)}
          error={form.errors[fieldPath]}
          onChange={(text) => setValue(fromChoiceText(answerOption, text))}
        />
      );
    }
    if (original.itemControl?.code === 'autocomplete') {
      return (
        <Select
          {...labelProps}
          disabled={readOnly}
          searchable
          clearable
          placeholder="Type to search"
          data={toOptionData(answerOption)}
          value={isEmptyAnswerValue(value) ? null : getChoiceValueKey(value)}
          error={form.errors[fieldPath]}
          onChange={(key) => setValue(findOptionValue(answerOption, key))}
        />
      );
    }
    return (
      <NativeSelect
        {...labelProps}
        disabled={readOnly}
        data={[{ value: '', label: 'Select an option' }, ...toOptionData(answerOption)]}
        value={isEmptyAnswerValue(value) ? '' : getChoiceValueKey(value)}
        error={form.errors[fieldPath]}
        onChange={(e) => setValue(findOptionValue(answerOption, e.currentTarget.value))}
      />
    );
  }

  const radios = [
    ...answerOption.map((option) => (
      <Radio
        key={getChoiceValueKey(option.value)}
        value={getChoiceValueKey(option.value)}
        label={getAnswerOptionDisplay(option)}
        disabled={readOnly}
      />
    )),
    ...(isOpen ? [<Radio key={OTHER_OPTION} value={OTHER_OPTION} label="Other" disabled={readOnly} />] : []),
  ];
  let radioValue: string | null = null;
  if (otherSelected || typedAnswer) {
    radioValue = OTHER_OPTION;
  } else if (!isEmptyAnswerValue(value)) {
    radioValue = getChoiceValueKey(value);
  }

  return (
    <Stack gap="xs">
      <Radio.Group
        {...labelProps}
        value={radioValue}
        error={form.errors[fieldPath]}
        onChange={(key) => {
          setOtherSelected(key === OTHER_OPTION);
          setValue(key === OTHER_OPTION ? '' : findOptionValue(answerOption, key));
        }}
      >
        <Stack gap={isHorizontal ? 'md' : 'xs'} mt="xs">
          {isHorizontal ? <Group gap="xl">{radios}</Group> : radios}
        </Stack>
      </Radio.Group>
      {radioValue === OTHER_OPTION && (
        <TextInput
          aria-label="Other"
          placeholder="Please specify"
          disabled={readOnly}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => setValue(e.currentTarget.value)}
        />
      )}
    </Stack>
  );
}

/**
 * A repeating choice question: multiple answers are allowed, one per selected option. Rendered as a multi-select
 * drop-down or checkboxes based on the item control. An open-choice question also takes answers typed by the
 * respondent.
 * @param props - The preview answer props.
 * @returns The PreviewRepeatingChoice React node.
 */
function PreviewRepeatingChoice(props: PreviewAnswerProps): JSX.Element {
  const { item, original, readOnly } = props;
  const form = useQuestionnaireFormContext();
  const answersPath = `${item.answerPath}.answer`;
  const answers: ExtendedQuestionnaireItemAnswer[] = getValueByPath(form.getValues(), answersPath) ?? [];
  const answerOption: ExtendedQuestionnaireItemAnswerOption[] = original.answerOption ?? [];
  const isOpen = original.type === 'open-choice';
  const labelProps = getAnswerLabel({ ...props, answerIndex: 0 });
  const values = answers.map((answer) => answer.value).filter((value) => !isEmptyAnswerValue(value));
  const typedValues = values.filter((value) => isTypedAnswer(answerOption, value));
  const [otherChecked, setOtherChecked] = useState(typedValues.length > 0);

  const setValues = (requestedValues: any[]): void => {
    // "None of the above" and other exclusive options clear the other answers (and the other way round).
    const newValues = applyExclusiveOptions(answerOption, values, requestedValues);
    // Answers that stay selected keep their follow-up items.
    form.setFieldValue(
      answersPath,
      newValues.map(
        (value) => answers.find((answer) => getChoiceValueKey(answer.value) === getChoiceValueKey(value)) ?? { value }
      )
    );
    rebuildAnswerItems(form, original);
  };

  if (original.answerValueSet && answerOption.length === 0) {
    return <PreviewValueSetChoice {...props} values={values} multiple />;
  }

  if (['drop-down', 'multi-select', 'autocomplete'].includes(original.itemControl?.code as string)) {
    if (isOpen) {
      return (
        <TagsInput
          {...labelProps}
          disabled={readOnly}
          placeholder="Select or type answers"
          data={[...new Set(answerOption.map(getAnswerOptionLabel))]}
          value={values.map((value) => toChoiceText(answerOption, value))}
          error={form.errors[answersPath]}
          onChange={(texts) => setValues(texts.map((text) => fromChoiceText(answerOption, text)))}
        />
      );
    }
    return (
      <MultiSelect
        {...labelProps}
        disabled={readOnly}
        searchable={original.itemControl?.code === 'autocomplete'}
        placeholder={original.itemControl?.code === 'autocomplete' ? 'Type to search' : 'Select items'}
        data={toOptionData(answerOption)}
        value={values.map(getChoiceValueKey)}
        error={form.errors[answersPath]}
        onChange={(keys) => setValues(keys.map((key) => findOptionValue(answerOption, key)))}
      />
    );
  }

  const selectedKeys = values.filter((value) => !isTypedAnswer(answerOption, value)).map(getChoiceValueKey);
  const typedValue = typedValues[0] ?? '';

  return (
    <Stack gap="xs">
      <Checkbox.Group
        {...labelProps}
        value={[...selectedKeys, ...(otherChecked ? [OTHER_OPTION] : [])]}
        error={form.errors[answersPath]}
        onChange={(keys) => {
          const checkOther = keys.includes(OTHER_OPTION);
          setOtherChecked(checkOther);
          const optionValues = keys
            .filter((key) => key !== OTHER_OPTION)
            .map((key) => findOptionValue(answerOption, key));
          setValues([...optionValues, ...(checkOther && typedValue ? [typedValue] : [])]);
        }}
      >
        <Stack gap="xs" mt="xs">
          {answerOption.map((option) => (
            <Checkbox
              key={getChoiceValueKey(option.value)}
              value={getChoiceValueKey(option.value)}
              label={getAnswerOptionDisplay(option)}
              disabled={readOnly}
            />
          ))}
          {isOpen && <Checkbox value={OTHER_OPTION} label="Other" disabled={readOnly} />}
        </Stack>
      </Checkbox.Group>
      {isOpen && otherChecked && (
        <TextInput
          aria-label="Other"
          placeholder="Please specify"
          disabled={readOnly}
          value={typedValue}
          onChange={(e) => {
            const text = e.currentTarget.value;
            const optionValues = values.filter((value) => !isTypedAnswer(answerOption, value));
            setValues([...optionValues, ...(text ? [text] : [])]);
          }}
        />
      )}
    </Stack>
  );
}

interface PreviewValueSetChoiceProps extends PreviewAnswerProps {
  readonly values: any[];
  readonly multiple?: boolean;
}

/**
 * A choice question whose answers come from a value set (answerValueSet): the codes are searched as the respondent
 * types, as in Medplum's QuestionnaireForm. An open-choice question also takes text that is not in the value set.
 * @param props - The PreviewValueSetChoice props.
 * @returns The PreviewValueSetChoice React node.
 */
function PreviewValueSetChoice(props: PreviewValueSetChoiceProps): JSX.Element {
  const { item, original, answerIndex, readOnly, values, multiple } = props;
  const form = useQuestionnaireFormContext();
  const answersPath = `${item.answerPath}.answer`;
  const fieldPath = multiple ? answersPath : getFieldPath(item, answerIndex);
  const isOpen = original.type === 'open-choice';

  return (
    <ValueSetAutocomplete
      {...getAnswerLabel(props)}
      binding={original.answerValueSet}
      creatable={isOpen}
      clearable
      disabled={readOnly}
      maxValues={multiple ? undefined : 1}
      placeholder={isOpen ? 'Search or type an answer' : 'Search'}
      defaultValue={values.map(toValueSetContains)}
      error={form.errors[fieldPath]}
      onChange={(selected) => {
        // A code the respondent typed (not in the value set) has no system: it is a typed answer.
        const newValues = selected.map((entry) =>
          entry.system
            ? { system: entry.system, code: entry.code, display: entry.display }
            : (entry.display ?? entry.code)
        );
        if (multiple) {
          form.setFieldValue(
            answersPath,
            newValues.map((value) => ({ value }))
          );
          rebuildAnswerItems(form, original);
        } else {
          form.setFieldValue(fieldPath, newValues[0] ?? '');
        }
      }}
    />
  );
}

function toValueSetContains(value: any): ValueSetExpansionContains {
  if (value && typeof value === 'object') {
    return { system: value.system, code: value.code, display: value.display };
  }
  return { code: String(value), display: String(value) };
}

function isChoiceType(type: string | undefined): boolean {
  return type === 'choice' || type === 'open-choice';
}

/**
 * Returns true if an answer was typed by the respondent (an open-choice answer that is none of the options).
 * @param answerOption - The item's answer options.
 * @param value - The answer value.
 * @returns True for a typed answer.
 */
function isTypedAnswer(answerOption: ExtendedQuestionnaireItemAnswerOption[], value: any): boolean {
  return typeof value === 'string' && value !== '' && !findAnswerOption(answerOption, value);
}

function findOptionValue(answerOption: ExtendedQuestionnaireItemAnswerOption[], key: string | null): any {
  return answerOption.find((option) => getChoiceValueKey(option.value) === key)?.value ?? '';
}

/**
 * The text of a choice answer in a free-text field: the selected option's label, or the typed answer.
 * @param answerOption - The item's answer options.
 * @param value - The answer value.
 * @returns The text.
 */
function toChoiceText(answerOption: ExtendedQuestionnaireItemAnswerOption[], value: any): string {
  const option = findAnswerOption(answerOption, value);
  if (option) {
    return getAnswerOptionLabel(option);
  }
  return typeof value === 'string' ? value : String(value?.display ?? value?.code ?? '');
}

/**
 * The answer for text entered in a free-text field: the option with that label, or the text itself.
 * @param answerOption - The item's answer options.
 * @param text - The text.
 * @returns The answer value.
 */
function fromChoiceText(answerOption: ExtendedQuestionnaireItemAnswerOption[], text: string): any {
  return answerOption.find((option) => getAnswerOptionLabel(option) === text)?.value ?? text;
}

function toOptionData(answerOption: ExtendedQuestionnaireItemAnswerOption[]): { value: string; label: string }[] {
  return answerOption.map((option) => ({
    value: getChoiceValueKey(option.value),
    label: getAnswerOptionDisplay(option),
  }));
}
