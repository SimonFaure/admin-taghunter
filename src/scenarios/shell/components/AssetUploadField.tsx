/**
 * Slot-driven asset upload field — image OR sound, declared by a MediaSlot.
 * Replaces the hardcoded per-field upload JSX in MysteryConfig/TagquestConfig.
 *
 * Slice 2A: presentational scaffold. The hosting shell wires up uploadAsset()
 * via context; actual transport implementation lands in Slice 2B.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useRef, useState } from 'react';
import { Upload, Trash2, Image as ImageIcon, Music, Film } from 'lucide-react';
import type { MediaSlot } from '../../types';
import { useScenarioEditor } from '../useScenarioEditor';

interface AssetUploadFieldProps {
  slot: MediaSlot;
  value: string;
  onChange: (filename: string) => void;
  /**
   * Optional client-side validator run before upload. Return a non-null
   * string to reject the file with that error message; return null to allow.
   */
  validate?: (file: File) => Promise<string | null> | string | null;
  /**
   * Visual size of the image/video preview. `sm` = 80px (compact grid),
   * `md` = 160px (default sidebar usage), `lg` = 256px (per-row editors
   * like enigmas / overscores where the preview is the focal point).
   */
  previewSize?: 'sm' | 'md' | 'lg';
}

const PREVIEW_HEIGHT_CLASS = {
  sm: 'max-h-20',
  md: 'max-h-40',
  lg: 'max-h-64',
} as const;

function fileMatchesAccept(file: File, accept: string): boolean {
  if (!accept) return true;
  const tokens = accept.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return tokens.some((tok) => {
    if (tok.startsWith('.')) return name.endsWith(tok);
    if (tok.endsWith('/*')) return type.startsWith(tok.slice(0, -1));
    return type === tok;
  });
}

export function AssetUploadField({ slot, value, onChange, validate, previewSize = 'sm' }: AssetUploadFieldProps) {
  const editor = useScenarioEditor();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  const accept =
    slot.acceptMime?.join(',') ??
    (slot.kind === 'image'
      ? 'image/*'
      : slot.kind === 'sound'
        ? 'audio/*'
        : slot.kind === 'video'
          ? 'video/*'
          : '');

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setDropError(null);
    if (validate) {
      const err = await validate(file);
      if (err) {
        setDropError(err);
        return;
      }
    }
    setUploading(true);
    try {
      const filename = await editor.uploadAsset(slot.key, file);
      onChange(filename);
    } catch (err) {
      console.error('[AssetUploadField] upload failed', { slot: slot.key, err });
    } finally {
      setUploading(false);
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) setDragActive(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = uploading ? 'none' : 'copy';
    if (!uploading && !dragActive) setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (uploading) return;
    setDropError(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!fileMatchesAccept(file, accept)) {
      setDropError(`File type not accepted (${slot.kind === 'image' ? 'image' : slot.kind === 'sound' ? 'audio' : slot.kind === 'video' ? 'video' : 'asset'} required)`);
      return;
    }
    handleFile(file);
  };

  const Icon = slot.kind === 'sound' ? Music : slot.kind === 'video' ? Film : ImageIcon;

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`border rounded-lg p-3 bg-white transition-colors ${
        dragActive
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
          : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
            <Icon className="w-4 h-4 text-gray-400" />
            {slot.label}
            {slot.required === 'error' && <span className="text-red-500" title="Required">*</span>}
          </div>
          {value && <div className="text-xs text-gray-500 mt-0.5 truncate">{value}</div>}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Upload className="w-3 h-3" />
            {uploading ? '...' : value ? 'Replace' : 'Upload'}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 inline-flex items-center gap-1"
              aria-label="Clear"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      {slot.kind === 'image' && value && (
        <img
          src={editor.getMediaUrl(value)}
          alt={slot.label}
          className={`${PREVIEW_HEIGHT_CLASS[previewSize]} rounded border border-gray-100`}
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
        />
      )}
      {slot.kind === 'sound' && value && (
        <audio src={editor.getMediaUrl(value)} controls className="w-full h-8" />
      )}
      {slot.kind === 'video' && value && (
        <video
          src={editor.getMediaUrl(value)}
          controls
          className={`w-full ${PREVIEW_HEIGHT_CLASS[previewSize]} rounded border border-gray-100`}
        />
      )}
      {!value && (
        <div className="text-[11px] text-gray-400 italic mt-1">
          Drag &amp; drop a {slot.kind === 'image' ? 'image' : slot.kind === 'sound' ? 'sound' : slot.kind === 'video' ? 'video' : 'file'} here, or click Upload.
        </div>
      )}
      {dropError && (
        <div className="text-[11px] text-red-600 mt-1">{dropError}</div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}