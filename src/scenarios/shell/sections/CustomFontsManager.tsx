/**
 * Custom-fonts manager — upload author-supplied font files, grouped into
 * families with per-face weight/style.
 *
 * On upload each file's family/weight/style is auto-detected from its metadata
 * (opentype.js); on a parse failure it falls back to filename-derived values —
 * the upload is never blocked. Every field stays editable afterwards.
 *
 * Files upload through the shell's `uploadAsset` into `media/<uniqid>/`, so
 * they sync to the playground alongside every other scenario asset. The
 * registry lives in `game_meta.custom_fonts`.
 *
 * Plan: C:\Users\faure\.claude\plans\studio-custom-fonts-typography.md
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Upload, Trash2, Type, AlertTriangle } from 'lucide-react';
import { useScenarioEditor } from '../useScenarioEditor';
import { parseFontFile } from '../../../fonts/parseFontFile';
import { registerStudioCustomFonts } from '../../../fonts/registerStudioCustomFonts';
import { findCatalogFont } from '../../../fonts/catalog';
import type { CustomFont, CustomFontFace } from '../../../types/scenario-data';

const ACCEPT = '.ttf,.otf,.woff,.woff2';

const WEIGHT_OPTIONS: ReadonlyArray<{ value: number; labelKey: string }> = [
  { value: 100, labelKey: 'customFonts.weight.thin' },
  { value: 200, labelKey: 'customFonts.weight.extraLight' },
  { value: 300, labelKey: 'customFonts.weight.light' },
  { value: 400, labelKey: 'customFonts.weight.regular' },
  { value: 500, labelKey: 'customFonts.weight.medium' },
  { value: 600, labelKey: 'customFonts.weight.semiBold' },
  { value: 700, labelKey: 'customFonts.weight.bold' },
  { value: 800, labelKey: 'customFonts.weight.extraBold' },
  { value: 900, labelKey: 'customFonts.weight.black' },
];

export function CustomFontsManager() {
  const { t } = useTranslation('editorSections3');
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const customFonts: CustomFont[] = Array.isArray(meta.custom_fonts)
    ? (meta.custom_fonts as CustomFont[])
    : [];

  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Keep the uploaded faces registered as FontFaces so the picker preview and
  // the family rows below render in their real typeface.
  useEffect(() => {
    registerStudioCustomFonts(customFonts, editor.getMediaUrl);
  }, [customFonts, editor.getMediaUrl]);

  /**
   * Single-call gameMeta patch on the family at `idx`. Returning `cf: null`
   * removes the family. `font` is threaded through so the delete/rename guard
   * can fix up `game_meta.font` in the SAME update (avoids a stale-state race).
   */
  const patchFamilyAt = (
    idx: number,
    mutate: (cf: CustomFont, font: string) => { cf: CustomFont | null; font: string },
  ) => {
    editor.setGameMeta((m) => {
      const mm = m as Record<string, unknown>;
      const list = [...((mm.custom_fonts as CustomFont[]) ?? [])];
      if (idx < 0 || idx >= list.length) return mm as typeof m;
      const { cf, font } = mutate(list[idx], String(mm.font ?? ''));
      if (cf === null) list.splice(idx, 1);
      else list[idx] = cf;
      return { ...mm, custom_fonts: list, font } as typeof m;
    });
  };

  const renameFamily = (idx: number, newName: string) =>
    patchFamilyAt(idx, (cf, font) => ({
      cf: { ...cf, family: newName },
      font: font === cf.family ? newName : font,
    }));

  const removeFamily = (idx: number) =>
    patchFamilyAt(idx, (cf, font) => ({
      cf: null,
      font: font === cf.family ? '' : font,
    }));

  const updateFace = (idx: number, faceIdx: number, patch: Partial<CustomFontFace>) =>
    patchFamilyAt(idx, (cf, font) => ({
      cf: { ...cf, faces: cf.faces.map((fc, i) => (i === faceIdx ? { ...fc, ...patch } : fc)) },
      font,
    }));

  const removeFace = (idx: number, faceIdx: number) =>
    patchFamilyAt(idx, (cf, font) => {
      const faces = cf.faces.filter((_, i) => i !== faceIdx);
      // A family with no faces left is dropped — and `font` reset if it pointed here.
      return faces.length > 0
        ? { cf: { ...cf, faces }, font }
        : { cf: null, font: font === cf.family ? '' : font };
    });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      // Parse + upload sequentially, accumulating results, THEN apply one
      // gameMeta update — `setGameMeta` reads the render-time state, so a
      // per-file update loop would clobber earlier entries.
      const uploaded: Array<{ family: string; face: CustomFontFace; detected: boolean }> = [];
      let failures = 0;
      for (const file of Array.from(files)) {
        const parsed = await parseFontFile(file);
        try {
          const filename = await editor.uploadAsset('custom_font', file);
          uploaded.push({
            family: parsed.family,
            face: { filename, weight: parsed.weight, style: parsed.style },
            detected: parsed.detected,
          });
        } catch (err) {
          failures += 1;
          console.error('[CustomFontsManager] upload failed', { name: file.name, err });
        }
      }

      if (uploaded.length > 0) {
        editor.setGameMeta((m) => {
          const mm = m as Record<string, unknown>;
          const list: CustomFont[] = [...((mm.custom_fonts as CustomFont[]) ?? [])];
          for (const u of uploaded) {
            const existing = list.findIndex(
              (f) => f.family.toLowerCase() === u.family.toLowerCase(),
            );
            if (existing >= 0) {
              list[existing] = { ...list[existing], faces: [...list[existing].faces, u.face] };
            } else {
              list.push({ family: u.family, faces: [u.face] });
            }
          }
          return { ...mm, custom_fonts: list } as typeof m;
        });
      }

      const fellBack = uploaded.filter((u) => !u.detected).length;
      const parts: string[] = [];
      if (uploaded.length > 0) parts.push(t('customFonts.filesAdded', { count: uploaded.length }));
      if (fellBack > 0) parts.push(t('customFonts.usedFilenameDetection', { count: fellBack }));
      if (parts.length > 0) setNotice(parts.join('; '));
      if (failures > 0) setError(t('customFonts.uploadFailed', { count: failures }));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
          <Type className="w-4 h-4 text-gray-400" />
          {t('customFonts.title')}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50 inline-flex items-center gap-1"
        >
          <Upload className="w-3 h-3" />
          {busy ? t('customFonts.uploading') : t('customFonts.uploadFiles')}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <p className="text-[11px] text-gray-500 mb-2">
        <Trans
          t={t}
          i18nKey="customFonts.hint"
          components={[<code />, <code />, <code />, <code />]}
        />
      </p>

      {error && <div className="text-[11px] text-red-600 mb-2">{error}</div>}
      {notice && <div className="text-[11px] text-amber-700 mb-2">{notice}</div>}

      {customFonts.length === 0 ? (
        <div className="text-[11px] text-gray-400 italic">{t('customFonts.noneYet')}</div>
      ) : (
        <div className="space-y-2">
          {customFonts.map((cf, idx) => {
            const collides = findCatalogFont(cf.family);
            return (
              <div key={idx} className="border border-gray-200 rounded-md bg-white p-2">
                <div className="flex items-center gap-2 mb-1.5">
                  <input
                    type="text"
                    value={cf.family}
                    onChange={(e) => renameFamily(idx, e.target.value)}
                    placeholder={t('customFonts.familyNamePlaceholder')}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm font-medium"
                    style={{ fontFamily: `"${cf.family}", sans-serif` }}
                  />
                  <button
                    type="button"
                    onClick={() => removeFamily(idx)}
                    className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 inline-flex items-center gap-1"
                    aria-label={t('customFonts.removeFamily', { family: cf.family })}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {collides && (
                  <div className="text-[11px] text-amber-700 mb-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {t('customFonts.collision', { family: cf.family })}
                  </div>
                )}

                <div className="space-y-1">
                  {cf.faces.map((face, faceIdx) => (
                    <div key={faceIdx} className="flex items-center gap-2">
                      <select
                        value={face.weight}
                        onChange={(e) =>
                          updateFace(idx, faceIdx, { weight: Number(e.target.value) })
                        }
                        className="px-1.5 py-1 border border-gray-300 rounded text-xs"
                      >
                        {WEIGHT_OPTIONS.map((w) => (
                          <option key={w.value} value={w.value}>
                            {t(w.labelKey)}
                          </option>
                        ))}
                      </select>
                      <select
                        value={face.style}
                        onChange={(e) =>
                          updateFace(idx, faceIdx, {
                            style: e.target.value === 'italic' ? 'italic' : 'normal',
                          })
                        }
                        className="px-1.5 py-1 border border-gray-300 rounded text-xs"
                      >
                        <option value="normal">{t('customFonts.styleNormal')}</option>
                        <option value="italic">{t('customFonts.styleItalic')}</option>
                      </select>
                      <span className="flex-1 text-[11px] text-gray-500 truncate" title={face.filename}>
                        {face.filename}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFace(idx, faceIdx)}
                        className="text-xs p-1 text-red-600 hover:bg-red-50 rounded"
                        aria-label={t('customFonts.removeFace')}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
