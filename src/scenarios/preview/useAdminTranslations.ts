import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import type { PreviewLabelsMap } from './previewLabels';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const META_KEY = 'tagquest_translations';

let cached: PreviewLabelsMap | undefined;
let inflight: Promise<PreviewLabelsMap | undefined> | null = null;

async function fetchTranslations(token: string | null): Promise<PreviewLabelsMap | undefined> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['X-Auth-Token'] = token;
      const res = await fetch(
        `${API_BASE_URL}/default_config.php?action=get&meta=${META_KEY}`,
        { headers }
      );
      if (!res.ok) return undefined;
      const json = await res.json();
      const value = json?.config?.value;
      if (value && typeof value === 'object') {
        cached = value as PreviewLabelsMap;
        return cached;
      }
      return undefined;
    } catch {
      return undefined;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function invalidateAdminTranslations(): void {
  cached = undefined;
  inflight = null;
}

/**
 * Fetches the admin-managed global tagquest translations once per session
 * and caches them at module scope. Returns `undefined` until the fetch
 * resolves (or on any error) — callers fall back to `DEFAULT_PREVIEW_LABELS`
 * via `resolveAdminLabel`.
 */
export function useAdminTranslations(): PreviewLabelsMap | undefined {
  const { token } = useAuth();
  const [labels, setLabels] = useState<PreviewLabelsMap | undefined>(cached);
  useEffect(() => {
    if (cached) {
      if (labels !== cached) setLabels(cached);
      return;
    }
    let active = true;
    fetchTranslations(token).then((v) => {
      if (active) setLabels(v);
    });
    return () => {
      active = false;
    };
  }, [token]);
  return labels;
}
