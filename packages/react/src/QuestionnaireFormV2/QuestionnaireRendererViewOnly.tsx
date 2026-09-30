// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX, ReactNode } from 'react';
import classes from './QuestionnaireRenderer.module.css';

/**
 * Makes everything inside read-only when viewing answers: a disabled fieldset disables all its inputs and buttons.
 * @param props - The QuestionnaireRendererViewOnly props.
 * @param props.viewing - True when viewing answers.
 * @param props.children - The content.
 * @returns The content, read-only when viewing.
 */
export function QuestionnaireRendererViewOnly(props: {
  readonly viewing: boolean;
  readonly children: ReactNode;
}): JSX.Element {
  if (!props.viewing) {
    return <>{props.children}</>;
  }
  return (
    <fieldset disabled className={classes.viewOnly}>
      {props.children}
    </fieldset>
  );
}
