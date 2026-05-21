/**
 * React context that exposes ScenarioEditorState to the body via useScenarioEditor.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { createContext } from 'react';
import type { ScenarioEditorState } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ScenarioEditorContext = createContext<ScenarioEditorState<any> | null>(null);
ScenarioEditorContext.displayName = 'ScenarioEditorContext';