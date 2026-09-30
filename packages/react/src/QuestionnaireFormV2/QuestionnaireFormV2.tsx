// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Questionnaire, QuestionnaireItem, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { QuestionnaireFormProvider, useQuestionnaireEditorForm } from './QuestionnaireFormContext';
import type { ExtendedQuestionnaireItem, QuestionnaireMode } from './QuestionnaireFormV2.utils';
import { fromFhirQuestionnaireItem } from './QuestionnaireFormV2.utils';
import { QuestionnaireRenderer } from './QuestionnaireRenderer';

export type { QuestionnaireMode } from './QuestionnaireFormV2.utils';

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
 * Renders a questionnaire for a respondent with QuestionnaireRenderer, and produces a QuestionnaireResponse
 * on submit.
 * @param props - The QuestionnaireFormV2 React props.
 * @returns The QuestionnaireFormV2 React node.
 */
export function QuestionnaireFormV2(props: QuestionnaireFormV2Props): JSX.Element | null {
  const questionnaire = useResource(props.questionnaire);
  const questionnaireResponse = useResource(props.questionnaireResponse);
  const responseLoaded = !props.questionnaireResponse || !!questionnaireResponse;
  const form = useQuestionnaireEditorForm({
    mode: 'uncontrolled',
    initialValues: { resourceType: 'Questionnaire', status: 'active' },
  });
  const { initialize } = form;

  useEffect(() => {
    if (questionnaire) {
      initialize({
        ...questionnaire,
        item: (questionnaire.item ?? []).map((item: QuestionnaireItem, index: number) =>
          fromFhirQuestionnaireItem(item, questionnaire, index)
        ),
      });
    }
  }, [questionnaire, initialize]);

  // The renderer reads the response's answers once, when it starts.
  if (!form.initialized || !responseLoaded) {
    return null;
  }

  const items: ExtendedQuestionnaireItem[] = form.getValues().item ?? [];

  return (
    <QuestionnaireFormProvider form={form}>
      <QuestionnaireRenderer
        items={items}
        questionnaireResponse={questionnaireResponse}
        submitButtonText={props.submitButtonText}
        excludeButtons={props.excludeButtons}
        mode={props.mode}
        onSubmit={props.onSubmit}
      />
    </QuestionnaireFormProvider>
  );
}
