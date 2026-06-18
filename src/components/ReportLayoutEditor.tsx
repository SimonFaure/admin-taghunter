// Shared block editor + live preview for mission-report PDF layouts. Used by
// the admin "Report layouts" page (global per-type defaults) and the
// per-scenario override section. Pure controlled component: it owns no
// persistence — the parent supplies `layout` + `onChange` and decides where it's
// stored (report_layouts.php for defaults, game_meta for overrides).

import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { type ReportLayout, type ReportBlock, type ReportBlockType } from '../lib/api';
import { FONT_CATALOG } from '../fonts/catalog';
import { catalogFontFaceCss } from '../fonts/registerCatalogFonts';

// Editor-only English labels (the real labels print in each team's language
// from the playground's i18n `report` namespace).
export const STAT_LABEL: Record<string, string> = {
  rate: 'SUCCESS RATE', success: 'SUCCESSES', fail: 'FAILURES', absent: 'MISSED',
  correct: 'CORRECT', wrong: 'WRONG', missing: 'MISSING',
  quests: 'QUESTS', points: 'POINTS', level: 'RANK', combos: 'COMBOS',
  territories: 'TERRITORIES',
};

export const BLOCK_LABEL: Record<ReportBlockType, string> = {
  logo: 'Logo', game_title: 'Game title', pdf_title: 'PDF title', team_name: 'Team name',
  date: 'Date', duration: 'Duration', score: 'Score', rank: 'Ranking',
  stat_grid: 'Stat grid', text: 'Free text',
  divider: 'Divider', spacer: 'Spacer', row: 'Side-by-side row', frame: 'Framed section',
};

// Container blocks hold other blocks in `children`.
const CONTAINER_TYPES: ReportBlockType[] = ['row', 'frame'];
function isContainer(type: ReportBlockType): boolean {
  return CONTAINER_TYPES.includes(type);
}

// "Add block" menu groupings. Containers can only be added at the top level
// (one level of nesting) to keep the editor tractable.
const CONTENT_TYPES: ReportBlockType[] = [
  'logo', 'game_title', 'pdf_title', 'team_name', 'date', 'duration', 'score', 'rank', 'stat_grid', 'text',
];
const LAYOUT_TYPES: ReportBlockType[] = ['divider', 'spacer', 'row', 'frame'];

/** Build a fresh block of `type` with sensible defaults. */
function makeBlock(type: ReportBlockType, availableFields: string[]): ReportBlock {
  const base: ReportBlock = { type, show: true };
  switch (type) {
    case 'logo': return { ...base, align: 'center', logoSize: 110 };
    case 'game_title': return { ...base, size: 28, align: 'center' };
    case 'pdf_title': return { ...base, size: 18, align: 'center' };
    case 'team_name': return { ...base, size: 22, align: 'center', bold: true };
    case 'date': case 'duration': case 'score': case 'rank':
      return { ...base, size: 16, align: 'center', bold: true };
    case 'stat_grid': return { ...base, size: 16, align: 'center', fields: [...availableFields] };
    case 'text': return { ...base, size: 14, align: 'center' };
    case 'divider': return { ...base, thickness: 1, width: 70, color: '#cccccc' };
    case 'spacer': return { ...base, height: 16 };
    case 'row': return { ...base, gap: 16, justify: 'center', children: [] };
    case 'frame': return { ...base, bordered: true, borderColor: '#333333', padding: 12, radius: 6, children: [] };
    default: return base;
  }
}

// ----- immutable tree edits over `blocks`, addressed by a path of indices -----

type Path = number[];

function patchAt(blocks: ReportBlock[], path: Path, patch: Partial<ReportBlock>): ReportBlock[] {
  const [i, ...rest] = path;
  return blocks.map((b, idx) => {
    if (idx !== i) return b;
    if (rest.length === 0) return { ...b, ...patch };
    return { ...b, children: patchAt(b.children ?? [], rest, patch) };
  });
}

function removeAt(blocks: ReportBlock[], path: Path): ReportBlock[] {
  const [i, ...rest] = path;
  if (rest.length === 0) return blocks.filter((_, idx) => idx !== i);
  return blocks.map((b, idx) => (idx === i ? { ...b, children: removeAt(b.children ?? [], rest) } : b));
}

function moveAt(blocks: ReportBlock[], path: Path, dir: -1 | 1): ReportBlock[] {
  const [i, ...rest] = path;
  if (rest.length === 0) {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return blocks;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  }
  return blocks.map((b, idx) => (idx === i ? { ...b, children: moveAt(b.children ?? [], rest, dir) } : b));
}

function addChildAt(blocks: ReportBlock[], path: Path, child: ReportBlock): ReportBlock[] {
  const [i, ...rest] = path;
  return blocks.map((b, idx) => {
    if (idx !== i) return b;
    if (rest.length === 0) return { ...b, children: [...(b.children ?? []), child] };
    return { ...b, children: addChildAt(b.children ?? [], rest, child) };
  });
}

// Built-in English default for each standalone label (mirrors the playground's
// `report` i18n namespace). Used as the editor placeholder and the preview text
// when no override is typed — at print time a blank override resolves to the
// team's language instead.
export const DEFAULT_LABEL: Record<string, string> = {
  date: 'DATE', duration: 'DURATION', score: 'SCORE', rank: 'RANK',
};

// The Taghunter logo bundled with the studio (public/). Shown in the preview so
// the operator sees the real header that prints.
const PREVIEW_LOGO_URL = `${window.location.origin}/logo_tag_hunter.png`;

/** Label ids that a block contributes (for override editing + preview). */
function blockLabelKey(type: ReportBlockType): string | null {
  return type === 'date' || type === 'duration' || type === 'score' || type === 'rank' ? type : null;
}

const SAMPLE = {
  gameTitle: 'LE PORTAIL DES OMBRES', pdfTitle: 'COMPTE RENDU DE MISSION',
  teamLabel: 'NOM DE CODE', teamName: 'BLIZZARD', date: '03/06/2026',
  duration: '00 MINUTES AND 20 SECONDS', score: '120', rank: '1 / 4',
  stats: { rate: '10%', success: '1', fail: '0', absent: '11', correct: '8', wrong: '1', missing: '3', quests: '6', points: '120', level: 'GOLD', combos: '2', territories: '3' } as Record<string, string>,
};

export function fontStack(family: string): string {
  return FONT_CATALOG.find((f) => f.family === family)?.stack ?? `'${family}', serif`;
}

/** CSS `justify-content` value for a row block's distribution. */
function justifyCss(j: ReportBlock['justify']): string {
  return j === 'start' ? 'flex-start' : j === 'end' ? 'flex-end' : j === 'between' ? 'space-between' : 'center';
}

/** Inline style for a `frame` container box. Shrink-wraps its content
 *  (inline-block) so the wrapper's text-align can center/position it. */
function frameStyle(b: ReportBlock): string {
  const parts = ['box-sizing:border-box', 'display:inline-block', `padding:${b.padding ?? 12}px`];
  if (b.bordered !== false) parts.push(`border:1px solid ${b.borderColor ?? '#333333'}`);
  if (b.bgColor) parts.push(`background:${b.bgColor}`);
  if (b.radius) parts.push(`border-radius:${b.radius}px`);
  return parts.join(';');
}

// Trimmed mirror of the playground's reportPrint HTML builder (preview only).
export function buildPreviewHtml(layout: ReportLayout): string {
  const baseStack = fontStack(layout.font);
  const bg = layout.background.mode === 'color' && layout.background.color ? layout.background.color : '#ffffff';
  // An admin-typed override prints verbatim; otherwise show the built-in label
  // (which prints translated per team language).
  const lbl = (key: string, fallback: string): string => {
    const o = layout.labels?.[key];
    return o && o.trim() ? o : fallback;
  };
  const blockHtml = (b: ReportBlock): string => {
    if (!b.show) return '';
    const style = [
      // Font stacks contain double quotes (e.g. "Times New Roman"); they'd close
      // the style="…" attribute early and void the whole inline style, so swap
      // them for single quotes (valid CSS, safe inside the double-quoted attr).
      `font-family:${(b.font ? fontStack(b.font) : baseStack).replace(/"/g, "'")}`,
      `text-align:${b.align ?? 'center'}`,
      b.size ? `font-size:${b.size}px` : '',
      b.color ? `color:${b.color}` : '',
      b.bold ? 'font-weight:bold' : '',
    ].filter(Boolean).join(';');
    switch (b.type) {
      case 'logo':
        return `<div style="text-align:${b.align ?? 'center'};margin:6px 0"><img src="${PREVIEW_LOGO_URL}" style="width:${b.logoSize ?? 110}px;max-width:80%" alt="Taghunter"/></div>`;
      case 'game_title': return `<div style="${style};margin:4px 0">${SAMPLE.gameTitle}</div>`;
      case 'pdf_title': return `<div style="${style};margin:2px 0">${layout.pdfTitle || SAMPLE.pdfTitle}</div>`;
      case 'team_name': return `<div style="${style};margin:8px 0"><div style="font-weight:bold;font-size:0.7em">${layout.teamTitle || SAMPLE.teamLabel}</div><div>${SAMPLE.teamName}</div></div>`;
      case 'date': return `<div style="${style};margin:6px 0"><div style="font-weight:bold;font-size:0.75em">${lbl('date', DEFAULT_LABEL.date)}</div><div>${SAMPLE.date}</div></div>`;
      case 'duration': return `<div style="${style};margin:6px 0"><div style="font-weight:bold;font-size:0.8em">${lbl('duration', DEFAULT_LABEL.duration)}</div><div>${SAMPLE.duration}</div></div>`;
      case 'score': return `<div style="${style};margin:6px 0"><div style="font-weight:bold;font-size:0.8em">${lbl('score', DEFAULT_LABEL.score)}</div><div>${SAMPLE.score}</div></div>`;
      case 'rank': return `<div style="${style};margin:6px 0"><div style="font-weight:bold;font-size:0.8em">${lbl('rank', DEFAULT_LABEL.rank)}</div><div>${SAMPLE.rank}</div></div>`;
      case 'stat_grid': {
        const cells = (b.fields ?? []).map((f) => `<td style="padding:0 10px;text-align:center;vertical-align:top"><div style="font-weight:bold">${lbl(`stat_${f}`, STAT_LABEL[f] ?? f)}</div><div>${SAMPLE.stats[f] ?? '—'}</div></td>`).join('');
        return cells ? `<div style="text-align:${b.align ?? 'center'};margin:8px 0"><table style="${style};display:inline-table;border-collapse:collapse"><tr>${cells}</tr></table></div>` : '';
      }
      case 'text': return b.text ? `<div style="${style};margin:6px 0">${b.text}</div>` : '';
      case 'divider':
        return `<hr style="border:none;border-top:${b.thickness ?? 1}px solid ${b.color ?? '#cccccc'};width:${b.width ?? 70}%;margin:10px auto"/>`;
      case 'spacer':
        return `<div style="height:${b.height ?? 16}px"></div>`;
      case 'row': {
        const kids = (b.children ?? []).map(blockHtml).filter(Boolean);
        if (!kids.length) return '';
        return `<div style="display:flex;flex-wrap:wrap;align-items:flex-start;width:100%;margin:6px 0;justify-content:${justifyCss(b.justify)};gap:${b.gap ?? 16}px">${kids.map((k) => `<div>${k}</div>`).join('')}</div>`;
      }
      case 'frame': {
        const kids = (b.children ?? []).map(blockHtml).join('');
        return kids ? `<div style="text-align:center;margin:10px 0"><div style="${frameStyle(b)}">${kids}</div></div>` : '';
      }
      default: return '';
    }
  };
  const fontFaces = catalogFontFaceCss(typeof window !== 'undefined' ? window.location.origin : '');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    ${fontFaces}
    html,body{margin:0;padding:0}
    body{font-family:${baseStack};background:${bg};text-transform:uppercase;padding:14px}
  </style></head><body>${layout.blocks.map(blockHtml).join('')}</body></html>`;
}

interface Props {
  layout: ReportLayout;
  availableFields: string[];
  onChange: (next: ReportLayout) => void;
  /** Compact mode (scenario override) hides nothing but tightens spacing. */
  previewHeight?: number;
  /**
   * Show the default PDF title + team-name label text inputs. Used by the admin
   * per-game-type page (these are the type-level defaults). The per-scenario
   * override section keeps these as top-level game_meta fields instead, so it
   * leaves this off.
   */
  showTitleFields?: boolean;
}

export function ReportLayoutEditor({ layout, availableFields, onChange, previewHeight = 560, showTitleFields = false }: Props) {
  const { t } = useTranslation('reportLayoutEditor');
  const blockLabel = (type: ReportBlockType): string => t(`blockLabel.${type}`);
  const previewHtml = useMemo(() => buildPreviewHtml(layout), [layout]);

  // Drive the preview imperatively: assign the `srcdoc` *property* on every
  // change. React diffing the srcDoc *attribute* alone does not reliably make
  // the iframe re-navigate, so block-style edits (color/size/align/…) could
  // appear stale. Setting the property guarantees a reload.
  const previewRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (previewRef.current) previewRef.current.srcdoc = previewHtml;
  }, [previewHtml]);

  const patchLayout = (patch: Partial<ReportLayout>) => onChange({ ...layout, ...patch });
  const updateBlocks = (blocks: ReportBlock[]) => onChange({ ...layout, blocks });
  const patchBlock = (path: Path, patch: Partial<ReportBlock>) => updateBlocks(patchAt(layout.blocks, path, patch));
  const moveBlock = (path: Path, dir: -1 | 1) => updateBlocks(moveAt(layout.blocks, path, dir));
  const removeBlock = (path: Path) => updateBlocks(removeAt(layout.blocks, path));
  const addBlock = (type: ReportBlockType) => updateBlocks([...layout.blocks, makeBlock(type, availableFields)]);
  const addChild = (path: Path, type: ReportBlockType) => updateBlocks(addChildAt(layout.blocks, path, makeBlock(type, availableFields)));
  // Per-label literal override. Empty string is kept (means "explicitly blank →
  // use the translated built-in"); the playground treats blank as fallback.
  const setLabel = (key: string, val: string) =>
    onChange({ ...layout, labels: { ...(layout.labels ?? {}), [key]: val } });

  // Shared dark-theme styling for the in-block text/label inputs.
  const labelInputClass = 'w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-slate-100 text-sm';
  const numClass = 'w-16 px-1.5 py-1 bg-slate-900 border border-slate-600 rounded text-slate-100';

  // "+ Add block…" dropdown. Containers (row/frame) appear only at top level.
  const AddBlockMenu = ({ onAdd, allowContainers }: { onAdd: (t: ReportBlockType) => void; allowContainers: boolean }) => (
    <select
      value=""
      onChange={(e) => { if (e.target.value) onAdd(e.target.value as ReportBlockType); }}
      className="px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-slate-300 text-xs"
    >
      <option value="">{t('addBlock.placeholder')}</option>
      <optgroup label={t('addBlock.groupContent')}>
        {CONTENT_TYPES.map((bt) => <option key={bt} value={bt}>{blockLabel(bt)}</option>)}
      </optgroup>
      <optgroup label={t('addBlock.groupLayout')}>
        {(allowContainers ? LAYOUT_TYPES : LAYOUT_TYPES.filter((bt) => !isContainer(bt))).map((bt) => (
          <option key={bt} value={bt}>{blockLabel(bt)}</option>
        ))}
      </optgroup>
    </select>
  );

  // Recursive block card. `path` is the index trail from layout.blocks;
  // `siblingCount` bounds the up/down move buttons.
  const renderCard = (b: ReportBlock, path: Path, siblingCount: number): JSX.Element => {
    const idx = path[path.length - 1];
    const nested = path.length > 1;
    const labelKey = blockLabelKey(b.type);
    return (
      <div key={path.join('-')} className={`bg-slate-800 border border-slate-700 rounded-xl p-3 space-y-2 ${nested ? 'border-l-2 border-l-blue-600/60' : ''}`}>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
            <input type="checkbox" checked={b.show} onChange={(e) => patchBlock(path, { show: e.target.checked })} />
            {blockLabel(b.type)}
          </label>
          <div className="flex items-center gap-1">
            <button onClick={() => moveBlock(path, -1)} disabled={idx === 0} className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30" title={t('moveUp')}><ArrowUp size={15} /></button>
            <button onClick={() => moveBlock(path, 1)} disabled={idx === siblingCount - 1} className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30" title={t('moveDown')}><ArrowDown size={15} /></button>
            <button onClick={() => removeBlock(path)} className="p-1 text-slate-400 hover:text-red-400" title={t('removeBlock')}><Trash2 size={15} /></button>
          </div>
        </div>

        {b.show && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {b.type === 'logo' && (
              <label className="flex items-center gap-1 text-slate-400">{t('size')}
                <input type="number" min={20} max={400} value={b.logoSize ?? 110} onChange={(e) => patchBlock(path, { logoSize: Number(e.target.value) || 110 })} className={numClass} />
              </label>
            )}
            {b.type === 'divider' && (
              <>
                <label className="flex items-center gap-1 text-slate-400">{t('thickness')}
                  <input type="number" min={1} max={12} value={b.thickness ?? 1} onChange={(e) => patchBlock(path, { thickness: Number(e.target.value) || 1 })} className="w-14 px-1.5 py-1 bg-slate-900 border border-slate-600 rounded text-slate-100" />
                </label>
                <label className="flex items-center gap-1 text-slate-400">{t('widthPercent')}
                  <input type="number" min={10} max={100} value={b.width ?? 70} onChange={(e) => patchBlock(path, { width: Number(e.target.value) || 70 })} className="w-14 px-1.5 py-1 bg-slate-900 border border-slate-600 rounded text-slate-100" />
                </label>
                <input type="color" value={b.color ?? '#cccccc'} onChange={(e) => patchBlock(path, { color: e.target.value })} title={t('lineColor')} />
              </>
            )}
            {b.type === 'spacer' && (
              <label className="flex items-center gap-1 text-slate-400">{t('height')}
                <input type="number" min={2} max={200} value={b.height ?? 16} onChange={(e) => patchBlock(path, { height: Number(e.target.value) || 16 })} className={numClass} />
              </label>
            )}
            {b.type === 'row' && (
              <>
                <label className="flex items-center gap-1 text-slate-400">{t('gap')}
                  <input type="number" min={0} max={80} value={b.gap ?? 16} onChange={(e) => patchBlock(path, { gap: Number(e.target.value) || 0 })} className="w-14 px-1.5 py-1 bg-slate-900 border border-slate-600 rounded text-slate-100" />
                </label>
                <select value={b.justify ?? 'center'} onChange={(e) => patchBlock(path, { justify: e.target.value as ReportBlock['justify'] })} className="px-1.5 py-1 bg-slate-900 border border-slate-600 rounded text-slate-100">
                  <option value="start">{t('justify.left')}</option><option value="center">{t('justify.center')}</option><option value="end">{t('justify.right')}</option><option value="between">{t('justify.spread')}</option>
                </select>
              </>
            )}
            {b.type === 'frame' && (
              <>
                <label className="flex items-center gap-1 text-slate-400"><input type="checkbox" checked={b.bordered !== false} onChange={(e) => patchBlock(path, { bordered: e.target.checked })} />{t('border')}</label>
                {b.bordered !== false && <input type="color" value={b.borderColor ?? '#333333'} onChange={(e) => patchBlock(path, { borderColor: e.target.value })} title={t('borderColor')} />}
                <label className="flex items-center gap-1 text-slate-400"><input type="checkbox" checked={!!b.bgColor} onChange={(e) => patchBlock(path, { bgColor: e.target.checked ? (b.bgColor || '#f3f4f6') : '' })} />{t('fill')}</label>
                {b.bgColor && <input type="color" value={b.bgColor} onChange={(e) => patchBlock(path, { bgColor: e.target.value })} title={t('backgroundColor')} />}
                <label className="flex items-center gap-1 text-slate-400">{t('pad')}
                  <input type="number" min={0} max={60} value={b.padding ?? 12} onChange={(e) => patchBlock(path, { padding: Number(e.target.value) || 0 })} className="w-12 px-1.5 py-1 bg-slate-900 border border-slate-600 rounded text-slate-100" />
                </label>
                <label className="flex items-center gap-1 text-slate-400">{t('radius')}
                  <input type="number" min={0} max={40} value={b.radius ?? 0} onChange={(e) => patchBlock(path, { radius: Number(e.target.value) || 0 })} className="w-12 px-1.5 py-1 bg-slate-900 border border-slate-600 rounded text-slate-100" />
                </label>
              </>
            )}
            {b.type !== 'logo' && !isContainer(b.type) && b.type !== 'divider' && b.type !== 'spacer' && (
              <>
                <select value={b.font ?? ''} onChange={(e) => patchBlock(path, { font: e.target.value || null })} title={t('font')} className="px-1.5 py-1 bg-slate-900 border border-slate-600 rounded text-slate-100 max-w-[130px]">
                  <option value="">{t('defaultFont')}</option>
                  {FONT_CATALOG.map((f) => <option key={f.family} value={f.family}>{f.label}</option>)}
                </select>
                <label className="flex items-center gap-1 text-slate-400">{t('size')}
                  <input type="number" min={8} max={80} value={b.size ?? 16} onChange={(e) => patchBlock(path, { size: Number(e.target.value) || 16 })} className="w-14 px-1.5 py-1 bg-slate-900 border border-slate-600 rounded text-slate-100" />
                </label>
                <select value={b.align ?? 'center'} onChange={(e) => patchBlock(path, { align: e.target.value as ReportBlock['align'] })} className="px-1.5 py-1 bg-slate-900 border border-slate-600 rounded text-slate-100">
                  <option value="left">{t('align.left')}</option><option value="center">{t('align.center')}</option><option value="right">{t('align.right')}</option>
                </select>
                <label className="flex items-center gap-1 text-slate-400"><input type="checkbox" checked={!!b.bold} onChange={(e) => patchBlock(path, { bold: e.target.checked })} />{t('bold')}</label>
                <input type="color" value={b.color ?? '#000000'} onChange={(e) => patchBlock(path, { color: e.target.value })} title={t('color')} />
              </>
            )}
            {b.type === 'text' && (
              <input type="text" value={b.text ?? ''} placeholder={t('footerTextPlaceholder')} onChange={(e) => patchBlock(path, { text: e.target.value })}
                className="flex-1 min-w-[140px] px-2 py-1 bg-slate-900 border border-slate-600 rounded text-slate-100" />
            )}
          </div>
        )}

        {/* PDF heading text (admin per-game-type default; scenarios set this
            via game_meta.pdf_title in the scenario editor). */}
        {b.show && b.type === 'pdf_title' && showTitleFields && (
          <div className="pt-1">
            <span className="text-xs text-slate-400 mb-1 block">{t('titleText')}</span>
            <input type="text" value={layout.pdfTitle ?? ''} placeholder={t('pdfTitlePlaceholder')}
              onChange={(e) => patchLayout({ pdfTitle: e.target.value })} className={labelInputClass} />
          </div>
        )}

        {/* Label printed above the team name (replaces "NOM DE CODE"). */}
        {b.show && b.type === 'team_name' && showTitleFields && (
          <div className="pt-1">
            <span className="text-xs text-slate-400 mb-1 block">{t('teamNameTitle')}</span>
            <input type="text" value={layout.teamTitle ?? ''} placeholder={t('teamNamePlaceholder')}
              onChange={(e) => patchLayout({ teamTitle: e.target.value })} className={labelInputClass} />
            <span className="text-[11px] text-slate-500 mt-1 block">{t('teamNameHint')}</span>
          </div>
        )}

        {/* Single-label override for date / duration / score / rank. Blank
            ⇒ the playground prints the translated built-in label. */}
        {b.show && labelKey && (
          <div className="pt-1">
            <span className="text-xs text-slate-400 mb-1 block">{t('label')}</span>
            <input type="text" value={layout.labels?.[labelKey] ?? ''}
              placeholder={t('labelAutoTranslated', { label: DEFAULT_LABEL[labelKey] })}
              onChange={(e) => setLabel(labelKey, e.target.value)} className={labelInputClass} />
            <span className="text-[11px] text-slate-500 mt-1 block">{t('labelHint')}</span>
          </div>
        )}

        {b.show && b.type === 'stat_grid' && (
          <div className="flex flex-wrap gap-2 pt-1">
            {availableFields.map((f) => {
              const on = (b.fields ?? []).includes(f);
              return (
                <button key={f} onClick={() => patchBlock(path, { fields: on ? (b.fields ?? []).filter((x) => x !== f) : [...(b.fields ?? []), f] })}
                  className={`px-2 py-0.5 rounded text-xs border ${on ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-600 text-slate-400'}`}>
                  {STAT_LABEL[f] ?? f}
                </button>
              );
            })}
          </div>
        )}

        {/* Per-column label overrides for the selected stat fields. */}
        {b.show && b.type === 'stat_grid' && (b.fields ?? []).length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-xs text-slate-400 block">{t('columnLabels')}</span>
            {(b.fields ?? []).map((f) => (
              <div key={f} className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 w-20 shrink-0 truncate" title={STAT_LABEL[f] ?? f}>{STAT_LABEL[f] ?? f}</span>
                <input type="text" value={layout.labels?.[`stat_${f}`] ?? ''} placeholder={t('labelAutoTranslated', { label: STAT_LABEL[f] ?? f })}
                  onChange={(e) => setLabel(`stat_${f}`, e.target.value)}
                  className="flex-1 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-slate-100 text-xs" />
              </div>
            ))}
          </div>
        )}

        {/* Container children — nested cards + their own add-block menu. */}
        {b.show && isContainer(b.type) && (
          <div className="space-y-2 pt-1 pl-2">
            {(b.children ?? []).map((c, ci) => renderCard(c, [...path, ci], (b.children ?? []).length))}
            {(b.children ?? []).length === 0 && (
              <p className="text-[11px] text-slate-500">{b.type === 'row' ? t('emptyRow') : t('emptyFrame')}</p>
            )}
            <AddBlockMenu onAdd={(t) => addChild(path, t)} allowContainers={false} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Editor */}
      <div className="space-y-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">{t('document')}</h3>
          <label className="block">
            <span className="text-xs text-slate-400 mb-1 block">{t('defaultFont')}</span>
            <select value={layout.font} onChange={(e) => patchLayout({ font: e.target.value })}
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-slate-100 text-sm">
              {FONT_CATALOG.map((f) => <option key={f.family} value={f.family}>{f.label}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={layout.background.mode === 'color'}
                onChange={(e) => patchLayout({ background: e.target.checked ? { mode: 'color', color: layout.background.color ?? '#ffffff' } : { mode: 'none' } })} />
              {t('backgroundColorToggle')}
            </label>
            {layout.background.mode === 'color' && (
              <input type="color" value={layout.background.color ?? '#ffffff'}
                onChange={(e) => patchLayout({ background: { mode: 'color', color: e.target.value } })} />
            )}
          </div>
        </div>

        <div className="space-y-2">
          {layout.blocks.map((b, idx) => renderCard(b, [idx], layout.blocks.length))}
          <div className="flex items-center gap-2 pt-1">
            <AddBlockMenu onAdd={addBlock} allowContainers />
            <span className="text-[11px] text-slate-500">{t('blocksHint')}</span>
          </div>
        </div>
      </div>

      {/* Live preview — rendered as a paper sheet on a dark backdrop so it reads
          like the printed page. */}
      <div className="lg:sticky lg:top-4 self-start">
        <h3 className="text-sm font-semibold text-slate-200 mb-2">{t('preview')}</h3>
        <div className="flex justify-center rounded-xl border border-slate-700 bg-slate-950/50 p-4 overflow-auto" style={{ maxHeight: previewHeight + 32 }}>
          <iframe
            ref={previewRef}
            title={t('previewTitle')}
            srcDoc={previewHtml}
            className="bg-white shrink-0 rounded-sm"
            style={{ width: '100%', maxWidth: 460, aspectRatio: '210 / 297', border: 0, boxShadow: '0 8px 30px rgba(0,0,0,0.45)' }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-2">{t('previewHint')}</p>
      </div>
    </div>
  );
}
