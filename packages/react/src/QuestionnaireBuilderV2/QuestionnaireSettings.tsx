// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Stack, Switch, Textarea } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import type { JSX } from 'react';
import { useState } from 'react';
import { CodingInput } from '../CodingInput/CodingInput';
import { useQuestionnaireFormContext } from '../QuestionnaireFormV2/QuestionnaireFormContext';
import { getRequiredSignatureType } from '../QuestionnaireFormV2/QuestionnaireFormV2.utils';
import {
  DEFAULT_SIGNATURE_TYPE,
  getQuestionnaireDesignNote,
  setQuestionnaireDesignNote,
  setRequiredSignatureType,
} from './QuestionnaireBuilderV2.utils';

const SIGNATURE_TYPE_VALUE_SET = 'http://hl7.org/fhir/ValueSet/signature-type';

export interface QuestionnaireSettingsProps {
  /** Saves the questionnaire, as the Save button above the item tree does. */
  readonly onSave: () => void;
}

/**
 * The questionnaire's own settings: whether it must be signed, and with what type of signature, and its design note.
 * @param props - The QuestionnaireSettings React props.
 * @returns The QuestionnaireSettings React node.
 */
export function QuestionnaireSettings(props: QuestionnaireSettingsProps): JSX.Element {
  const form = useQuestionnaireFormContext();
  const signatureType = getRequiredSignatureType(form.getValues());
  // Typed text is kept here and written to the form shortly after typing stops, not on every keystroke.
  const [designNote, setDesignNote] = useState(() => getQuestionnaireDesignNote(form.getValues()));
  const writeDesignNote = useDebouncedCallback((note: string) => setQuestionnaireDesignNote(form, note), 300);

  return (
    <Stack gap="md">
      <Switch
        label="Signature required"
        description="The respondent signs below the form, and cannot submit it unsigned."
        checked={!!signatureType}
        onChange={(e) => setRequiredSignatureType(form, e.currentTarget.checked ? DEFAULT_SIGNATURE_TYPE : undefined)}
      />
      {signatureType && (
        <CodingInput
          // A new signature requirement starts from its default type.
          key={signatureType.code ?? 'none'}
          label="Signature type"
          name="signature-type"
          path=""
          binding={SIGNATURE_TYPE_VALUE_SET}
          creatable={false}
          defaultValue={signatureType.code ? signatureType : undefined}
          onChange={(coding) => setRequiredSignatureType(form, coding ?? DEFAULT_SIGNATURE_TYPE)}
        />
      )}
      <Textarea
        label="Design note"
        description="For the people building this questionnaire; never shown to respondents."
        autosize
        minRows={4}
        value={designNote}
        onChange={(e) => {
          setDesignNote(e.currentTarget.value);
          writeDesignNote(e.currentTarget.value);
        }}
      />
      <Group justify="flex-end">
        <Button
          onClick={() => {
            // The note typed last may not be written yet.
            setQuestionnaireDesignNote(form, designNote);
            props.onSave();
          }}
        >
          Save
        </Button>
      </Group>
    </Stack>
  );
}
