// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useDebouncedValue } from '@mantine/hooks';
import { normalizeErrorString } from '@medplum/core';
import { useEffect, useState } from 'react';

export interface LoincSearchState<T> {
  /** True until the search for the text currently typed has completed (including the debounce delay). */
  readonly loading: boolean;
  readonly results: T[];
  readonly error?: string;
}

interface CompletedSearch<T> {
  readonly term: string;
  readonly results: T[];
  readonly error?: string;
}

/**
 * Runs a debounced LOINC search for the typed text, cancelling the previous request when the text changes.
 * @param searchTerm - The text typed by the user.
 * @param search - The search function; it must be stable (e.g. a module-level function).
 * @returns The search state.
 */
export function useLoincSearch<T>(
  searchTerm: string,
  search: (term: string, signal: AbortSignal) => Promise<T[]>
): LoincSearchState<T> {
  const [debouncedSearchTerm] = useDebouncedValue(searchTerm.trim(), 300);
  const [completed, setCompleted] = useState<CompletedSearch<T>>({ term: '', results: [] });

  useEffect(() => {
    if (!debouncedSearchTerm) {
      return undefined;
    }

    const controller = new AbortController();
    search(debouncedSearchTerm, controller.signal)
      .then((results) => setCompleted({ term: debouncedSearchTerm, results }))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setCompleted({ term: debouncedSearchTerm, results: [], error: normalizeErrorString(err) });
        }
      });

    return () => controller.abort();
  }, [debouncedSearchTerm, search]);

  return { loading: searchTerm.trim() !== completed.term, results: completed.results, error: completed.error };
}
