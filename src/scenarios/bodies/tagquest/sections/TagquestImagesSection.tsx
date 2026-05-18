/**
 * Tagquest images section.
 *
 * The HUD is rendered as a single transparent template PNG overlaying the
 * background. By default we ship a built-in template; the author can opt
 * into a custom upload. Text positions are baked into the layout JSON and
 * stay the same regardless of which template is used — custom templates
 * must be 16:9 with the same frame coordinates as the default (offer the
 * default as a downloadable spec).
 *
 * The only per-scenario images that remain are the malus / late-malus icons.
 */

import { useState } from 'react';
import { Download } from 'lucide-react';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { tagquestMediaSlots } from '../mediaSlots';

const PRIMARY_KEYS = ['malus_image', 'late_malus_image'] as const;
const CUSTOM_TEMPLATE_KEY = 'custom_template';
const DEFAULT_TEMPLATE_URL = '/default_templates/tagquest_template.png';
const ASPECT_TOLERANCE = 0.01;          // 1%
const TARGET_ASPECT = 16 / 9;
const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024; // 5 MB

async function validateCustomTemplate(file: File): Promise<string | null> {
  if (file.size > MAX_TEMPLATE_BYTES) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`;
  }
  if (file.type !== 'image/png' && !/\.png$/i.test(file.name)) {
    return 'Template must be a PNG (with transparent background).';
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image.'));
      el.src = url;
    });

    const aspect = img.naturalWidth / img.naturalHeight;
    if (Math.abs(aspect - TARGET_ASPECT) / TARGET_ASPECT > ASPECT_TOLERANCE) {
      return `Template must be 16:9 (got ${img.naturalWidth}×${img.naturalHeight}, ratio ${aspect.toFixed(3)}).`;
    }

    // Probe alpha by sampling all four corners of the image.
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null; // Cannot probe; allow upload.
    ctx.drawImage(img, 0, 0);
    const corners: Array<[number, number]> = [
      [0, 0],
      [canvas.width - 1, 0],
      [0, canvas.height - 1],
      [canvas.width - 1, canvas.height - 1],
    ];
    const opaqueCorners = corners.filter(([x, y]) => {
      const data = ctx.getImageData(x, y, 1, 1).data;
      return data[3] >= 250; // alpha ~fully opaque
    });
    if (opaqueCorners.length === 4) {
      return 'Template must have a transparent background (all four corners look opaque).';
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function TagquestImagesSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const imageSlots = tagquestMediaSlots.filter((s) => s.kind === 'image');
  const primarySlots = PRIMARY_KEYS
    .map((key) => imageSlots.find((s) => s.key === key))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const customTemplateSlot = imageSlots.find((s) => s.key === CUSTOM_TEMPLATE_KEY);

  // Default to true when missing (i.e. on existing scenarios that never had
  // this flag) so authors stay on the built-in template until they opt out.
  const useDefault = meta.use_default_template === undefined
    ? true
    : Boolean(meta.use_default_template);

  const setKey = (key: string, value: unknown) =>
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [key]: value }) as typeof m);

  const onDownloadDefault = async () => {
    try {
      setDownloadError(null);
      const resp = await fetch(DEFAULT_TEMPLATE_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tagquest_default_template.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  return (
    <CollapsibleSection title="Tagquest images">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {primarySlots.map((slot) => (
          <AssetUploadField
            key={slot.key}
            slot={slot}
            value={String(meta[slot.key] ?? '')}
            onChange={(filename) => setKey(slot.key, filename)}
          />
        ))}
      </div>

      <label className="mt-4 flex items-center gap-2 select-none cursor-pointer">
        <input
          type="checkbox"
          checked={useDefault}
          onChange={(e) => setKey('use_default_template', e.target.checked)}
          className="rounded border-gray-300"
        />
        <span className="text-sm font-medium text-gray-700">Use default template</span>
      </label>

      <div className="mt-2">
        <button
          type="button"
          onClick={onDownloadDefault}
          className="text-xs px-2 py-1 bg-gray-50 text-gray-700 rounded hover:bg-gray-100 inline-flex items-center gap-1 border border-gray-200"
        >
          <Download className="w-3 h-3" />
          Download default template (use as a spec for custom artwork)
        </button>
        {downloadError && (
          <div className="text-[11px] text-red-600 mt-1">{downloadError}</div>
        )}
      </div>

      {!useDefault && customTemplateSlot && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          <AssetUploadField
            slot={customTemplateSlot}
            value={String(meta[customTemplateSlot.key] ?? '')}
            onChange={(filename) => setKey(customTemplateSlot.key, filename)}
            validate={validateCustomTemplate}
          />
          <p className="text-[11px] text-gray-500 leading-snug">
            Custom template must be a 16:9 PNG with a transparent background.
            Text positions (timer, score, malus, combo, quest list) stay fixed —
            align your artwork to the downloadable default template.
          </p>
        </div>
      )}
    </CollapsibleSection>
  );
}
