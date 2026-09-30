// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createContext } from 'react';
import type { QuestionnaireMode } from './QuestionnaireFormV2.utils';

/** The mode the form renders in, for the items deep in its tree. */
export const QuestionnaireModeContext = createContext<QuestionnaireMode>('capture');
