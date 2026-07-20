/**
 * Viewport-size selector for the preview modal header.
 *
 * Plan: C:\Users\faure\.claude\plans\we-need-a-preview-refactored-pretzel.md (decision #6)
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ViewportSize } from './viewportTypes';

interface PresetEntry {
  id: string;
  label: string;
  size: ViewportSize | 'custom';
}

function buildPresets(t: TFunction): PresetEntry[] {
  return [
    { id: '1280x720', label: '1280 × 720', size: { width: 1280, height: 720 } },
    {
      id: '1680x900',
      label: t('scenarioPreview:viewport.legacy', { size: '1680 × 900' }),
      size: { width: 1680, height: 900 },
    },
    { id: '1920x1080', label: '1920 × 1080', size: { width: 1920, height: 1080 } },
    { id: '2560x1440', label: '2560 × 1440', size: { width: 2560, height: 1440 } },
    { id: 'custom', label: t('scenarioPreview:viewport.custom'), size: 'custom' },
  ];
}

interface ViewportSelectProps {
  value: ViewportSize;
  onChange: (next: ViewportSize) => void;
}

function findPresetId(presets: PresetEntry[], value: ViewportSize): string {
  const match = presets.find(
    (p) => p.size !== 'custom' && p.size.width === value.width && p.size.height === value.height,
  );
  return match?.id ?? 'custom';
}

export function ViewportSelect({ value, onChange }: ViewportSelectProps) {
  const { t } = useTranslation();
  const PRESETS = buildPresets(t);
  const currentId = findPresetId(PRESETS, value);
  const isCustom = currentId === 'custom';

  // Local state mirrors the inputs while the user is typing in custom mode;
  // commit on blur / Enter so we don't apply partial values like "192".
  const [draftW, setDraftW] = useState(String(value.width));
  const [draftH, setDraftH] = useState(String(value.height));

  function handlePresetChange(id: string) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    if (preset.size === 'custom') {
      // Switch to custom mode without changing the active size.
      setDraftW(String(value.width));
      setDraftH(String(value.height));
      onChange({ width: value.width, height: value.height });
      return;
    }
    setDraftW(String(preset.size.width));
    setDraftH(String(preset.size.height));
    onChange(preset.size);
  }

  function commitCustom() {
    const w = parseInt(draftW, 10);
    const h = parseInt(draftH, 10);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 320 || h < 240) return;
    onChange({ width: w, height: h });
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-gray-600">{t('scenarioPreview:viewport.label')}</label>
      <select
        value={currentId}
        onChange={(e) => handlePresetChange(e.target.value)}
        className="text-sm px-2 py-1 border border-gray-300 rounded-md bg-white"
      >
        {PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      {isCustom && (
        <div className="flex items-center gap-1 text-xs">
          <input
            type="number"
            min={320}
            value={draftW}
            onChange={(e) => setDraftW(e.target.value)}
            onBlur={commitCustom}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCustom();
            }}
            className="w-20 px-2 py-1 border border-gray-300 rounded-md"
            aria-label={t('scenarioPreview:viewport.customWidth')}
          />
          <span className="text-gray-500">×</span>
          <input
            type="number"
            min={240}
            value={draftH}
            onChange={(e) => setDraftH(e.target.value)}
            onBlur={commitCustom}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCustom();
            }}
            className="w-20 px-2 py-1 border border-gray-300 rounded-md"
            aria-label={t('scenarioPreview:viewport.customHeight')}
          />
        </div>
      )}
    </div>
  );
}
