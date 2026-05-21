/**
 * Hook returning the current ScenarioEditorState. Bodies call this to read
 * common state (title, language, gameMeta, etc.) and dispatch actions
 * (save, publish, setField, ...).
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useContext } from 'react';
import { ScenarioEditorContext } from './ScenarioEditorContext';
import type { ScenarioEditorState } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useScenarioEditor<TGameMeta = any>(): ScenarioEditorState<TGameMeta> {
  const ctx = useContext(ScenarioEditorContext);
  if (!ctx) {
    throw new Error(
      'useScenarioEditor must be used inside <ScenarioEditorShell>. ' +
        'Bodies are mounted by the shell; do not render them standalone.',
    );
  }
  return ctx as ScenarioEditorState<TGameMeta>;
}