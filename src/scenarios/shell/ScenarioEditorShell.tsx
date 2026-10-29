/**
 * Top-level shell for scenario authoring. Owns chrome + state machine + the
 * common-base form. Mounts the per-type body declared by the adapter.
 *
 * Slice 3B: title/description/story now live as `Localized<string>` inside
 * `gameMeta`. The reducer no longer carries them as separate fields. The
 * shell load runs `migrateLegacyData` as a safety net so any rows that
 * escape the one-shot SQL migration still load + save cleanly.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 + 3 sections)
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../creator-ported/lib/db';
import { getMediaUrl as getMediaUrlUtil, extractFileName } from '../../creator-ported/utils/mediaUrl';
import { useAuth } from '../../auth/AuthContext';
import { Alert } from '../../creator-ported/components/Alert';
import { AdminOnlyPanel } from '../../components/AdminOnlyPanel';
import { ScenarioAdminControls } from '../../components/ScenarioAdminControls';
import { ScenarioEditorContext } from './ScenarioEditorContext';
import { editorReducer, initialState } from './state/reducer';
import {
  performSave,
  performZipDownload,
  type SavePayload,
} from './state/saveOrchestrator';
import { uploadAsset as uploadAssetImpl } from './state/assetUpload';
import { mergeMediasIntoGameMeta, type ParsedMedias } from './state/hydrateGameMeta';
import { getLocalized, setLocalized } from '../i18n/getLocalized';
import type { Lang } from '../i18n/types';
import { ScenarioHeader } from './components/ScenarioHeader';
import { SaveBar } from './components/SaveBar';
import { CollapseAllProvider } from './components/CollapsibleSection';
import { GoEditorProvider } from './components/GoEditorContext';
import { SectionsTOC } from './components/SectionsTOC';
import { LanguageBar } from './components/LanguageBar';
import { ScenarioTargetLanguages } from './components/ScenarioTargetLanguages';
import { normalizeWrongAnswerPoints } from '../bodies/mystery/wrongAnswerPoints';
import { MetaSection } from './sections/MetaSection';
import { CoverSection } from './sections/CoverSection';
import { LevelsSection } from './sections/LevelsSection';
import { OverscoresSection } from './sections/OverscoresSection';
import { TextStringsSection } from './sections/TextStringsSection';
import { TypographySection } from './sections/TypographySection';
import { TimingSection } from './sections/TimingSection';
import { AdminSection } from './sections/AdminSection';
import { ReportLayoutSection } from './sections/ReportLayoutSection';
import type { ScenarioAdapter, ScenarioEditorState, ShellAlert } from '../types';

interface ScenarioEditorShellProps {
  scenarioId: string;
  adapter: ScenarioAdapter;
  onBack: () => void;
  onOpenLayoutEditor: () => void;
}

export function ScenarioEditorShell({ scenarioId, adapter, onBack, onOpenLayoutEditor }: ScenarioEditorShellProps) {
  const { t } = useTranslation('editor');
  const { userType } = useAuth();
  const isAdmin = userType === 'admin';

  const [state, dispatch] = useReducer(editorReducer, scenarioId, (id) =>
    initialState(id, adapter.defaultConfig()),
  );

  // Languages an admin has released to clients (Admin > Translations). null =
  // not gated: a client-owned scenario, or a client viewer. Drives the
  // read-only "draft" badge on the language chips.
  const [validatedLanguages, setValidatedLanguages] = useState<string[] | null>(null);

  // Load scenario row + hydrate state
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await db
          .from('scenarios')
          .select('title, description, uniqid, data, medias, status, scenario_type, scenario_layout, version, client_id, validated_languages')
          .eq('id', scenarioId)
          .maybeSingle();
        if (cancelled || error || !data) return;

        const parseCol = (v: unknown): unknown => {
          if (v == null) return null;
          if (typeof v !== 'string') return v;
          try {
            return JSON.parse(v);
          } catch {
            return null;
          }
        };
        const parsedData = parseCol((data as { data: unknown }).data) as
          | {
              game_meta?: Record<string, unknown>;
              default_language?: string;
              available_languages?: string[];
            }
          | null;
        const parsedMedia = parseCol((data as { medias: unknown }).medias) as ParsedMedias | null;
        const parsedLayout = parseCol((data as { scenario_layout: unknown }).scenario_layout);
        const row = data as {
          uniqid?: string;
          title?: string;
          description?: string;
          status?: string;
          scenario_type?: string;
          version?: unknown;
          client_id?: number | string | null;
        };

        // Only admin-owned scenarios are gated; query.php only returns the
        // column to admin tokens. NULL on a gated row = default language only.
        const rawValidated = (data as { validated_languages?: unknown }).validated_languages;
        if (isAdmin && (row.client_id === null || row.client_id === undefined || row.client_id === '')) {
          const parsed = parseCol(rawValidated);
          setValidatedLanguages(Array.isArray(parsed) ? parsed.filter((l): l is string => typeof l === 'string') : []);
        } else {
          setValidatedLanguages(null);
        }

        // Validate against adapter schema (warn-only). Doesn't gate hydration.
        if (parsedData) {
          const result = adapter.dataSchema.safeParse(parsedData);
          if (!result.success) {
            console.warn('[ScenarioEditorShell] data did not match adapter schema', {
              scenarioId,
              issues: result.error.issues,
            });
          }
        }

        // Merge gameMeta + media (images/sounds/video) back into a flat working copy.
        // A freshly-created scenario is inserted with `data: {}` (no game_meta),
        // so loading it would otherwise clobber the defaultConfig that
        // initialState seeded - leaving fixed-skeleton types like clash with no
        // territories/clans and no way to add them. Fall back to the adapter's
        // defaults whenever the loaded game_meta is empty.
        const loadedMeta = parsedData?.game_meta;
        const gameMetaIn =
          loadedMeta && Object.keys(loadedMeta).length > 0
            ? loadedMeta
            : (adapter.defaultConfig() as Record<string, unknown>);
        const merged: Record<string, unknown> = { ...gameMetaIn };
        mergeMediasIntoGameMeta(merged, parsedMedia);

        // Mystery wrong-answer points are authored signed (negative = penalty,
        // like the maluses). Scenarios written before that convention stored the
        // bare magnitude, so fold them to their negative on load - the field
        // then reads the way it scores, and the next save persists it.
        if (adapter.kind === 'mystery' && Array.isArray(merged.enigmas)) {
          for (const e of merged.enigmas as Array<Record<string, unknown>>) {
            if (!e) continue;
            e.wrong_answer_points = normalizeWrongAnswerPoints(e.wrong_answer_points);
          }
        }

        const defaultLanguage = (parsedData?.default_language ?? 'fr') as Lang;

        // A freshly-created scenario stores its title/description only in the
        // row columns (data is `{}`, so game_meta fell back to defaults above).
        // Seed the localized gameMeta fields from the row whenever they're empty
        // so the title typed on the "Create New Scenario" page shows up here.
        if (row.title && !getLocalized(merged.title as never, defaultLanguage, defaultLanguage)) {
          merged.title = setLocalized(merged.title as never, defaultLanguage, row.title, defaultLanguage);
        }
        if (row.description && !getLocalized(merged.description as never, defaultLanguage, defaultLanguage)) {
          merged.description = setLocalized(merged.description as never, defaultLanguage, row.description, defaultLanguage);
        }

        dispatch({
          type: 'HYDRATE',
          payload: {
            uniqid: row.uniqid ?? '',
            scenarioStatus: row.status ?? 'draft',
            scenarioType: row.scenario_type ?? 'custom',
            scenarioVersion: row.version != null ? String(row.version) : '',
            scenarioLayout: parsedLayout,
            gameMeta: merged,
            defaultLanguage,
            currentLanguage: defaultLanguage,
            availableLanguages:
              parsedData?.available_languages && parsedData.available_languages.length > 0
                ? parsedData.available_languages
                : [defaultLanguage],
          },
        });
      } catch (err) {
        if (!cancelled) {
          console.error('[ScenarioEditorShell] load failed', err);
          dispatch({ type: 'SET_ALERT', payload: { type: 'error', message: t('alert.loadFailed') } });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scenarioId, adapter, t, isAdmin]);

  // Bare filenames the user has cleared/replaced this session. Physically
  // unlinked from media/<uniqid>/ only after a successful save (see
  // flushOrphanedAssets) - never on the click itself, so abandoning an unsaved
  // edit can't leave the persisted scenario pointing at a deleted file.
  const pendingOrphansRef = useRef<Set<string>>(new Set());

  const flushOrphanedAssets = useCallback(async () => {
    const orphans = pendingOrphansRef.current;
    if (orphans.size === 0) return;
    const uniqid = state.uniqid;
    if (!uniqid) {
      orphans.clear();
      return;
    }
    // Guard: never delete a filename the just-saved scenario still references
    // (e.g. the same asset reused by another slot).
    const stillReferenced = new Set(
      adapter
        .enumerateMedia(state.gameMeta)
        .map((m) => extractFileName(m.filename))
        .filter(Boolean),
    );
    const toDelete = [...orphans].filter((f) => !stillReferenced.has(f));
    orphans.clear();
    if (toDelete.length === 0) return;
    try {
      await db.storage
        .from('game-media')
        .remove(toDelete.map((f) => `${uniqid}/${f}`));
    } catch (err) {
      // Best-effort cleanup: a failed unlink just leaves an orphan on disk, so
      // it must never surface as a save error to the user.
      console.warn('[ScenarioEditorShell] orphaned media cleanup failed', err);
    }
  }, [adapter, state.uniqid, state.gameMeta]);

  const buildPayload = useCallback((): SavePayload => {
    // Derive row-level title/description from the Localized maps' default-lang
    // values. saveOrchestrator writes these to the scenarios row columns.
    const meta = state.gameMeta as Record<string, unknown>;
    const defaultLang = state.defaultLanguage as Lang;
    const rowTitle = getLocalized(meta.title as never, defaultLang, defaultLang);
    const rowDescription = getLocalized(meta.description as never, defaultLang, defaultLang);
    return {
      scenarioId,
      uniqid: state.uniqid,
      adapter,
      title: rowTitle,
      description: rowDescription,
      gameMeta: state.gameMeta,
      defaultLanguage: state.defaultLanguage,
      availableLanguages: state.availableLanguages,
      scenarioType: state.scenarioType,
      scenarioLayout: state.scenarioLayout,
    };
  }, [adapter, scenarioId, state]);

  const save = useCallback(async () => {
    dispatch({ type: 'BEGIN_SAVING' });
    const result = await performSave(buildPayload());
    // performSave bumps scenarios.version (+0.1); reflect the new value so the
    // admin section's read-only field stays in step with the details page.
    if (result.ok && result.savedScenario?.version != null) {
      dispatch({ type: 'HYDRATE', payload: { scenarioVersion: String(result.savedScenario.version) } });
    }
    if (result.ok) await flushOrphanedAssets();
    dispatch({
      type: 'END_SAVING',
      payload: result.ok
        ? { type: 'success', message: t('alert.saved') }
        : { type: 'error', message: result.error ?? t('alert.saveFailed') },
    });
  }, [buildPayload, flushOrphanedAssets, t]);

  const publish = useCallback(async () => {
    dispatch({ type: 'BEGIN_PUBLISHING' });
    // Retours #15 - the publish toast used to announce a SECOND, locally
    // computed version (`game_meta.scenario_version` + 0.1) which had long
    // drifted from the row version shown on the scenario's vignette, because
    // only the row bumps on a plain save. There is now one number: performSave
    // bumps `scenarios.version` and mirrors it into `game_meta.scenario_version`,
    // and the toast reports what the save actually wrote.
    // Publishing flips the row's status draft -> published (the save path leaves
    // status untouched).
    const payload: SavePayload = { ...buildPayload(), status: 'published' };
    const result = await performSave(payload);
    const publishedVersion =
      result.savedScenario?.version != null
        ? String(result.savedScenario.version)
        : String((state.gameMeta as Record<string, unknown>).scenario_version ?? '');
    if (result.ok) {
      await flushOrphanedAssets();
      dispatch({
        type: 'SET_GAME_META',
        payload: { ...(state.gameMeta as Record<string, unknown>), scenario_version: publishedVersion },
      });
      dispatch({
        type: 'HYDRATE',
        payload: {
          scenarioStatus: 'published',
          ...(result.savedScenario?.version != null
            ? { scenarioVersion: String(result.savedScenario.version) }
            : {}),
        },
      });
    }
    dispatch({
      type: 'END_PUBLISHING',
      payload: result.ok
        ? { type: 'success', message: t('alert.published', { version: publishedVersion }) }
        : { type: 'error', message: result.error ?? t('alert.publishFailed') },
    });
  }, [buildPayload, flushOrphanedAssets, state.gameMeta, t]);

  const downloadZip = useCallback(async () => {
    const result = await performZipDownload(buildPayload());
    if (!result.ok) {
      dispatch({ type: 'SET_ALERT', payload: { type: 'error', message: result.error ?? t('alert.zipFailed') } });
    }
  }, [buildPayload, t]);

  const uploadAsset = useCallback(
    async (slotKey: string, file: File): Promise<string> => {
      const slot = adapter.mediaSlots.find((s) => s.key === slotKey);
      const result = await uploadAssetImpl(file, {
        scenarioUniqid: state.uniqid,
        fieldName: slotKey,
        slotKind: slot?.kind ?? 'image',
      });
      if (!result.ok || !result.filename) {
        throw new Error(result.error ?? t('alert.uploadFailed'));
      }
      return result.filename;
    },
    [state.uniqid, adapter.mediaSlots, t],
  );

  const deleteAsset = useCallback((filename: string) => {
    const bare = extractFileName(filename);
    if (bare) pendingOrphansRef.current.add(bare);
  }, []);

  const getMediaUrl = useCallback(
    (filename: string) => getMediaUrlUtil(state.uniqid || scenarioId, filename),
    [state.uniqid, scenarioId],
  );

  const setAlert = useCallback((a: ShellAlert | null) => {
    dispatch({ type: 'SET_ALERT', payload: a });
  }, []);

  const value: ScenarioEditorState = useMemo(
    () => ({
      scenarioId,
      uniqid: state.uniqid,
      gameType: adapter.kind,
      adapter,
      scenarioVersion: state.scenarioVersion,
      gameMeta: state.gameMeta,
      setGameMeta: (updater) => dispatch({ type: 'SET_GAME_META', payload: updater(state.gameMeta) }),
      setField: (key, val) =>
        dispatch({
          type: 'SET_GAME_META',
          payload: { ...(state.gameMeta as Record<string, unknown>), [key as string]: val },
        }),
      currentLanguage: state.currentLanguage,
      defaultLanguage: state.defaultLanguage,
      availableLanguages: state.availableLanguages,
      switchLanguage: (lang) => dispatch({ type: 'SWITCH_LANGUAGE', payload: lang }),
      addLanguage: (lang) => dispatch({ type: 'ADD_LANGUAGE', payload: lang }),
      removeLanguage: (lang) => dispatch({ type: 'REMOVE_LANGUAGE', payload: lang }),
      isDirty: state.isDirty,
      isSaving: state.isSaving,
      isPublishing: state.isPublishing,
      alert: state.alert,
      setAlert,
      uploadAsset,
      deleteAsset,
      getMediaUrl,
      save,
      publish,
      downloadZip,
      isAdmin,
      onBack,
      onOpenLayoutEditor,
    }),
    [
      scenarioId,
      adapter,
      state,
      isAdmin,
      onBack,
      onOpenLayoutEditor,
      save,
      publish,
      downloadZip,
      uploadAsset,
      deleteAsset,
      getMediaUrl,
      setAlert,
    ],
  );

  const Body = adapter.Body;
  const TopSection = adapter.TopSection;
  const goMeta = state.gameMeta as Record<string, unknown>;
  // GO authoring is admin-only: clients must not see or toggle anything GO in the
  // editor. Reporting adaptableGo=false for non-admins auto-hides every GO field
  // (enigma codes/extra images, the GO default-pattern block, etc.).
  const goValue = {
    adaptableGo: goMeta.adaptable_go === true && isAdmin,
    adaptableSpot: goMeta.adaptable_spot === true && isAdmin,
    answerCount: (goMeta.go_answer_count === 4 ? 4 : 2) as 2 | 4,
  };

  return (
    <ScenarioEditorContext.Provider value={value}>
      <GoEditorProvider value={goValue}>
        <CollapseAllProvider>
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <ScenarioHeader />
          {state.alert && (
            <div className="px-6 pt-4">
              <Alert type={state.alert.type === 'success' ? 'success' : 'error'} message={state.alert.message} onClose={() => setAlert(null)} />
            </div>
          )}
          <SectionsTOC />
          <main className="flex-1 px-6 py-4 space-y-4">
            <LanguageBar validatedLanguages={validatedLanguages} />
            <ScenarioTargetLanguages onValidatedChange={setValidatedLanguages} />
            {TopSection && <TopSection />}
            <MetaSection />
            <CoverSection />
            <LevelsSection />
            <OverscoresSection />
            <Body />
            <TextStringsSection />
            <TypographySection />
            <TimingSection />
            <AdminSection />
            <ReportLayoutSection />
            <AdminOnlyPanel>
              <ScenarioAdminControls scenarioId={scenarioId} />
            </AdminOnlyPanel>
          </main>
          <SaveBar />
        </div>
        </CollapseAllProvider>
      </GoEditorProvider>
    </ScenarioEditorContext.Provider>
  );
}
