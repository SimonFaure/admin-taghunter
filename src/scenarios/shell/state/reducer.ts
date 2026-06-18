/**
 * Editor reducer — common chrome state for the scenario shell.
 *
 * Slice 3B: simplified — `title`, `description`, `story`, and `translations`
 * fields removed. They now live as `Localized<string>` inside `gameMeta`
 * (per Stage 3 D5). The shell reads them via `getLocalized` at render/save time.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 + 3 sections)
 */

import type { ShellAlert } from '../../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface EditorReducerState<TGameMeta = any> {
  scenarioId: string;
  uniqid: string;

  gameMeta: TGameMeta;

  // Row-level fields the publish endpoint needs surfaced.
  scenarioStatus: string;
  scenarioType: string;
  /**
   * The DB column `scenarios.version` (auto-bumped +0.1 on every save). Shown
   * read-only in the admin section so the editor matches the details page;
   * NOT the same as the in-`game_meta` `scenario_version` string (ZIP/publish).
   */
  scenarioVersion: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scenarioLayout: any;

  currentLanguage: string;
  defaultLanguage: string;
  availableLanguages: string[];

  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  alert: ShellAlert | null;
}

export type EditorAction =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { type: 'HYDRATE'; payload: Partial<EditorReducerState<any>> }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { type: 'SET_GAME_META'; payload: any }
  | { type: 'SWITCH_LANGUAGE'; payload: string }
  | { type: 'ADD_LANGUAGE'; payload: string }
  | { type: 'REMOVE_LANGUAGE'; payload: string }
  | { type: 'BEGIN_SAVING' }
  | { type: 'END_SAVING'; payload?: ShellAlert }
  | { type: 'BEGIN_PUBLISHING' }
  | { type: 'END_PUBLISHING'; payload?: ShellAlert }
  | { type: 'SET_ALERT'; payload: ShellAlert | null }
  | { type: 'MARK_DIRTY' }
  | { type: 'MARK_CLEAN' };

export function initialState<TGameMeta>(scenarioId: string, defaultGameMeta: TGameMeta): EditorReducerState<TGameMeta> {
  return {
    scenarioId,
    uniqid: '',
    gameMeta: defaultGameMeta,
    scenarioStatus: 'draft',
    scenarioType: 'custom',
    scenarioVersion: '',
    scenarioLayout: null,
    currentLanguage: 'fr',
    defaultLanguage: 'fr',
    availableLanguages: ['fr'],
    isDirty: false,
    isSaving: false,
    isPublishing: false,
    alert: null,
  };
}

export function editorReducer<TGameMeta>(
  state: EditorReducerState<TGameMeta>,
  action: EditorAction,
): EditorReducerState<TGameMeta> {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, ...action.payload, isDirty: false };
    case 'SET_GAME_META':
      return { ...state, gameMeta: action.payload, isDirty: true };
    case 'SWITCH_LANGUAGE':
      return { ...state, currentLanguage: action.payload };
    case 'ADD_LANGUAGE': {
      if (state.availableLanguages.includes(action.payload)) return state;
      return {
        ...state,
        availableLanguages: [...state.availableLanguages, action.payload],
        isDirty: true,
      };
    }
    case 'REMOVE_LANGUAGE': {
      if (action.payload === state.defaultLanguage) return state;
      return {
        ...state,
        availableLanguages: state.availableLanguages.filter((l) => l !== action.payload),
        currentLanguage: state.currentLanguage === action.payload ? state.defaultLanguage : state.currentLanguage,
        isDirty: true,
      };
    }
    case 'BEGIN_SAVING':
      return { ...state, isSaving: true, alert: null };
    case 'END_SAVING':
      return { ...state, isSaving: false, isDirty: false, alert: action.payload ?? state.alert };
    case 'BEGIN_PUBLISHING':
      return { ...state, isPublishing: true, alert: null };
    case 'END_PUBLISHING':
      return { ...state, isPublishing: false, isDirty: false, alert: action.payload ?? state.alert };
    case 'SET_ALERT':
      return { ...state, alert: action.payload };
    case 'MARK_DIRTY':
      return state.isDirty ? state : { ...state, isDirty: true };
    case 'MARK_CLEAN':
      return state.isDirty ? { ...state, isDirty: false } : state;
    default:
      return state;
  }
}
