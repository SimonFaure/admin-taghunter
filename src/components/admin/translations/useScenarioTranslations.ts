/**
 * Data layer for the Translations page's "Scenarios" tab.
 *
 * Talks to `backend/api/scenario_translations.php`. Scenario field values are
 * NOT stored by that endpoint in a table of its own - they go back into the
 * same `Localized<string>` maps in `scenarios.data.game_meta` that the scenario
 * editor writes, so there is exactly one source of truth.
 *
 * Plan: C:\Users\faure\.claude\plans\here-is-a-translation-transient-boot.md
 */

import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import type { Lang } from '../../../i18n/languages';
import type {
  ScenarioHeader,
  TranslationFile,
  FieldPatch,
  TextPatch,
} from '../../../i18n/scenarioTranslationRows';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export interface ScenarioPickerRow {
  id: number;
  uniqid: string;
  title: string;
  game_type: string;
  scenario_type: string | null;
  status: string | null;
  version: string;
  default_language: string;
  translated_langs: string[];
  /** Admin-owned scenario: languages must be validated before clients get them. */
  gated: boolean;
  /** Languages released to clients (always includes the default language). */
  validated_langs: string[];
  files_count: number;
}

export interface ScenarioTranslationModel {
  scenario: ScenarioHeader & {
    id: number;
    version: string;
    gated: boolean;
    validated_languages: string[];
  };
  gameMeta: Record<string, unknown>;
  translationMeta: Record<string, Record<string, string>>;
  files: TranslationFile[];
}

export function useScenarioTranslations() {
  const { token, user } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const headers = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['X-Auth-Token'] = token;
    return h;
  }, [token]);

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(`${API_BASE_URL}/scenario_translations.php${path}`, {
        ...init,
        headers,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json?.message || json?.error || `Request failed (${res.status})`);
        (err as Error & { status?: number; payload?: unknown }).status = res.status;
        (err as Error & { status?: number; payload?: unknown }).payload = json;
        throw err;
      }
      return json;
    },
    [headers],
  );

  const listScenarios = useCallback(async (): Promise<ScenarioPickerRow[]> => {
    const json = await call('?action=list_scenarios');
    return json.scenarios ?? [];
  }, [call]);

  const loadScenario = useCallback(
    async (uniqid: string): Promise<ScenarioTranslationModel> => {
      const json = await call(`?action=get&uniqid=${encodeURIComponent(uniqid)}`);
      return {
        scenario: json.scenario,
        gameMeta: json.game_meta ?? {},
        translationMeta: json.translation_meta ?? {},
        files: json.files ?? [],
      };
    },
    [call],
  );

  /**
   * Persist a batch of edits. Field patches go in one call (the endpoint
   * re-reads the row under a lock and mutates only the named leaves); titles
   * and inner texts are per-file calls.
   *
   * `baseVersion` is the version the grid was loaded at. The endpoint answers
   * 409 when the scenario moved underneath us, which is surfaced verbatim so
   * the operator reloads rather than silently overwriting someone's edit.
   */
  const save = useCallback(
    async (input: {
      uniqid: string;
      baseVersion: string;
      patches: FieldPatch[];
      stamps: { path: string; lang: Lang; hash: string }[];
      fileTitles: Map<number, { values: Record<string, string>; hashes: Record<string, string> }>;
      fileTexts: Map<number, TextPatch[]>;
      allTextsByFile: Map<number, { id?: number; position: number; source_text: string; values: Record<string, string>; hashes: Record<string, string> }[]>;
    }) => {
      let version = input.baseVersion;

      if (input.patches.length > 0 || input.stamps.length > 0) {
        const json = await call('?action=save_fields', {
          method: 'POST',
          body: JSON.stringify({
            uniqid: input.uniqid,
            base_version: input.baseVersion,
            patches: input.patches,
            stamps: input.stamps,
            user_email: user?.email,
          }),
        });
        version = json.version ?? version;
        if (Array.isArray(json.skipped) && json.skipped.length > 0) {
          // A skipped path points at something that no longer exists (a deleted
          // enigma, a renamed univers tag). Never silently dropped.
          setError(
            `${json.skipped.length} row(s) could not be applied - the field no longer exists: ${json.skipped
              .slice(0, 5)
              .join(', ')}${json.skipped.length > 5 ? '…' : ''}`,
          );
        }
      }

      for (const [fileId, payload] of input.fileTitles) {
        await call('?action=save_file_title', {
          method: 'POST',
          body: JSON.stringify({
            file_id: fileId,
            name_i18n: payload.values,
            hashes: payload.hashes,
          }),
        });
      }

      for (const [fileId, rows] of input.allTextsByFile) {
        if (!input.fileTexts.has(fileId)) continue;
        await call('?action=save_file_texts', {
          method: 'POST',
          body: JSON.stringify({ file_id: fileId, rows, delete_missing: true }),
        });
      }

      return version;
    },
    [call, user?.email],
  );

  const setFileLanguage = useCallback(
    async (fileId: number, language: string | null) => {
      await call('?action=set_file_meta', {
        method: 'POST',
        body: JSON.stringify({ file_id: fileId, language }),
      });
    },
    [call],
  );

  /**
   * Release (or withdraw) one language of an admin-owned scenario to clients
   * and playgrounds. Returns the resolved validated list.
   */
  const setLanguageValidation = useCallback(
    async (uniqid: string, lang: string, validated: boolean): Promise<string[]> => {
      const json = await call('?action=set_language_validation', {
        method: 'POST',
        body: JSON.stringify({ uniqid, lang, validated }),
      });
      return json.validated_languages ?? [];
    },
    [call],
  );

  return { listScenarios, loadScenario, save, setFileLanguage, setLanguageValidation, error, setError };
}
