// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Group, Text } from '@mantine/core';
import type { JSX, ReactNode } from 'react';

/**
 * A section title of the settings panel, with its icon, between dividers.
 * @param props - The section's icon and title.
 * @param props.icon - The icon.
 * @param props.children - The title.
 * @returns The section title.
 */
export function QuestionnaireSettingsSectionTitle(props: {
  readonly icon: JSX.Element;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <>
      <Divider />
      <Group gap="xs" wrap="nowrap">
        {props.icon}
        <Text size="xl" fw={500}>
          {props.children}
        </Text>
      </Group>
      <Divider />
    </>
  );
}
