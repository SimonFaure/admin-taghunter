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

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
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
import { getLocalized, setLocalized } from '../i18n/getLocalized';
import type { Lang } from '../i18n/types';
import { ScenarioHeader } from './components/ScenarioHeader';
import { SaveBar } from './components/SaveBar';
import { CollapseAllProvider } from './components/CollapsibleSection';
import { GoEditorProvider } from './components/GoEditorContext';
import { SectionsTOC } from './components/SectionsTOC';
import { LanguageBar } from './components/LanguageBar';
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

  // Load scenario row + hydrate state
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await db
          .from('scenarios')
          .select('title, description, uniqid, data, medias, status, scenario_type, scenario_layout, version')
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
        const parsedMedia = parseCol((data as { medias: unknown }).medias) as
          | {
              images?: Record<string, string>;
              sounds?: Record<string, string>;
              video?: string;
              quests?: Array<Record<string, string | number | undefined>>;
              enigmas?: Array<Record<string, string | undefined>>;
              overscores?: Array<Record<string, string | undefined>>;
              levels?: Record<string, string>;
              checkpoints?: Array<Record<string, string | number | undefined>>;
            }
          | null;
        const parsedLayout = parseCol((data as { scenario_layout: unknown }).scenario_layout);
        const row = data as {
          uniqid?: string;
          title?: string;
          description?: string;
          status?: string;
          scenario_type?: string;
          version?: unknown;
        };

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
        if (parsedMedia?.images) for (const [k, v] of Object.entries(parsedMedia.images)) merged[k] = v;
        if (parsedMedia?.sounds) for (const [k, v] of Object.entries(parsedMedia.sounds)) merged[k] = v;
        // medias.video is a single full path "/media/<uniqid>/scenario_video_*.ext"
        // for ScenarioDetailView compat; strip to bare filename for the editor.
        if (parsedMedia?.video) merged.scenario_video = extractFileName(parsedMedia.video);

        // Tagquest stores per-quest image/sound filenames in medias.quests
        // (cleanGameMetaForData strips them out of data.game_meta.quests on save;
        // the legacy zip importer also writes mapped filenames there). Overlay
        // them onto merged.quests by array index so the editor sees real files.
        if (parsedMedia?.quests && Array.isArray(merged.quests)) {
          const inMerged = merged.quests as Array<Record<string, unknown>>;
          const QUEST_MEDIA_KEYS = ['main_image', 'sound', 'image_1', 'image_2', 'image_3', 'image_4'] as const;
          parsedMedia.quests.forEach((mq, i) => {
            if (!mq || i >= inMerged.length) return;
            for (const k of QUEST_MEDIA_KEYS) {
              const v = mq[k];
              if (typeof v === 'string' && v) inMerged[i][k] = v;
            }
          });
        }

        // Mystery equivalent: medias.enigmas[] is the source of truth for
        // per-enigma good_answer_image (cleanGameMetaForData strips it off
        // gameMeta.enigmas on save). Match by enigma_number - the medias array
        // only contains entries that HAVE an image, so indices may not align.
        if (parsedMedia?.enigmas && Array.isArray(merged.enigmas)) {
          const inMerged = merged.enigmas as Array<Record<string, unknown>>;
          const byNumber = new Map<string, Record<string, string | undefined>>();
          for (const em of parsedMedia.enigmas) {
            if (!em) continue;
            const n = em.enigma_number;
            if (typeof n === 'string' && n !== '') byNumber.set(n, em);
          }
          inMerged.forEach((e) => {
            const n = e.number;
            if (typeof n !== 'string' || n === '') return;
            const m = byNumber.get(n);
            if (m?.good_answer_image) e.good_answer_image = m.good_answer_image;
            if (m?.wrong_answer_image) e.wrong_answer_image = m.wrong_answer_image;
            // GO 4-answer extra wrong images.
            if (m?.wrong_answer_image_2) e.wrong_answer_image_2 = m.wrong_answer_image_2;
            if (m?.wrong_answer_image_3) e.wrong_answer_image_3 = m.wrong_answer_image_3;
          });
        }

        // Tracks: medias.checkpoints[] is the source of truth for per-checkpoint
        // images (cleanGameMetaForData strips checkpoint.image; buildMediasColumn
        // emits {checkpoint_id, checkpoint_number, image}). Match by
        // checkpoint_id first (new uuid), then by checkpoint_number for legacy
        // imports where the editor's local id hasn't been written yet.
        if (parsedMedia?.checkpoints && Array.isArray(merged.checkpoints)) {
          const inMerged = merged.checkpoints as Array<Record<string, unknown>>;
          type CpMedia = Record<string, string | number | undefined>;
          const byId = new Map<string, CpMedia>();
          const byNumber = new Map<string, CpMedia>();
          for (const cm of parsedMedia.checkpoints) {
            if (!cm) continue;
            if (typeof cm.checkpoint_id === 'string' && cm.checkpoint_id !== '') {
              byId.set(cm.checkpoint_id, cm);
            }
            const n =
              typeof cm.checkpoint_number === 'string'
                ? cm.checkpoint_number
                : typeof cm.checkpoint_number === 'number'
                  ? String(cm.checkpoint_number)
                  : '';
            if (n !== '') byNumber.set(n, cm);
          }
          inMerged.forEach((c, idx) => {
            const id = typeof c.id === 'string' ? c.id : '';
            const fallbackKey = String(idx + 1);
            const m = (id && byId.get(id)) || byNumber.get(fallbackKey);
            if (m && typeof m.image === 'string' && m.image !== '') c.image = m.image;
          });
        }

        // Same for overscores → image_overscore_step (matched by overscore_step).
        if (parsedMedia?.overscores && Array.isArray(merged.overscores)) {
          const inMerged = merged.overscores as Array<Record<string, unknown>>;
          const byStep = new Map<string, Record<string, string | undefined>>();
          for (const om of parsedMedia.overscores) {
            if (!om) continue;
            const s = om.overscore_step;
            if (typeof s === 'string' && s !== '') byStep.set(s, om);
          }
          inMerged.forEach((o) => {
            const s = o.overscore_step;
            if (typeof s !== 'string' || s === '') return;
            const m = byStep.get(s);
            if (m?.image_overscore_step) o.image_overscore_step = m.image_overscore_step;
          });
        }

        // Mystery's level gauge images live in medias.levels (legacy
        // "levels" overload - these are 4 image fields, not gameplay levels).
        // Hydrate them onto gameMeta the same way as medias.images.
        if (parsedMedia?.levels) {
          for (const [k, v] of Object.entries(parsedMedia.levels)) {
            if (typeof v === 'string' && v) merged[k] = v;
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
  }, [scenarioId, adapter, t]);

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
    const meta = state.gameMeta as Record<string, unknown>;
    const currentVersion = parseFloat(String(meta.scenario_version ?? '0'));
    const safeCurrent = Number.isFinite(currentVersion) ? currentVersion : 0;
    const nextVersion = (Math.round((safeCurrent + 0.1) * 10) / 10).toFixed(1);
    const bumpedMeta = { ...meta, scenario_version: nextVersion };
    dispatch({ type: 'SET_GAME_META', payload: bumpedMeta });
    // Publishing flips the row's status draft -> published (the save path leaves
    // status untouched).
    const payload: SavePayload = { ...buildPayload(), gameMeta: bumpedMeta, status: 'published' };
    const result = await performSave(payload);
    if (result.ok) {
      await flushOrphanedAssets();
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
        ? { type: 'success', message: t('alert.published', { version: nextVersion }) }
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
    adaptableDrop: goMeta.adaptable_drop === true && isAdmin,
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
            <LanguageBar />
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
