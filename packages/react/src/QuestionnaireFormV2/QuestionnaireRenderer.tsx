// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import type { QuestionnaireItem, QuestionnaireResponse, Signature } from '@medplum/fhirtypes';
import type { QuestionnaireFormPaginationState } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { QuestionnaireFormStepper } from '../QuestionnaireForm/QuestionnaireFormStepper';
import {
  QuestionnaireResponseFormProvider,
  useQuestionnaireFormContext,
  useQuestionnaireResponseForm,
} from './QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem, QuestionnaireMode } from './QuestionnaireFormV2.utils';
import {
  findRootItem,
  getPageItems,
  getRequiredSignatureType,
  isHeaderOrFooterItem,
} from './QuestionnaireFormV2.utils';
import { QuestionnaireModeContext } from './QuestionnaireModeContext';
import classes from './QuestionnaireRenderer.module.css';
import { QuestionnaireRendererFixedItems } from './QuestionnaireRendererFixedItems';
import { QuestionnaireRendererItemArray } from './QuestionnaireRendererItemArray';
import { QuestionnaireRendererPage } from './QuestionnaireRendererPage';
import { QuestionnaireRendererSignature } from './QuestionnaireRendererSignature';
import { QuestionnaireRendererViewOnly } from './QuestionnaireRendererViewOnly';
import {
  evaluateEnableWhen,
  getResponseSignature,
  isShownInMode,
  toDraftResponse,
  toFhirQuestionnaireResponse,
  validateFormAnswers,
} from './QuestionnaireResponse.utils';
import { useCalculatedAnswers } from './useCalculatedAnswers';
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
    <QuestionnaireRendererSignature
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
                <QuestionnaireRendererFixedItems items={headerItems} position="header" {...fixedItemProps} />
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
                      <QuestionnaireRendererViewOnly viewing={viewing}>
                        <QuestionnaireRendererPage
                          key={pageItems[currentPage].linkId}
                          page={pageItems[currentPage]}
                          selectedItem={selectedItem}
                          ignoreValidation={ignoreValidation}
                        />
                      </QuestionnaireRendererViewOnly>
                    </QuestionnaireFormStepper>
                    <QuestionnaireRendererFixedItems items={footerItems} position="footer" {...fixedItemProps} />
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
                    <QuestionnaireRendererViewOnly viewing={viewing}>
                      <Stack gap="md">
                        <QuestionnaireRendererItemArray
                          items={bodyItems}
                          context="item"
                          selectedItem={selectedItem}
                          ignoreValidation={ignoreValidation}
                        />
                      </Stack>
                    </QuestionnaireRendererViewOnly>
                    <QuestionnaireRendererFixedItems items={footerItems} position="footer" {...fixedItemProps} />
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
