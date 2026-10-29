/**
 * Data layer for the Translations page's "Video subtitles" tab.
 *
 * Talks to `backend/api/scenario_subtitles.php`, which writes the same
 * `medias.sounds.scenario_video_subtitle_<lang>` slot the scenario editor does.
 */

import { useCallback, useMemo } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import type { Lang } from '../../../i18n/languages';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export interface SubtitleTrack {
  file: string;
  /** False when the slot points at a file missing from the server. */
  exists: boolean;
  size: number;
  updated: string | null;
}

export interface SubtitleScenarioRow {
  id: number;
  uniqid: string;
  title: string;
  game_type: string;
  status: string | null;
  version: string;
  client_id: number | null;
  default_language: string;
  available_languages: string[];
  target_languages: string[];
  video: string | null;
  video_exists: boolean;
  tracks: Partial<Record<Lang, SubtitleTrack>>;
}

export function useVideoSubtitles() {
  const { token } = useAuth();

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = {};
    if (token) h['X-Auth-Token'] = token;
    return h;
  }, [token]);

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(`${API_BASE_URL}/scenario_subtitles.php${path}`, {
        credentials: 'include',
        ...init,
        headers: { ...authHeaders, ...(init?.headers ?? {}) },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || json?.error || `Request failed (${res.status})`);
      return json;
    },
    [authHeaders],
  );

  const list = useCallback(async (): Promise<SubtitleScenarioRow[]> => {
    const json = await call('?action=list');
    return json.scenarios ?? [];
  }, [call]);

  const upload = useCallback(
    async (uniqid: string, lang: Lang, vtt: Blob, fileName: string): Promise<void> => {
      const form = new FormData();
      form.append('uniqid', uniqid);
      form.append('lang', lang);
      form.append('file', vtt, fileName);
      await call('?action=upload', { method: 'POST', body: form });
    },
    [call],
  );

  const remove = useCallback(
    async (uniqid: string, lang: Lang): Promise<void> => {
      await call('?action=remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uniqid, lang }),
      });
    },
    [call],
  );

  /** The ZIP of every track (or only the given scenarios'). */
  const exportZip = useCallback(
    async (uniqids?: string[]): Promise<Blob> => {
      const q = uniqids && uniqids.length ? `&uniqids=${encodeURIComponent(uniqids.join(','))}` : '';
      const res = await fetch(`${API_BASE_URL}/scenario_subtitles.php?action=export_zip${q}`, {
        credentials: 'include',
        headers: authHeaders,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || `Export failed (${res.status})`);
      }
      return res.blob();
    },
    [authHeaders],
  );

  return { list, upload, remove, exportZip };
}
