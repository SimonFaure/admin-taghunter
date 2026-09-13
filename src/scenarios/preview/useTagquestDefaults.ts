/**
 * The studio-wide Quest defaults - typography and HUD element positions -
 * authored on the admin "Default layouts" page.
 *
 * Two `default_config` rows, fetched once per session and cached at module
 * scope the same way `useAdminTranslations` caches the HUD labels. Every Quest
 * surface that renders the HUD reads them through this hook so the scenario
 * editor's Aperçu shows the same starting point the game will draw; the
 * playground gets the identical rows over the sync manifest.
 *
 * Absent rows (the normal state until an admin saves the page once) resolve to
 * "no defaults", which is exactly the behaviour that existed before.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  readTagquestTypography,
  type TagquestTypography,
} from '../bodies/tagquest/typographyCategories';
import {
  EMPTY_TAGQUEST_LAYOUT_OVERRIDES,
  readTagquestLayoutOverrides,
  type TagquestLayoutOverrides,
} from '../bodies/tagquest/layoutOverrides';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

/** `default_config.meta` keys. Mirrored in `playground.php`'s manifest
 *  whitelist and the playground's `KNOWN_TRANSLATION_KEYS`. */
export const TAGQUEST_TYPOGRAPHY_META = 'default_typography_tagquest';
export const TAGQUEST_LAYOUT_META = 'default_layout_tagquest';

export interface TagquestDefaults {
  typography: TagquestTypography;
  layout: TagquestLayoutOverrides;
  /** True until the first fetch settles - callers render the code defaults. */
  loading: boolean;
}

const EMPTY: TagquestDefaults = {
  typography: {},
  layout: EMPTY_TAGQUEST_LAYOUT_OVERRIDES,
  loading: false,
};

let cached: TagquestDefaults | undefined;
let inflight: Promise<TagquestDefaults> | null = null;

/**
 * Read one config row. A missing row is not an error (404 / null value): the
 * page has simply never been saved, so the caller falls back to the code values.
 */
export async function fetchDefaultConfigValue(
  meta: string,
  token: string | null,
): Promise<{ value: unknown; version: number } | null> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['X-Auth-Token'] = token;
  const res = await fetch(`${API_BASE_URL}/default_config.php?action=get&meta=${meta}`, {
    headers,
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const value = json?.config?.value;
  if (value === undefined) return null;
  return { value, version: Number(json?.config?.version) || 1 };
}

async function fetchDefaults(token: string | null): Promise<TagquestDefaults> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [typo, layout] = await Promise.all([
        fetchDefaultConfigValue(TAGQUEST_TYPOGRAPHY_META, token).catch(() => null),
        fetchDefaultConfigValue(TAGQUEST_LAYOUT_META, token).catch(() => null),
      ]);
      cached = {
        typography: readTagquestTypography(typo?.value),
        layout: readTagquestLayoutOverrides(layout?.value),
        loading: false,
      };
      return cached;
    } catch {
      cached = EMPTY;
      return cached;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Call after saving the admin page so open previews pick the new values up. */
export function invalidateTagquestDefaults(): void {
  cached = undefined;
  inflight = null;
}

export function useTagquestDefaults(): TagquestDefaults {
  const { token } = useAuth();
  const [defaults, setDefaults] = useState<TagquestDefaults>(
    cached ?? { ...EMPTY, loading: true },
  );
  useEffect(() => {
    if (cached) {
      if (defaults !== cached) setDefaults(cached);
      return;
    }
    let active = true;
    void fetchDefaults(token).then((v) => {
      if (active) setDefaults(v);
    });
    return () => {
      active = false;
    };
    // `defaults` is deliberately not a dep: it is the state this effect sets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return defaults;
}
