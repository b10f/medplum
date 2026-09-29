// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Questionnaire, QuestionnaireItem, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect } from 'react';
import type { ExtendedQuestionnaireItem, QuestionnaireMode } from './QuestionnaireBuilderV2.utils';
import {
  addFormAnswer,
  fromFhirQuestionnaireItem,
  getResponseSignature,
  toFhirQuestionnaireResponse,
} from './QuestionnaireBuilderV2.utils';
import { QuestionnaireFormProvider, useQuestionnaireForm } from './QuestionnaireFormContext';
import { QuestionnairePreview } from './QuestionnairePreview';

export interface QuestionnaireFormV2Props {
  readonly questionnaire: Questionnaire | Reference<Questionnaire>;
  /** An existing response to continue; its answers prefill the form. */
  readonly questionnaireResponse?: QuestionnaireResponse | Reference<QuestionnaireResponse>;
  readonly submitButtonText?: string;
  /** Hides the Submit (and, when paginated, Back/Next) buttons, e.g. for a read-only preview. */
  readonly excludeButtons?: boolean;
  readonly onSubmit?: (response: QuestionnaireResponse) => void;
  /** Fill in the form (the default), or view the response's answers read-only. */
  readonly mode?: QuestionnaireMode;
}

/**
 * Renders a questionnaire for a respondent with the Builder v2 preview renderer, and produces a QuestionnaireResponse
 * on submit.
 * @param props - The QuestionnaireFormV2 React props.
 * @returns The QuestionnaireFormV2 React node.
 */
export function QuestionnaireFormV2(props: QuestionnaireFormV2Props): JSX.Element | null {
  const questionnaire = useResource(props.questionnaire);
  const questionnaireResponse = useResource(props.questionnaireResponse);
  const responseLoaded = !props.questionnaireResponse || !!questionnaireResponse;
  const form = useQuestionnaireForm({
    mode: 'uncontrolled',
    initialValues: { resourceType: 'Questionnaire', status: 'active' },
  });
  const { initialize } = form;

  useEffect(() => {
    if (questionnaire && responseLoaded) {
      initialize({
        ...questionnaire,
        item: (questionnaire.item ?? []).map((item: QuestionnaireItem, index: number) =>
          fromFhirQuestionnaireItem(item, questionnaire, index, questionnaireResponse?.item)
        ),
      });
    }
  }, [questionnaire, questionnaireResponse, responseLoaded, initialize]);

  if (!form.initialized) {
    return null;
  }

  const items: ExtendedQuestionnaireItem[] = form.getValues().item ?? [];

  return (
    <QuestionnaireFormProvider form={form}>
      <QuestionnairePreview
        items={items}
        addAnswer={(item, original) => addFormAnswer(form, item, original)}
        submitButtonText={props.submitButtonText}
        excludeButtons={props.excludeButtons}
        defaultSignature={getResponseSignature(questionnaireResponse)}
        mode={props.mode}
        onSubmit={(signature) => props.onSubmit?.(toFhirQuestionnaireResponse(form.getValues(), signature))}
      />
    </QuestionnaireFormProvider>
  );
}
