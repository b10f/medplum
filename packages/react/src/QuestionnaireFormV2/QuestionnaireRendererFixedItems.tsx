// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import cx from 'clsx';
import type { JSX } from 'react';
import type { ExtendedQuestionnaireItem } from './QuestionnaireFormV2.utils';
import classes from './QuestionnaireRenderer.module.css';
import { QuestionnaireRendererItemArray } from './QuestionnaireRendererItemArray';
import { QuestionnaireRendererViewOnly } from './QuestionnaireRendererViewOnly';

export interface QuestionnaireRendererFixedItemsProps {
  readonly items: ExtendedQuestionnaireItem[];
  readonly position: 'header' | 'footer';
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly ignoreValidation?: boolean;
  readonly viewing: boolean;
}

/**
 * Header or footer groups (item control `header`/`footer`), kept in view at the top or bottom of the scrolling form.
 * @param props - The QuestionnaireRendererFixedItems props.
 * @returns The QuestionnaireRendererFixedItems React node, or null without such groups.
 */
export function QuestionnaireRendererFixedItems(props: QuestionnaireRendererFixedItemsProps): JSX.Element | null {
  const { items, position, selectedItem, ignoreValidation, viewing } = props;
  if (items.length === 0) {
    return null;
  }
  return (
    <div className={cx(classes.fixedItems, position === 'header' ? classes.header : classes.footer)}>
      <QuestionnaireRendererViewOnly viewing={viewing}>
        <QuestionnaireRendererItemArray
          items={items}
          context="item"
          selectedItem={selectedItem}
          ignoreValidation={ignoreValidation}
        />
      </QuestionnaireRendererViewOnly>
    </div>
  );
}
