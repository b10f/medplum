// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import cx from 'clsx';
import type { JSX, ReactNode } from 'react';
import type { ExtendedQuestionnaireItem } from './QuestionnaireFormV2.utils';
import classes from './QuestionnaireRenderer.module.css';

export interface QuestionnaireRendererSelectedItemProps {
  readonly item: ExtendedQuestionnaireItem;
  readonly selectedItem: ExtendedQuestionnaireItem | undefined;
  readonly index: number;
  readonly children: ReactNode;
}

export function QuestionnaireRendererSelectedItem(props: QuestionnaireRendererSelectedItemProps): JSX.Element {
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
