// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Input } from '@mantine/core';
import type { JSX } from 'react';
import { ReferenceInput } from '../../ReferenceInput/ReferenceInput';
import { getReferenceSearchCriteria } from '../QuestionnaireFormV2.utils';
import type { QuestionnaireRendererItemProps } from './QuestionnaireRendererItem';
import { getAnswerLabel } from './QuestionnaireRendererItem.utils';
import { useAnswer } from './useAnswer';

/**
 * A reference answer, picked with Medplum's ReferenceInput from the question's resource types
 * (questionnaire-referenceResource), narrowed by its search filter (questionnaire-referenceFilter).
 * @param props - The rendered answer props.
 * @returns The QuestionnaireRendererReferenceInput React node.
 */
export function QuestionnaireRendererReferenceInput(props: QuestionnaireRendererItemProps): JSX.Element {
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
