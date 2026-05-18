/**
 * Public surface of the scenarios module.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

export type {
  ScenarioGameType,
  MediaSlot,
  Capabilities,
  ScenarioAdapter,
  ScenarioEditorState,
  ShellAlert,
} from './types';

export { registerAdapter, getAdapter, listRegisteredAdapters } from './registry';
export { ScenarioEditorShell } from './shell/ScenarioEditorShell';
export { useScenarioEditor } from './shell/useScenarioEditor';