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
import { useElementSize } from '@mantine/hooks';
import { normalizeErrorString } from '@medplum/core';
import type { Coding, Quantity, QuestionnaireItem, QuestionnaireResponse, Signature } from '@medplum/fhirtypes';
import type { QuestionnaireFormPaginationState } from '@medplum/react-hooks';
import { IconExternalLink, IconHelp, IconInfoCircle, IconLock, IconPlus, IconTrash } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX, ReactNode, WheelEvent } from 'react';
import { Fragment, useContext, useEffect, useState } from 'react';
import { AttachmentInput } from '../AttachmentInput/AttachmentInput';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { QuestionnaireFormStepper } from '../QuestionnaireForm/QuestionnaireFormStepper';
import { ReferenceInput } from '../ReferenceInput/ReferenceInput';
import { SignatureInput } from '../SignatureInput/SignatureInput';
import { ValueSetAutocomplete } from '../ValueSetAutocomplete/ValueSetAutocomplete';
import {
  QuestionnaireResponseFormProvider,
  useQuestionnaireFormContext,
  useQuestionnaireResponseForm,
  useQuestionnaireResponseFormContext,
} from './QuestionnaireFormContext';
import type {
  ExtendedQuestionnaireItem,
  ExtendedQuestionnaireItemAnswerOption,
  QuestionnaireMode,
} from './QuestionnaireFormV2.utils';
import {
  evaluateEnableWhen,
  findAnswerOption,
  findRootItem,
  getAnswerOptionDisplay,
  getAnswerOptionLabel,
  getAnswerValue,
  getChoiceValueKey,
  getGroupErrorKey,
  getNewAnswer,
  getPageItems,
  getReferenceSearchCriteria,
  getRequiredGroupError,
  getRequiredSignatureType,
  getResponseItemIndexes,
  getResponseSignature,
  getValueByPath,
  isChoiceItemType,
  isEmptyAnswerValue,
  isHeaderOrFooterItem,
  isHorizontalChoiceLayout,
  isQuantityAnswer,
  isReadOnlyFormItem,
  isShownInMode,
  isUsedInMode,
  toDraftResponse,
  toFhirQuestionnaireResponse,
  toQuantityUnit,
  validateFormAnswers,
} from './QuestionnaireFormV2.utils';
import { QuestionnaireModeContext } from './QuestionnaireModeContext';
import classes from './QuestionnaireRenderer.module.css';
import {
  addRepetition,
  findOptionValue,
  fromChoiceText,
  getAnswers,
  getAttachedText,
  getDecimalPlaces,
  isChoiceTable,
  isGroupTable,
  isTypedAnswer,
  setAnswerValue,
  setChoiceAnswers,
  toChoiceText,
  toOptionData,
  toValueSetContains,
} from './QuestionnaireRenderer.utils';
import { useAnswer } from './useAnswer';
import { useCalculatedAnswers } from './useCalculatedAnswers';
import { useNumberText } from './useNumberText';
import { useSyncedResponse } from './useSyncedResponse';

export interface QuestionnaireRendererProps {
  readonly items: ExtendedQuestionnaireItem[];
  readonly selectedItem?: ExtendedQuestionnaireItem | undefined;
  readonly ignoreValidation?: boolean;
  readonly submitButtonText?: string;
  /** Hides the Submit (and, when paginated, Back/Next) buttons, e.g. for a read-only preview. */
  readonly excludeButtons?: boolean;
  /** An existing response to continue: its answers prefill the form, and its signature is shown. */
  readonly questionnaireResponse?: QuestionnaireResponse;
  /** Called on submit once all shown answers are valid (and the form is signed, if a signature is required). */
  readonly onSubmit?: (response: QuestionnaireResponse) => void;
  /**
   * Fill in the form (capture, the default), or view its answers read-only (display). Items appear in either by their
   * usage mode (questionnaire-usageMode).
   */
  readonly mode?: QuestionnaireMode;
}

interface RenderedSignatureProps {
  readonly defaultValue: Signature | undefined;
  readonly missing: boolean;
  readonly onChange: (value: Signature | undefined) => void;
}

/**
 * The respondent's signature, with Medplum's SignatureInput, as wide as the questions above it.
 * @param props - The RenderedSignature React props.
 * @returns The RenderedSignature React node.
 */
function RenderedSignature(props: RenderedSignatureProps): JSX.Element {
  const { defaultValue, missing, onChange } = props;
  const { ref, width } = useElementSize();

  return (
    <Stack gap={4} className={classes.item}>
      <Text size="sm" fw={500}>
        Signature
      </Text>
      <div ref={ref}>
        {width > 0 && <SignatureInput width={Math.floor(width)} defaultValue={defaultValue} onChange={onChange} />}
      </div>
      {missing && (
        <Text c="red" size="sm">
          Signature is required.
        </Text>
      )}
    </Stack>
  );
}

/**
 * Renders a questionnaire's items to be filled in (or their answers viewed). The answers are kept in a draft
 * QuestionnaireResponse, apart from the items, so the builder can edit the items while its preview is filled in.
 * @param props - The QuestionnaireRenderer React props.
 * @returns The QuestionnaireRenderer React node.
 */
export function QuestionnaireRenderer(props: QuestionnaireRendererProps): JSX.Element {
  const {
    items,
    selectedItem,
    ignoreValidation,
    submitButtonText,
    excludeButtons,
    questionnaireResponse,
    onSubmit,
    mode = 'capture',
  } = props;
  const form = useQuestionnaireFormContext();
  const [initialResponse] = useState(() => toDraftResponse(items, questionnaireResponse));
  const [defaultSignature] = useState(() => getResponseSignature(questionnaireResponse));
  const responseForm = useQuestionnaireResponseForm({
    mode: 'uncontrolled',
    initialValues: initialResponse,
  });
  useSyncedResponse(responseForm, items);
  const values = form.getValues();
  const response = responseForm.getValues() as QuestionnaireResponse;
  const viewing = mode === 'display';
  // With pages, only pages are shown, and of those only the pages that are not hidden and whose conditions are met.
  const pageItems = getPageItems(items)?.filter(
    (page) =>
      !page.hidden &&
      evaluateEnableWhen(values, response, page, 'item') &&
      isShownInMode(values, response, page, 'item', mode)
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
  const fixedItemProps = { selectedItem, ignoreValidation, viewing };
  // As in Medplum's QuestionnaireForm: one signature for the whole form, below its last page.
  const signatureRequired = !!getRequiredSignatureType(values);
  const [signature, setSignature] = useState<Signature | undefined>(defaultSignature);
  const [signatureMissing, setSignatureMissing] = useState(false);
  // Answers are not calculated when viewing them: they are the answers given.
  const calculation = useCalculatedAnswers(form, responseForm, !viewing);

  /**
   * Validates the given items, shows their errors and reports whether they are valid.
   * @param scope - The items to validate.
   * @returns True if the items have no errors.
   */
  const validate = (scope: ExtendedQuestionnaireItem[]): boolean => {
    if (ignoreValidation) {
      return true;
    }
    const errors = validateFormAnswers(form.getValues(), responseForm.getValues() as QuestionnaireResponse, scope);
    responseForm.setErrors({ ...calculation.current.errors, ...errors });
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
    onSubmit?.(
      toFhirQuestionnaireResponse(
        form.getValues(),
        responseForm.getValues() as QuestionnaireResponse,
        signatureRequired ? signature : undefined
      )
    );
  };

  const signatureSection = signatureRequired && !viewing && (!pageItems || currentPage === pageItems.length - 1) && (
    <RenderedSignature
      defaultValue={defaultSignature}
      missing={signatureMissing}
      onChange={(value) => {
        setSignature(value);
        setSignatureMissing(false);
      }}
    />
  );

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    const element = document.querySelector(`[data-renderer-link-id="${CSS.escape(selectedItem.linkId)}"]`);
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
    <QuestionnaireResponseFormProvider form={responseForm}>
      <div className={classes.root}>
        {/* Visible overflow lets a header or footer stick to the scrolling view. */}
        <Card withBorder style={headerItems.length + footerItems.length > 0 ? { overflow: 'visible' } : undefined}>
          <Card.Section withBorder inheritPadding py="md">
            <Title order={3} ta="center">
              {values.title || 'Untitled'}
            </Title>
          </Card.Section>
          <Card.Section inheritPadding py="md">
            <QuestionnaireModeContext.Provider value={mode}>
              <Form onSubmit={handleSubmit}>
                {pageItems?.length === 0 && (
                  <Text c="dimmed" ta="center">
                    No pages are shown.
                  </Text>
                )}
                <RenderedFixedItems items={headerItems} position="header" {...fixedItemProps} />
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
                        <RenderedPage
                          key={pageItems[currentPage].linkId}
                          page={pageItems[currentPage]}
                          selectedItem={selectedItem}
                          ignoreValidation={ignoreValidation}
                        />
                      </ViewOnly>
                    </QuestionnaireFormStepper>
                    <RenderedFixedItems items={footerItems} position="footer" {...fixedItemProps} />
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
                          <RenderedItem
                            key={`${item.linkId}-${index}`}
                            item={item}
                            context="item"
                            selectedItem={selectedItem}
                            index={index}
                            ignoreValidation={ignoreValidation}
                          />
                        ))}
                      </Stack>
                    </ViewOnly>
                    <RenderedFixedItems items={footerItems} position="footer" {...fixedItemProps} />
                    {signatureSection}
                    {!excludeButtons && !viewing && (
                      <Group justify="flex-end" mt="xl">
                        <SubmitButton>{submitButtonText ?? 'Submit'}</SubmitButton>
                      </Group>
                    )}
                  </Stack>
                )}
              </Form>
            </QuestionnaireModeContext.Provider>
          </Card.Section>
        </Card>
      </div>
    </QuestionnaireResponseFormProvider>
  );
}

interface RenderedFixedItemsProps {
  readonly items: ExtendedQuestionnaireItem[];
  readonly position: 'header' | 'footer';
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly ignoreValidation?: boolean;
  readonly viewing: boolean;
}

/**
 * Header or footer groups (item control `header`/`footer`), kept in view at the top or bottom of the scrolling form.
 * @param props - The RenderedFixedItems props.
 * @returns The RenderedFixedItems React node, or null without such groups.
 */
function RenderedFixedItems(props: RenderedFixedItemsProps): JSX.Element | null {
  const { items, position, selectedItem, ignoreValidation, viewing } = props;
  if (items.length === 0) {
    return null;
  }
  return (
    <div className={cx(classes.fixedItems, position === 'header' ? classes.header : classes.footer)}>
      <ViewOnly viewing={viewing}>
        {items.map((item, index) => (
          <RenderedItem
            key={item.linkId}
            item={item}
            context="item"
            selectedItem={selectedItem}
            index={index}
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

interface RenderedPageProps {
  readonly page: ExtendedQuestionnaireItem;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly ignoreValidation?: boolean;
}

/**
 * A page's items, rendered without the group header and border: the stepper shows the page title.
 * @param props - The RenderedPage props.
 * @returns The RenderedPage React node.
 */
function RenderedPage(props: RenderedPageProps): JSX.Element {
  const { page, selectedItem, ignoreValidation } = props;
  const responseForm = useQuestionnaireResponseFormContext();
  const repetitions = getResponseItemIndexes(responseForm.getValues(), 'item', page.linkId);

  return (
    <Stack gap="md" mt="md">
      <RequiredGroupError item={page} context="item" />
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
      {repetitions.map((repetition) =>
        (page.item ?? []).map((child: ExtendedQuestionnaireItem, childIndex: number) => (
          <RenderedItem
            key={`${page.linkId}-${repetition}-${childIndex}`}
            item={child}
            context={`item.${repetition}.item`}
            selectedItem={selectedItem}
            index={childIndex}
            ignoreValidation={ignoreValidation}
          />
        ))
      )}
    </Stack>
  );
}

interface RenderedItemProps {
  readonly item: ExtendedQuestionnaireItem;
  /** The response path of the response items the item is answered in, e.g. `item` or `item.0.item`. */
  readonly context: string;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly index: number;
  readonly ignoreValidation?: boolean;
}

function RenderedItem(props: RenderedItemProps): JSX.Element | null {
  const { item, context, selectedItem, index, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();
  const responseForm = useQuestionnaireResponseFormContext();
  const mode = useContext(QuestionnaireModeContext);
  const values = form.getValues();
  const response = responseForm.getValues() as QuestionnaireResponse;

  if (
    item.hidden ||
    !evaluateEnableWhen(values, response, item, context) ||
    !isShownInMode(values, response, item, context, mode)
  ) {
    return null;
  }

  if (item.type === 'group') {
    return (
      <RenderedGroup
        item={item}
        context={context}
        selectedItem={selectedItem}
        index={index}
        ignoreValidation={ignoreValidation}
      />
    );
  } else if (item.type === 'display') {
    return (
      <RenderedSelectedItem item={item} selectedItem={selectedItem} index={index}>
        <RenderedDisplay item={item} />
      </RenderedSelectedItem>
    );
  }

  const indexes = getResponseItemIndexes(response, context, item.linkId);
  if (indexes.length === 0) {
    // A question added in the builder, until useSyncedResponse adds it to the draft response.
    return null;
  }
  const answersPath = `${context}.${indexes[0]}.answer`;
  const answers = getAnswers(responseForm, answersPath);
  const followUpProps = { item, selectedItem, ignoreValidation };
  const readOnly = isReadOnlyFormItem(values, item);

  if (isChoiceItemType(item.type) && item.repeats) {
    return (
      <RenderedSelectedItem item={item} selectedItem={selectedItem} index={index}>
        <Stack gap="md">
          <Stack gap={4}>
            <RenderedRepeatingChoice item={item} answersPath={answersPath} answerIndex={0} readOnly={readOnly} />
            <RenderedAttachedTexts item={item} />
          </Stack>
          {/* Each selected option has its own follow-up items. */}
          {answers.map((answer, answerIndex) => (
            <RenderedFollowUpItems
              key={`${item.linkId}-${getChoiceValueKey(getAnswerValue(item, answer))}-${answerIndex}`}
              answerPath={`${answersPath}.${answerIndex}`}
              label={toChoiceText(item.answerOption ?? [], getAnswerValue(item, answer))}
              {...followUpProps}
            />
          ))}
        </Stack>
      </RenderedSelectedItem>
    );
  }

  return (
    <RenderedSelectedItem item={item} selectedItem={selectedItem} index={index}>
      <Stack gap="md">
        {answers.map((_answer, answerIndex: number) => (
          <Fragment key={`${item.linkId}-${answerIndex}`}>
            <Stack gap={4}>
              <RenderedAnswer
                item={item}
                answersPath={answersPath}
                answerIndex={answerIndex}
                ignoreValidation={ignoreValidation}
                readOnly={readOnly}
                repeat={{
                  index: answerIndex,
                  count: answers.length,
                  onAdd: () =>
                    responseForm.insertListItem(answersPath, getNewAnswer(item, answers.length), answers.length),
                  onRemove: () => responseForm.removeListItem(answersPath, answerIndex),
                }}
              />
              <RenderedAttachedTexts item={item} />
            </Stack>
            <RenderedFollowUpItems answerPath={`${answersPath}.${answerIndex}`} {...followUpProps} />
          </Fragment>
        ))}
      </Stack>
    </RenderedSelectedItem>
  );
}

function RenderedAnswer(props: RenderedAnswerProps): JSX.Element | null {
  const type = props.item.type;
  if (isChoiceItemType(type) && props.item.repeats) {
    return <RenderedRepeatingChoice {...props} />;
  } else if (type === 'quantity') {
    return <RenderedQuantity {...props} />;
  } else if (type === 'reference') {
    return <RenderedReference {...props} />;
  } else if (type === 'attachment') {
    return <RenderedAttachment {...props} />;
  } else if (['string', 'integer', 'decimal', 'url'].includes(type)) {
    return <RenderedInput {...props} />;
  } else if (type === 'boolean') {
    return <RenderedBoolean {...props} />;
  } else if (type === 'text') {
    return <RenderedTextarea {...props} />;
  } else if (['date', 'dateTime', 'time'].includes(type)) {
    return <RenderedDateTime {...props} />;
  } else if (isChoiceItemType(type)) {
    return <RenderedChoice {...props} />;
  }
  return null;
}

/**
 * Display text, styled by its display category (questionnaire-displayCategory): instructions and security notices as
 * boxes, help as muted text; other text as before.
 * @param props - The RenderedDisplay props.
 * @param props.item - The display item.
 * @returns The RenderedDisplay React node.
 */
function RenderedDisplay(props: { readonly item: ExtendedQuestionnaireItem }): JSX.Element {
  const { item } = props;
  const title = <RenderedQuestion item={item} />;

  switch (item.displayCategory?.code) {
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
 * @param props - The RenderedAttachedTexts props.
 * @param props.item - The question.
 * @returns The texts, or null without any.
 */
function RenderedAttachedTexts(props: { readonly item: ExtendedQuestionnaireItem }): JSX.Element | null {
  const { item } = props;
  const lower = getAttachedText(item, 'lower');
  const upper = getAttachedText(item, 'upper');
  const prompt = getAttachedText(item, 'prompt');
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

interface RenderedFollowUpItemsProps {
  /** The question the items are follow-up items of. */
  readonly item: ExtendedQuestionnaireItem;
  /** The response path of the answer the items belong to. */
  readonly answerPath: string;
  /** Names the answer the items belong to, when a question has several answers. */
  readonly label?: string;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly ignoreValidation?: boolean;
}

/**
 * The follow-up items of one answer of a question, shown once the question is answered.
 * @param props - The RenderedFollowUpItems props.
 * @returns The RenderedFollowUpItems React node, or null when none are shown.
 */
function RenderedFollowUpItems(props: RenderedFollowUpItemsProps): JSX.Element | null {
  const { item, answerPath, label, selectedItem, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();
  const responseForm = useQuestionnaireResponseFormContext();
  const mode = useContext(QuestionnaireModeContext);
  const values = form.getValues();
  const response = responseForm.getValues() as QuestionnaireResponse;

  if (isEmptyAnswerValue(getAnswerValue(item, getValueByPath(response, answerPath)))) {
    return null;
  }

  const context = `${answerPath}.item`;
  const shownItems = (item.item ?? []).filter(
    (child) =>
      !child.hidden &&
      evaluateEnableWhen(values, response, child, context) &&
      isShownInMode(values, response, child, context, mode)
  );

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
        <RenderedItem
          key={`${context}-${child.linkId}`}
          item={child}
          context={context}
          selectedItem={selectedItem}
          index={childIndex}
          ignoreValidation={ignoreValidation}
        />
      ))}
    </div>
  );
}

interface RenderedGroupProps {
  readonly item: ExtendedQuestionnaireItem;
  /** The response path of the response items the group is answered in. */
  readonly context: string;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly index: number;
  readonly ignoreValidation?: boolean;
}

function RenderedGroup(props: RenderedGroupProps): JSX.Element {
  const { item, context, selectedItem, index, ignoreValidation } = props;
  const responseForm = useQuestionnaireResponseFormContext();

  if (isGroupTable(item)) {
    return <RenderedGroupTable {...props} />;
  }

  const repetitions = getResponseItemIndexes(responseForm.getValues(), context, item.linkId);
  const hasItems = (item.item ?? []).length > 0;

  return (
    <RenderedSelectedItem item={item} selectedItem={selectedItem} index={index}>
      {!hasItems && (
        <>
          <RenderedQuestion item={item} />
          <Divider my="xs" />
        </>
      )}

      {repetitions.map((repetition, repetitionIndex) => {
        const repetitionContext = `${context}.${repetition}.item`;
        return (
          <Fragment key={`${item.linkId}-${repetitionIndex}`}>
            {hasItems && (
              <>
                <RenderedQuestion
                  item={item}
                  repeat={{
                    index: repetitionIndex,
                    count: repetitions.length,
                    onAdd: () => addRepetition(responseForm, context, item.linkId),
                    onRemove: () => responseForm.removeListItem(context, repetition),
                  }}
                />
                <Divider my="xs" />
              </>
            )}

            {isChoiceTable(item) ? (
              <RenderedChoiceTable
                group={item}
                context={repetitionContext}
                transposed={item.itemControl?.code === 'htable'}
                ignoreValidation={ignoreValidation}
              />
            ) : (
              <div className={classes.groupAnswers}>
                {(item.item ?? []).map((child: ExtendedQuestionnaireItem, childIndex: number) => (
                  <RenderedItem
                    key={`${item.linkId}-${repetitionIndex}-${childIndex}`}
                    item={child}
                    context={repetitionContext}
                    selectedItem={selectedItem}
                    index={childIndex}
                    ignoreValidation={ignoreValidation}
                  />
                ))}
              </div>
            )}
          </Fragment>
        );
      })}
      <RequiredGroupError item={item} context={context} />
    </RenderedSelectedItem>
  );
}

interface RenderedChoiceTableProps {
  readonly group: ExtendedQuestionnaireItem;
  /** The response path of the response items of one repetition of the group. */
  readonly context: string;
  /** False: questions are rows and options columns (`table`, `atable`); true: the other way round (`htable`). */
  readonly transposed: boolean;
  readonly ignoreValidation?: boolean;
}

/**
 * The choice questions of a table group as a grid: one radio button (or checkbox, for a repeating question) per
 * question and option. Options are the questions' own, in the order they first appear.
 * @param props - The RenderedChoiceTable props.
 * @returns The RenderedChoiceTable React node.
 */
function RenderedChoiceTable(props: RenderedChoiceTableProps): JSX.Element {
  const { group, context, transposed, ignoreValidation } = props;
  const form = useQuestionnaireFormContext();
  const responseForm = useQuestionnaireResponseFormContext();
  const mode = useContext(QuestionnaireModeContext);
  const values = form.getValues();
  const response = responseForm.getValues() as QuestionnaireResponse;
  const questions = (group.item ?? [])
    .filter(
      (question) =>
        !question.hidden &&
        evaluateEnableWhen(values, response, question, context) &&
        isShownInMode(values, response, question, context, mode)
    )
    .flatMap((question) => {
      const indexes = getResponseItemIndexes(response, context, question.linkId);
      return indexes.length > 0 ? [{ question, answersPath: `${context}.${indexes[0]}.answer` }] : [];
    });

  const options: ExtendedQuestionnaireItemAnswerOption[] = [];
  for (const { question } of questions) {
    for (const option of question.answerOption ?? []) {
      if (!options.some((known) => getChoiceValueKey(known.value) === getChoiceValueKey(option.value))) {
        options.push(option);
      }
    }
  }

  const cell = (
    question: ExtendedQuestionnaireItem,
    answersPath: string,
    option: ExtendedQuestionnaireItemAnswerOption
  ): JSX.Element | null => {
    const own = findAnswerOption(question.answerOption, option.value);
    if (!own) {
      return null;
    }
    const selected = getAnswers(responseForm, answersPath)
      .map((answer) => getAnswerValue(question, answer))
      .filter((value) => !isEmptyAnswerValue(value));
    const checked = selected.some((value) => getChoiceValueKey(value) === getChoiceValueKey(own.value));
    const readOnly = isReadOnlyFormItem(values, question);
    const label = `${question.text ?? ''}: ${getAnswerOptionDisplay(own)}`;

    if (question.repeats) {
      return (
        <Checkbox
          aria-label={label}
          checked={checked}
          disabled={readOnly}
          onChange={(e) => {
            const others = selected.filter((value) => getChoiceValueKey(value) !== getChoiceValueKey(own.value));
            setChoiceAnswers(
              responseForm,
              question,
              answersPath,
              e.currentTarget.checked ? [...others, own.value] : others
            );
          }}
        />
      );
    }
    return (
      <Radio
        aria-label={label}
        checked={checked}
        disabled={readOnly}
        onChange={() => setAnswerValue(responseForm, question, `${answersPath}.0`, own.value, ignoreValidation)}
      />
    );
  };

  const questionHeader = (question: ExtendedQuestionnaireItem, answersPath: string): JSX.Element => {
    const errorPath = question.repeats ? answersPath : `${answersPath}.0`;
    return (
      <>
        {[question.prefix, question.text].filter(Boolean).join(' ')}
        {question.required && (
          <Text component="span" c="red">
            {' '}
            *
          </Text>
        )}
        {responseForm.errors[errorPath] && <Input.Error>{responseForm.errors[errorPath]}</Input.Error>}
      </>
    );
  };

  return (
    <Table withTableBorder withColumnBorders mt="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th />
          {transposed
            ? questions.map(({ question, answersPath }) => (
                <Table.Th key={answersPath}>{questionHeader(question, answersPath)}</Table.Th>
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
                {questions.map(({ question, answersPath }) => (
                  <Table.Td key={answersPath}>
                    <Center>{cell(question, answersPath, option)}</Center>
                  </Table.Td>
                ))}
              </Table.Tr>
            ))
          : questions.map(({ question, answersPath }) => (
              <Table.Tr key={answersPath}>
                <Table.Td>{questionHeader(question, answersPath)}</Table.Td>
                {options.map((option) => (
                  <Table.Td key={getChoiceValueKey(option.value)}>
                    <Center>{cell(question, answersPath, option)}</Center>
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
      </Table.Tbody>
    </Table>
  );
}

/**
 * A group rendered as a table: its questions are the columns and each repetition is a row.
 * @param props - The RenderedGroup props.
 * @returns The RenderedGroupTable React node.
 */
function RenderedGroupTable(props: RenderedGroupProps): JSX.Element {
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
    <RenderedSelectedItem item={item} selectedItem={selectedItem} index={index}>
      <RenderedQuestion item={item} />
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
                        <RenderedAnswer
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
      <RequiredGroupError item={item} context={context} />
    </RenderedSelectedItem>
  );
}

/**
 * Shows a required group's error once validation has found it, until the group is answered.
 * @param props - The RequiredGroupError props.
 * @param props.item - The group.
 * @param props.context - The response path of the response items the group is answered in.
 * @returns The error, or null.
 */
function RequiredGroupError(props: {
  readonly item: ExtendedQuestionnaireItem;
  readonly context: string;
}): JSX.Element | null {
  const { item, context } = props;
  const form = useQuestionnaireFormContext();
  const responseForm = useQuestionnaireResponseFormContext();
  const message =
    responseForm.errors[getGroupErrorKey(context, item.linkId)] &&
    getRequiredGroupError(form.getValues(), responseForm.getValues() as QuestionnaireResponse, item, context);
  return message ? <Input.Error mt="xs">{message}</Input.Error> : null;
}

interface RenderedSelectedItemProps {
  readonly item: ExtendedQuestionnaireItem;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly index: number;
  readonly children: ReactNode;
}

function RenderedSelectedItem(props: RenderedSelectedItemProps): JSX.Element {
  const { item, selectedItem, index, children } = props;
  const isSelected = selectedItem?.linkId === item.linkId;

  return (
    <div
      id={`item-${item.linkId}-${index}`}
      data-renderer-link-id={item.linkId}
      className={cx(classes.item, isSelected && classes.selected)}
    >
      {children}
    </div>
  );
}

/** One answer of a repeating question, or one repetition of a repeating group, with its add and remove buttons. */
interface RepeatControls {
  readonly index: number;
  readonly count: number;
  readonly onAdd: () => void;
  readonly onRemove: () => void;
}

interface RenderedQuestionProps {
  readonly item: ExtendedQuestionnaireItem;
  /** The answer (or group repetition) the question is shown for, when the item repeats. */
  readonly repeat?: RepeatControls;
}

function RenderedQuestion(props: RenderedQuestionProps): JSX.Element {
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

interface RenderedAnswerProps {
  readonly item: ExtendedQuestionnaireItem;
  /** The response path of the question's answers. */
  readonly answersPath: string;
  readonly answerIndex: number;
  readonly ignoreValidation?: boolean;
  readonly readOnly?: boolean;
  /** Renders the input without its question label, e.g. in a group table cell. */
  readonly inline?: boolean;
  /** The add and remove buttons of a repeating question's answer. */
  readonly repeat?: RepeatControls;
}

/**
 * The question label of an answer input, or none for an inline input.
 * @param props - The rendered answer props.
 * @returns The label and the input's accessible name.
 */
function getAnswerLabel(props: RenderedAnswerProps): {
  label?: JSX.Element;
  labelProps?: { className: string };
  'aria-label'?: string;
} {
  const { item, repeat, inline } = props;
  if (inline) {
    return { 'aria-label': item.text };
  }
  return {
    label: <RenderedQuestion item={item} repeat={repeat} />,
    // Full width, so the question's buttons sit on the right as in a group header.
    labelProps: { className: classes.answerLabel },
  };
}

function RenderedInput(props: RenderedAnswerProps): JSX.Element {
  const { item, ignoreValidation, readOnly } = props;
  const { value, error, setValue } = useAnswer(props);
  const [numberText, setNumberText] = useNumberText(typeof value === 'number' ? value : undefined);
  const type = item.type;
  const isSlider = (type === 'integer' || type === 'decimal') && item.itemControl?.code === 'slider';
  const minValue = Number(item.minValue ?? 0);
  const maxValue = Number(item.maxValue ?? 100);
  const sliderStepValue = Number(item.sliderStepValue ?? 1);
  const unit = item.unit;
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
          onChange={setValue}
        />
      </Stack>
    );
  }

  if ((type === 'integer' || type === 'decimal') && item.itemControl?.code === 'spinner') {
    return (
      <NumberInput
        {...labelProps}
        disabled={readOnly}
        // Typing is limited to the decimal places (maxDecimalPlaces); other inputs are checked by validateAnswerValue.
        allowDecimal={type === 'decimal' && getDecimalPlaces(item) !== 0}
        decimalScale={type === 'decimal' ? getDecimalPlaces(item) : undefined}
        {...getUnitSection(unit ? (unit.display ?? unit.code) : getAttachedText(item, 'unit'))}
        min={item.minValue === null || item.minValue === '' ? undefined : Number(item.minValue)}
        max={item.maxValue === null || item.maxValue === '' ? undefined : Number(item.maxValue)}
        placeholder={item.entryFormat}
        value={numberText}
        error={error}
        onChange={(val) => {
          setNumberText(val);
          setValue(val);
        }}
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
        placeholder={item.entryFormat}
        value={value ?? ''}
        error={error}
        onChange={(e) => setValue(e.currentTarget.value)}
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
      placeholder={item.entryFormat}
      maxLength={!ignoreValidation && item.maxLength ? item.maxLength : undefined}
      {...getUnitSection(getAttachedText(item, 'unit'))}
      value={value ?? ''}
      error={error}
      onChange={(e) => setValue(e.currentTarget.value)}
    />
  );
}

/**
 * A reference answer, picked with Medplum's ReferenceInput from the question's resource types
 * (questionnaire-referenceResource), narrowed by its search filter (questionnaire-referenceFilter).
 * @param props - The rendered answer props.
 * @returns The RenderedReference React node.
 */
function RenderedReference(props: RenderedAnswerProps): JSX.Element {
  const { item, readOnly } = props;
  const { answerPath, value, error, setValue } = useAnswer(props);
  // With profiles, the answer must conform to one of them (ReferenceInput searches each profile's resource type by
  // `_profile`); otherwise it is any resource of the resource types.
  const profiles = (item.referenceProfile ?? []).filter(Boolean);
  const targetTypes = profiles.length > 0 ? profiles : (item.referenceResource ?? []).filter(Boolean);
  // The renderer has no subject or encounter, so it searches without the filter's $subj and $encounter parameters.
  const searchCriteria = getReferenceSearchCriteria(item);
  const { label, labelProps } = getAnswerLabel(props);

  return (
    <Input.Wrapper label={label} labelProps={labelProps} error={error}>
      <ReferenceInput
        // A new set of resource types starts a new search.
        key={`${answerPath}-${targetTypes.join(',')}`}
        name={answerPath}
        targetTypes={targetTypes.length > 0 ? targetTypes : undefined}
        searchCriteria={searchCriteria}
        disabled={readOnly}
        defaultValue={value && typeof value === 'object' ? value : undefined}
        onChange={(reference) => setValue(reference ?? '')}
      />
    </Input.Wrapper>
  );
}

/**
 * An attachment answer, uploaded with Medplum's AttachmentInput: the file is stored as a Binary and the answer holds
 * its URL, as in Medplum's QuestionnaireForm.
 * @param props - The rendered answer props.
 * @returns The RenderedAttachment React node.
 */
function RenderedAttachment(props: RenderedAnswerProps): JSX.Element {
  const { item, readOnly } = props;
  const { responseForm, answerPath, value, error, setValue } = useAnswer(props);
  const { label, labelProps } = getAnswerLabel(props);

  return (
    <Input.Wrapper label={label} labelProps={labelProps} error={error}>
      <Group py={4}>
        <AttachmentInput
          path=""
          name={answerPath}
          disabled={readOnly}
          // Files of another type, or too large, are not uploaded (mimeType, maxSize).
          accept={item.mimeType?.length ? item.mimeType : undefined}
          maxSize={item.maxSize ? Number(item.maxSize) : undefined}
          onUploadError={(outcome) => responseForm.setFieldError(answerPath, normalizeErrorString(outcome))}
          defaultValue={value && typeof value === 'object' ? value : undefined}
          onChange={(attachment) => setValue(attachment ?? '')}
        />
      </Group>
    </Input.Wrapper>
  );
}

const QUANTITY_COMPARATORS = ['', '<', '<=', '>=', '>'];

/**
 * A quantity answer, as Medplum's QuantityInput: a comparator, the value and the unit. The unit is picked from the
 * question's unit options, fixed by its unit, or typed.
 * @param props - The rendered answer props.
 * @returns The RenderedQuantity React node.
 */
function RenderedQuantity(props: RenderedAnswerProps): JSX.Element {
  const { item, readOnly } = props;
  const { answerPath, value: current, error, setValue } = useAnswer(props);
  // Always with a value key, so an answer with only a unit still counts as unanswered.
  const quantity: Quantity = isQuantityAnswer(current) ? current : { value: current === '' ? undefined : current };
  const unitOptions: Coding[] = (item.unitOption ?? []).filter(Boolean);
  // One allowed unit is the unit; with none, the question's own unit (if any) is.
  let fixedUnit: ReturnType<typeof toQuantityUnit>;
  if (item.unitValueSet) {
    fixedUnit = undefined;
  } else if (unitOptions.length === 1) {
    fixedUnit = toQuantityUnit(unitOptions[0]);
  } else if (unitOptions.length === 0) {
    fixedUnit = toQuantityUnit(item.unit);
  }
  const { label, labelProps, 'aria-label': ariaLabel } = getAnswerLabel(props);

  const setQuantity = (changes: Partial<Quantity>): void => {
    setValue({ ...quantity, ...changes });
  };

  let unitInput: JSX.Element;
  if (item.unitValueSet) {
    // Units searched in a value set (questionnaire-unitValueSet).
    unitInput = (
      <ValueSetAutocomplete
        aria-label="Unit"
        name={`${answerPath}-unit`}
        binding={item.unitValueSet}
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
    <Input.Wrapper label={label} labelProps={labelProps} error={error}>
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
          placeholder={item.entryFormat || 'Value'}
          // A number field keeps what is typed (e.g. "1.") while the answer holds its number.
          value={quantity.value ?? ''}
          error={!!error}
          onWheel={(e: WheelEvent<HTMLInputElement>) => e.currentTarget.blur()}
          onChange={(e) => setQuantity({ value: e.currentTarget.value as unknown as number })}
        />
        {unitInput}
      </Group>
    </Input.Wrapper>
  );
}

function RenderedTextarea(props: RenderedAnswerProps): JSX.Element {
  const { item, ignoreValidation, readOnly } = props;
  const { value, error, setValue } = useAnswer(props);

  return (
    <Textarea
      {...getAnswerLabel(props)}
      disabled={readOnly}
      placeholder={item.entryFormat}
      rows={6}
      maxLength={!ignoreValidation && item.maxLength ? item.maxLength : undefined}
      value={value ?? ''}
      error={error}
      onChange={(e) => setValue(e.currentTarget.value)}
    />
  );
}

function RenderedBoolean(props: RenderedAnswerProps): JSX.Element {
  const { item, readOnly } = props;
  const { value, error, setValue } = useAnswer(props);
  const labelProps = getAnswerLabel(props);

  if (item.itemControl?.code === 'check-box') {
    return (
      <Stack gap="xs">
        {labelProps.label}
        <Checkbox
          aria-label={labelProps['aria-label'] ?? item.text}
          disabled={readOnly}
          checked={value === true}
          onChange={(e) => setValue(e.currentTarget.checked)}
        />
      </Stack>
    );
  }

  if (item.itemControl?.code === 'radio-button') {
    // Yes and No as buttons: until one is picked, the question is unanswered.
    return (
      <Radio.Group
        {...labelProps}
        value={typeof value === 'boolean' ? String(value) : null}
        error={error}
        onChange={(picked) => setValue(picked === 'true')}
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
        checked={Boolean(value)}
        onChange={(e) => setValue(e.currentTarget.checked)}
      />
    </Group>
  );
}

function RenderedDateTime(props: RenderedAnswerProps): JSX.Element {
  const { item, readOnly } = props;
  const { value, error, setValue } = useAnswer(props);
  const inputType = item.type === 'dateTime' ? 'datetime-local' : item.type;

  return (
    <TextInput
      {...getAnswerLabel(props)}
      disabled={readOnly}
      type={inputType}
      value={value ?? ''}
      error={error}
      onChange={(e) => setValue(e.currentTarget.value)}
    />
  );
}

const OTHER_OPTION = '__other__';

/**
 * A non-repeating choice question: one answer, rendered as a drop-down or radio buttons based on the item control.
 * An open-choice question also takes an answer typed by the respondent.
 * @param props - The rendered answer props.
 * @returns The RenderedChoice React node.
 */
function RenderedChoice(props: RenderedAnswerProps): JSX.Element {
  const { item, readOnly } = props;
  const { value, error, setValue } = useAnswer(props);
  const answerOption: ExtendedQuestionnaireItemAnswerOption[] = item.answerOption ?? [];
  const isOpen = item.type === 'open-choice';
  const isHorizontal = isHorizontalChoiceLayout(item);
  const labelProps = getAnswerLabel(props);
  const typedAnswer = isOpen && isTypedAnswer(answerOption, value);
  const [otherSelected, setOtherSelected] = useState(typedAnswer);

  if (item.answerValueSet && answerOption.length === 0) {
    return <RenderedValueSetChoice {...props} values={isEmptyAnswerValue(value) ? [] : [value]} />;
  }

  if (item.itemControl?.code === 'drop-down' || item.itemControl?.code === 'autocomplete') {
    if (isOpen) {
      // Suggests the options, and takes any other text as the answer.
      return (
        <Autocomplete
          {...labelProps}
          disabled={readOnly}
          placeholder="Select or type an answer"
          data={[...new Set(answerOption.map(getAnswerOptionLabel))]}
          value={toChoiceText(answerOption, value)}
          error={error}
          onChange={(text) => setValue(fromChoiceText(answerOption, text))}
        />
      );
    }
    if (item.itemControl?.code === 'autocomplete') {
      return (
        <Select
          {...labelProps}
          disabled={readOnly}
          searchable
          clearable
          placeholder="Type to search"
          data={toOptionData(answerOption)}
          value={isEmptyAnswerValue(value) ? null : getChoiceValueKey(value)}
          error={error}
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
        error={error}
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
        error={error}
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
 * @param props - The rendered answer props.
 * @returns The RenderedRepeatingChoice React node.
 */
function RenderedRepeatingChoice(props: RenderedAnswerProps): JSX.Element {
  const { item, answersPath, readOnly } = props;
  const responseForm = useQuestionnaireResponseFormContext();
  const answerOption: ExtendedQuestionnaireItemAnswerOption[] = item.answerOption ?? [];
  const isOpen = item.type === 'open-choice';
  const labelProps = getAnswerLabel({ ...props, answerIndex: 0 });
  const values = getAnswers(responseForm, answersPath)
    .map((answer) => getAnswerValue(item, answer))
    .filter((value) => !isEmptyAnswerValue(value));
  const typedValues = values.filter((value) => isTypedAnswer(answerOption, value));
  const [otherChecked, setOtherChecked] = useState(typedValues.length > 0);
  const error = responseForm.errors[answersPath];

  const setValues = (requestedValues: any[]): void =>
    setChoiceAnswers(responseForm, item, answersPath, requestedValues);

  if (item.answerValueSet && answerOption.length === 0) {
    return <RenderedValueSetChoice {...props} values={values} multiple />;
  }

  if (['drop-down', 'multi-select', 'autocomplete'].includes(item.itemControl?.code as string)) {
    if (isOpen) {
      return (
        <TagsInput
          {...labelProps}
          disabled={readOnly}
          placeholder="Select or type answers"
          data={[...new Set(answerOption.map(getAnswerOptionLabel))]}
          value={values.map((value) => toChoiceText(answerOption, value))}
          error={error}
          onChange={(texts) => setValues(texts.map((text) => fromChoiceText(answerOption, text)))}
        />
      );
    }
    return (
      <MultiSelect
        {...labelProps}
        disabled={readOnly}
        searchable={item.itemControl?.code === 'autocomplete'}
        placeholder={item.itemControl?.code === 'autocomplete' ? 'Type to search' : 'Select items'}
        data={toOptionData(answerOption)}
        value={values.map(getChoiceValueKey)}
        error={error}
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
        error={error}
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

interface RenderedValueSetChoiceProps extends RenderedAnswerProps {
  readonly values: any[];
  readonly multiple?: boolean;
}

/**
 * A choice question whose answers come from a value set (answerValueSet): the codes are searched as the respondent
 * types, as in Medplum's QuestionnaireForm. An open-choice question also takes text that is not in the value set.
 * @param props - The RenderedValueSetChoice props.
 * @returns The RenderedValueSetChoice React node.
 */
function RenderedValueSetChoice(props: RenderedValueSetChoiceProps): JSX.Element {
  const { item, answersPath, readOnly, values, multiple } = props;
  const { responseForm, answerPath, setValue } = useAnswer(props);
  const errorPath = multiple ? answersPath : answerPath;
  const isOpen = item.type === 'open-choice';

  return (
    <ValueSetAutocomplete
      {...getAnswerLabel(props)}
      binding={item.answerValueSet}
      creatable={isOpen}
      clearable
      disabled={readOnly}
      maxValues={multiple ? undefined : 1}
      placeholder={isOpen ? 'Search or type an answer' : 'Search'}
      defaultValue={values.map(toValueSetContains)}
      error={responseForm.errors[errorPath]}
      onChange={(selected) => {
        // A code the respondent typed (not in the value set) has no system: it is a typed answer.
        const newValues = selected.map((entry) =>
          entry.system
            ? { system: entry.system, code: entry.code, display: entry.display }
            : (entry.display ?? entry.code)
        );
        if (multiple) {
          setChoiceAnswers(responseForm, item, answersPath, newValues);
        } else {
          setValue(newValues[0] ?? '');
        }
      }}
    />
  );
}
