// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createContext, useContext } from 'react';

export interface AppShellContextValue {
  readonly navbarOpen: boolean;
  readonly setNavbarOpen: (open: boolean) => void;
}

export const AppShellContext = createContext<AppShellContextValue>({
  navbarOpen: false,
  setNavbarOpen: () => undefined,
});

export function useAppShell(): AppShellContextValue {
  return useContext(AppShellContext);
}
