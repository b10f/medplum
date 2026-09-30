// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import type { ExtendedQuestionnaireItem } from '../QuestionnaireFormV2.utils';
import { isChoiceItemType } from '../QuestionnaireFormV2.utils';
import type { RepeatControls } from '../QuestionnaireRendererLabel';
import { QuestionnaireRendererAttachmentInput } from './QuestionnaireRendererAttachmentInput';
import { QuestionnaireRendererBooleanInput } from './QuestionnaireRendererBooleanInput';
import { QuestionnaireRendererChoiceInput } from './QuestionnaireRendererChoiceInput';
import { QuestionnaireRendererDateTimeInput } from './QuestionnaireRendererDateTimeInput';
import { QuestionnaireRendererQuantityInput } from './QuestionnaireRendererQuantityInput';
import { QuestionnaireRendererReferenceInput } from './QuestionnaireRendererReferenceInput';
import { QuestionnaireRendererRepeatingChoiceInput } from './QuestionnaireRendererRepeatingChoiceInput';
import { QuestionnaireRendererTextareaInput } from './QuestionnaireRendererTextareaInput';
import { QuestionnaireRendererTextInput } from './QuestionnaireRendererTextInput';

export interface QuestionnaireRendererItemProps {
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
 * One answer of a question, with the input for the question's type.
 * @param props - The QuestionnaireRendererItem props.
 * @returns The QuestionnaireRendererItem React node, or null for a type without an input.
 */
export function QuestionnaireRendererItem(props: QuestionnaireRendererItemProps): JSX.Element | null {
  const type = props.item.type;
  if (isChoiceItemType(type) && props.item.repeats) {
    return <QuestionnaireRendererRepeatingChoiceInput {...props} />;
  } else if (type === 'quantity') {
    return <QuestionnaireRendererQuantityInput {...props} />;
  } else if (type === 'reference') {
    return <QuestionnaireRendererReferenceInput {...props} />;
  } else if (type === 'attachment') {
    return <QuestionnaireRendererAttachmentInput {...props} />;
  } else if (['string', 'integer', 'decimal', 'url'].includes(type)) {
    return <QuestionnaireRendererTextInput {...props} />;
  } else if (type === 'boolean') {
    return <QuestionnaireRendererBooleanInput {...props} />;
  } else if (type === 'text') {
    return <QuestionnaireRendererTextareaInput {...props} />;
  } else if (['date', 'dateTime', 'time'].includes(type)) {
    return <QuestionnaireRendererDateTimeInput {...props} />;
  } else if (isChoiceItemType(type)) {
    return <QuestionnaireRendererChoiceInput {...props} />;
  }
  return null;
}
