/**
 * The Scenario overview's read model: what each scenario has, and what is
 * left to do.
 *
 * Pure - no React, no I/O. `backend/api/scenario_overview.php` reports the raw
 * material; everything is counted here.
 *
 * Two tiers (decision record: memory project_scenario_overview_mandatory_rules):
 *   1. the publish validators (`publishValidation.ts`), run on the same flat
 *      working copy the editor builds - errors are "critical", warnings "to do";
 *   2. a stricter "finished" checklist for catalogue products (admin-owned
 *      scenarios) that lives HERE ONLY and never gates publishing: required
 *      documents, minimum counts, feedback images, names, target-language
 *      translations... No sound is ever mandatory.
 * A licensee-authored scenario gets tier 1 only.
 *
 * Translation completeness uses the SAME row model as the Translations page
 * (`buildScenarioRows`), so the two pages can never disagree about what is
 * translatable.
 */

import type { Lang } from '../../i18n/languages';
import { fnv1a } from '../../i18n/translatorXlsx';
import { buildScenarioRows, type TranslationFile } from '../../i18n/scenarioTranslationRows';
import { expandTranslatablePaths, TRANSLATABLE_LEAF_FIELDS } from '../../scenarios/i18n/translatablePaths';
import { getAdapter } from '../../scenarios/registry';
import { mergeMediasIntoGameMeta, type ParsedMedias } from '../../scenarios/shell/state/hydrateGameMeta';
import {
  OTHER_DOC_TYPE,
  documentTypeLabel,
  requiredDocuments,
  resolveDocumentType,
} from '../../scenarios/documentTypes';
import type { ScenarioGameType } from '../../types/scenario-data';

/** One scenario as served by `scenario_overview.php?action=list`. */
export interface OverviewScenario {
  id: number;
  uniqid: string;
  title: string;
  game_type: string;
  scenario_type: string | null;
  status: string | null;
  version: string;
  updated_at: string | null;
  client_id: number | null;
  client_name: string | null;
  default_language: string;
  translated_langs: string[];
  /** Admin-owned scenario: languages must be validated before clients get them. */
  gated: boolean;
  validated_languages: string[];
  /** The languages the scenario is meant to exist in, its own first. */
  target_languages: string[];
  /** The cover carries text: a language version is expected per target language. */
  cover_has_text: boolean;
  /** The default `game_visual` is set. */
  cover: boolean;
  /** Languages covered by a cover version of their own: every non-French one when `game_visual_intl` is set. */
  cover_langs: string[];
  video: boolean;
  subtitle_langs: string[];
  game_meta: Record<string, unknown>;
  medias: ParsedMedias;
  /** Media file names the scenario references that are gone from the server. */
  missing_files: string[];
  translation_meta: Record<string, Record<string, string>>;
  files: TranslationFile[];
  finished_at: string | null;
  finished_by: string | null;
}

export interface LangCount {
  lang: Lang;
  done: number;
  total: number;
  /** Translated, but against a source text that has changed since. */
  outdated: number;
  /** Labels of the texts with no translation, in registry order. */
  missing: string[];
}

export interface FileLangCount {
  lang: Lang;
  /** Documents that have an edition in this language. */
  editions: number;
  /** Documents to translate (variants collapsed, "no translation needed" left out). */
  documents: number;
  /** File titles + strings printed inside those documents. */
  strings: LangCount;
  /** Names of the documents with no edition in this language. */
  missing: string[];
}

/** One attached document: a primary file plus its language variants. */
export interface OverviewDocument {
  name: string;
  /** Its document type id (`documentTypes.ts`), explicit or recognised from the name. */
  type: string;
  typeLabel: string;
  /** The languages it has an edition in, the scenario's own first. */
  langs: string[];
  /** An admin marked it "no translation needed". */
  noTranslation: boolean;
}

export type ChecklistGroup = 'settings' | 'media' | 'texts' | 'documents' | 'translations' | 'go' | 'spot';

export const GROUP_LABELS: Record<ChecklistGroup, string> = {
  settings: 'Game settings',
  media: 'Media',
  texts: 'Texts',
  documents: 'Documents',
  translations: 'Translations',
  go: 'GO',
  spot: 'Spot',
};

export const GROUP_ORDER: readonly ChecklistGroup[] = [
  'settings',
  'media',
  'texts',
  'documents',
  'translations',
  'go',
  'spot',
];

export interface ChecklistItem {
  group: ChecklistGroup;
  label: string;
  ok: boolean;
  /** A publish-validator ERROR: the game cannot run correctly without it. */
  critical: boolean;
  /** Set on translation items: the target language it belongs to. */
  lang?: Lang;
  /** Extra lines shown under a missing item (e.g. the untranslated texts). */
  details?: string[];
}

export interface GroupCount {
  done: number;
  total: number;
  /** At least one missing item is critical. */
  critical: boolean;
}

export interface ScenarioOverview {
  scenario: OverviewScenario;
  /** Admin-owned: the full "finished" checklist applies and it can be ticked. */
  product: boolean;
  sourceLang: Lang;
  /** The scenario's target languages minus its own; empty for a licensee scenario. */
  targets: Lang[];
  /** Every document attached to the scenario (language variants collapsed). */
  documents: number;
  documentList: OverviewDocument[];
  /** Required documents of the game type: present / required. */
  requiredDocuments: GroupCount;
  texts: LangCount[];
  files: FileLangCount[];
  /** Every counted check, passed or not. */
  items: ChecklistItem[];
  /** The items still missing - what "N items left" counts. */
  todo: ChecklistItem[];
  groups: Record<ChecklistGroup, GroupCount>;
  /** Optional media that is not provided: information only, never counted. */
  optional: string[];
  /** Referenced media files that are gone from the server. */
  brokenFiles: string[];
}

const up = (lang: string) => lang.toUpperCase();

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const baseName = (v: string): string => v.split(/[\\/]/).pop() ?? v;

/** The text of a `Localized` value in exactly `lang` (a bare string is the source). */
function ownText(value: unknown, lang: Lang): string {
  if (typeof value === 'string') return value.trim();
  if (isRecord(value)) {
    const v = value[lang];
    return typeof v === 'string' ? v.trim() : '';
  }
  return '';
}

/**
 * Prepare the flat working copy for the publish validators, which test plain
 * truthiness: a `Localized` map (`{}` is truthy) becomes its source-language
 * string, and a media reference whose file is gone from the server becomes ''.
 */
function forValidation(node: unknown, lang: Lang, missing: Set<string>, key?: string): unknown {
  if (Array.isArray(node)) return node.map((child) => forValidation(child, lang, missing));
  if (isRecord(node)) {
    if (key !== undefined && TRANSLATABLE_LEAF_FIELDS.includes(key)) return ownText(node, lang);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = forValidation(v, lang, missing, k);
    return out;
  }
  if (typeof node === 'string' && missing.size > 0 && missing.has(baseName(node))) return '';
  return node;
}

/** Validator checks that only exist to catch a mistake: listed when they fail, never as "done". */
const GUARD_RE = /is set but|is selected but|is the Purge station|is already used|supports at most|cannot exceed/;

function groupOfField(field: string): ChecklistGroup {
  if (/image|template|banner|logo|game_visual/.test(field)) return 'media';
  if (field === 'title' || field === 'description' || /\.(name|text)$/.test(field)) return 'texts';
  return 'settings';
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const filled = (v: unknown): boolean => (typeof v === 'string' ? v.trim() !== '' : typeof v === 'number');

/**
 * Count one language over a set of rows. A cell is DONE when it has a value;
 * it is additionally OUTDATED when a stored source hash no longer matches. A
 * value typed straight into the scenario editor carries no hash - that is a
 * translation, not a stale one, so (unlike the Translations grid, which wants
 * every cell re-confirmed) it is not flagged here.
 */
function countLang(
  rows: { label: string; values: Partial<Record<Lang, string>>; hashes: Partial<Record<Lang, string>> }[],
  sourceLang: Lang,
  lang: Lang,
): LangCount {
  const out: LangCount = { lang, done: 0, total: 0, outdated: 0, missing: [] };
  for (const row of rows) {
    const source = row.values[sourceLang] ?? '';
    if (source.trim() === '') continue;
    out.total++;
    if ((row.values[lang] ?? '').trim() === '') {
      out.missing.push(row.label);
      continue;
    }
    out.done++;
    const hash = row.hashes[lang];
    if (hash && hash !== fnv1a(source)) out.outdated++;
  }
  return out;
}

/**
 * The "finished" tier's own checks. `meta` is the validation-ready working
 * copy; `raw` keeps the Localized maps for the fields that copy does not
 * flatten (story, spot_question, bonus names, level names).
 */
function finishedTierItems(
  gameType: string,
  meta: Record<string, unknown>,
  raw: Record<string, unknown>,
  lang: Lang,
): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const add = (group: ChecklistGroup, ok: boolean, label: string) => items.push({ group, label, ok, critical: false });
  const list = (source: Record<string, unknown>, key: string): Record<string, unknown>[] =>
    (Array.isArray(source[key]) ? (source[key] as unknown[]) : []).filter(isRecord);

  add('texts', ownText(raw.story, lang) !== '', 'Story is required');

  if (gameType === 'tagquest' || gameType === 'mystery') {
    const levels = isRecord(raw.levels) ? raw.levels : {};
    for (const [key, level] of Object.entries(levels)) {
      if (!isRecord(level)) continue;
      add('texts', ownText(level.name, lang) !== '', `Level ${key}: name is required`);
    }
  }

  if (gameType === 'tagquest') {
    const malusInUse = meta.malus_station != null && Math.abs(num(meta.malus_points)) > 0;
    if (malusInUse) add('media', filled(meta.malus_image), 'Malus icon is required (a malus station is set)');
    if (num(meta.late_malus_points) !== 0) {
      add('media', filled(meta.late_malus_image), 'Late malus icon is required (late malus points are set)');
    }
  }

  if (gameType === 'mystery') {
    const enigmas = list(meta, 'enigmas');
    add('settings', enigmas.length >= 12, `At least 12 enigmas are required (${enigmas.length} today)`);

    // A bonus tier exists once it has a threshold or a score; the editor's
    // empty placeholder row is not one.
    const flatBonuses = list(meta, 'overscores');
    const bonuses = list(raw, 'overscores')
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => filled(o.overscore_step) || filled(o.overscore_score));
    if (bonuses.length > 0) {
      add('media', filled(meta.steps_container_image), 'Empty bonus image is required (the scenario has bonuses)');
      for (const { o, i } of bonuses) {
        add('media', filled(flatBonuses[i]?.image_overscore_step), `Bonus ${i + 1}: image is required`);
        add('texts', ownText(o.name_overscore_step, lang) !== '', `Bonus ${i + 1}: name is required`);
      }
    }

    if (meta.adaptable_go === true) {
      add('go', filled(meta.scenario_default_go_pattern), 'GO pattern is required');
      enigmas.forEach((e, i) => {
        add('go', filled(e.short_code), `Enigma ${i + 1}: short code is required`);
        if (num(meta.go_answer_count) === 4) {
          add('go', filled(e.wrong_answer_image_2), `Enigma ${i + 1}: 2nd wrong-answer image is required`);
          add('go', filled(e.wrong_answer_image_3), `Enigma ${i + 1}: 3rd wrong-answer image is required`);
        }
      });
    }

    if (meta.adaptable_spot === true) {
      const rawEnigmas = list(raw, 'enigmas');
      enigmas.forEach((e, i) => {
        add('spot', ownText(rawEnigmas[i]?.spot_question, lang) !== '', `Enigma ${i + 1}: Spot question is required`);
        add('spot', num(e.difficulty) > 0, `Enigma ${i + 1}: difficulty is required`);
        add('spot', filled(e.wrong_answer_image), `Enigma ${i + 1}: wrong-answer image is required`);
      });
    }
  }

  if (gameType === 'tracks') {
    const checkpoints = list(meta, 'checkpoints');
    add('settings', checkpoints.length >= 12, `At least 12 checkpoints are required (${checkpoints.length} today)`);
    add('media', filled(meta.wrong_order_image), 'Wrong order image is required');
    add('media', filled(meta.missing_checkpoint_image), 'Missing checkpoint image is required');
    checkpoints.forEach((c, i) => add('texts', filled(c.title), `Checkpoint ${i + 1}: title is required`));
  }

  if (gameType === 'clash') {
    list(meta, 'clans').forEach((clan, i) =>
      add('media', filled(clan.score_card), `Clan ${i + 1}: score card is required`),
    );
    list(meta, 'territories').forEach((t, i) => add('texts', filled(t.name), `Territory ${i + 1}: name is required`));
  }

  return items;
}

/** Slot keys the "finished" tier checks itself, so they are never listed as optional. */
const TIER2_SLOT_KEYS = [
  'malus_image',
  'late_malus_image',
  'steps_container_image',
  'wrong_order_image',
  'missing_checkpoint_image',
];

/** Media slots that are neither checked nor provided - information only. */
function optionalNotProvided(gameType: string, meta: Record<string, unknown>, checkedFields: Set<string>): string[] {
  const adapter = getAdapter(gameType);
  if (!adapter) return [];
  const out: string[] = [];
  for (const slot of adapter.mediaSlots) {
    if (filled(meta[slot.key]) || checkedFields.has(slot.key)) continue;
    // Language versions and subtitles are counted per target language; the
    // instructions screen was removed from Mystery; Clash has no backdrop.
    if (/^game_visual_|^scenario_video_subtitle_|^game_instructions_/.test(slot.key)) continue;
    if (gameType === 'clash' && slot.key === 'background_image') continue;
    out.push(slot.label);
  }
  return out;
}

export function buildOverview(scenario: OverviewScenario): ScenarioOverview {
  const sourceLang = (scenario.default_language || 'fr') as Lang;
  const product = scenario.client_id === null;
  const targets = product ? (scenario.target_languages.filter((l) => l !== sourceLang) as Lang[]) : [];
  const gameType = scenario.game_type;
  const items: ChecklistItem[] = [];

  /* ------------------------- tier 1: publish validators ------------------------- */

  // The editor's flat working copy. `raw` keeps the Localized maps; `meta` is
  // the validator-ready copy (source-language strings, dead file refs blanked).
  const raw = structuredClone(scenario.game_meta ?? {}) as Record<string, unknown>;
  mergeMediasIntoGameMeta(raw, scenario.medias);
  const missingFiles = new Set(scenario.missing_files ?? []);
  const meta = forValidation(raw, sourceLang, missingFiles) as Record<string, unknown>;

  const checkedFields = new Set<string>(TIER2_SLOT_KEYS);
  const adapter = getAdapter(gameType);
  if (adapter) {
    const title = ownText(raw.title, sourceLang) || scenario.title;
    const description = ownText(raw.description, sourceLang);
    for (const c of adapter.validator(meta as never, title, description).checks) {
      checkedFields.add(c.field);
      if (c.ok && GUARD_RE.test(c.message)) continue;
      items.push({ group: groupOfField(c.field), label: c.message, ok: c.ok, critical: c.severity === 'error' });
    }
  }

  /* --------------------------- documents (grouping) --------------------------- */

  // One document = a primary file plus its language variants. A variant whose
  // primary was deleted still stands for its document.
  const fileGroups = new Map<number, TranslationFile[]>();
  for (const file of scenario.files) {
    const key = file.parent_file_id ?? file.id;
    fileGroups.set(key, [...(fileGroups.get(key) ?? []), file]);
  }
  // Files of the documents marked "no translation needed": still attached to
  // the scenario, but nothing about them is left to translate.
  const skippedFileIds = new Set<number>();
  const documents = [...fileGroups.values()].map((members) => {
    const primary = members.find((m) => m.parent_file_id === null) ?? members[0];
    const skip = primary.no_translation === true;
    if (skip) for (const m of members) skippedFileIds.add(m.id);
    // A file with no language set is an edition in the scenario's own language.
    const langs = new Set(members.map((m) => m.language || sourceLang));
    return { name: primary.name, type: resolveDocumentType(gameType, primary.name, primary.doc_type), langs, skip };
  });
  const toTranslate = documents.filter((d) => !d.skip);

  /* ------------------------------ translations ------------------------------ */

  const rows = buildScenarioRows({
    scenario: {
      uniqid: scenario.uniqid,
      title: scenario.title,
      game_type: gameType,
      default_language: sourceLang,
      available_languages: scenario.translated_langs,
    },
    gameMeta: scenario.game_meta,
    files: scenario.files,
  });
  const pathLabels = new Map(
    expandTranslatablePaths(gameType as ScenarioGameType, scenario.game_meta).map((d) => [d.path, d.label]),
  );
  const labelled = rows.map((row) => {
    // Field rows keep their staleness hashes in the scenario's translation_meta.
    const hashes =
      row.tradType === 'field' && row.path
        ? ((scenario.translation_meta?.[row.path] ?? {}) as Partial<Record<Lang, string>>)
        : row.hashes;
    const label =
      row.tradType === 'field'
        ? (pathLabels.get(row.path ?? '') ?? row.target)
        : row.tradType === 'file title'
          ? `${row.target} - title`
          : `${row.target} - "${(row.values[sourceLang] ?? '').slice(0, 60)}"`;
    return { ...row, hashes, label };
  });
  const fieldRows = labelled.filter((r) => r.tradType === 'field');
  const fileRows = labelled.filter(
    (r) => r.tradType !== 'field' && !(r.fileId !== undefined && skippedFileIds.has(r.fileId)),
  );

  const texts = targets.map((lang) => countLang(fieldRows, sourceLang, lang));
  const files = targets.map((lang): FileLangCount => {
    const missing = toTranslate.filter((d) => !d.langs.has(lang)).map((d) => d.name);
    return {
      lang,
      editions: toTranslate.length - missing.length,
      documents: toTranslate.length,
      strings: countLang(fileRows, sourceLang, lang),
      missing,
    };
  });

  /* ---------------------- tier 2: the "finished" checklist ---------------------- */

  const requiredCount: GroupCount = { done: 0, total: 0, critical: false };

  if (product) {
    items.push(...finishedTierItems(gameType, meta, raw, sourceLang));

    for (const doc of requiredDocuments(gameType)) {
      const present = documents.some((d) => d.type === doc.id);
      requiredCount.total++;
      if (present) requiredCount.done++;
      items.push({ group: 'documents', label: `${doc.label} is required`, ok: present, critical: false });
    }

    for (const lang of targets) {
      const tr = (ok: boolean, label: string, details?: string[]) =>
        items.push({ group: 'translations', label, ok, critical: false, lang, details });

      const t = texts.find((c) => c.lang === lang)!;
      if (t.total > 0) {
        tr(t.done >= t.total, `In-game texts: ${t.done} of ${t.total} translated`, t.missing);
        if (t.outdated > 0) tr(false, `In-game texts: ${t.outdated} outdated (the source text changed since)`);
      }

      if (scenario.video) tr(scenario.subtitle_langs.includes(lang), 'Video subtitles');
      if (scenario.cover_has_text) {
        tr(scenario.cover_langs.includes(lang), 'Cover visual version (the cover contains text)');
      }

      for (const d of toTranslate) tr(d.langs.has(lang), `${d.name}: ${up(lang)} edition`);

      const f = files.find((c) => c.lang === lang)!;
      if (f.strings.total > 0) {
        tr(
          f.strings.done >= f.strings.total,
          `File titles and texts: ${f.strings.done} of ${f.strings.total} translated`,
          f.strings.missing,
        );
        if (f.strings.outdated > 0) tr(false, `File titles and texts: ${f.strings.outdated} outdated`);
      }

      if (scenario.gated) tr(scenario.validated_languages.includes(lang), 'Released to licensees');
    }
  }

  /* --------------------------------- summary --------------------------------- */

  const groups = {} as Record<ChecklistGroup, GroupCount>;
  for (const g of GROUP_ORDER) groups[g] = { done: 0, total: 0, critical: false };
  for (const item of items) {
    const g = groups[item.group];
    g.total++;
    if (item.ok) g.done++;
    else if (item.critical) g.critical = true;
  }

  return {
    scenario,
    product,
    sourceLang,
    targets,
    documents: documents.length,
    documentList: documents.map((d) => ({
      name: d.name,
      type: d.type,
      typeLabel: d.type === OTHER_DOC_TYPE ? 'Other' : documentTypeLabel(gameType, d.type),
      langs: [...d.langs].sort((a, b) => Number(b === sourceLang) - Number(a === sourceLang) || a.localeCompare(b)),
      noTranslation: d.skip,
    })),
    requiredDocuments: requiredCount,
    texts,
    files,
    items,
    todo: items.filter((i) => !i.ok),
    groups,
    optional: optionalNotProvided(gameType, meta, checkedFields),
    brokenFiles: [...missingFiles].sort(),
  };
}
