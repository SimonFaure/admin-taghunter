/**
 * Asset upload - dispatched on slot kind.
 *
 * - image / sound / font: uploaded via `db.storage.from('game-media').upload()`,
 *   stored under `${scenarioUniqid}/${fieldName}_${timestamp}.${ext}`. Returns
 *   bare filename.
 *
 * - video: multipart POST to `scenario_files.php?action=upload_video` which
 *   writes the file to the PHP filesystem at /media/<uniqid>/ (where the
 *   playground sync `scandir` picks it up) and updates `scenarios.medias.video`
 *   with the full /media/<uniqid>/... path. We return only the bare filename
 *   so callers can store it the same way image/sound slot values are stored
 *   and rely on `editor.getMediaUrl(filename)` for preview rendering.
 */

import { db } from '../../../creator-ported/lib/db';
import { extractFileName } from '../../../creator-ported/utils/mediaUrl';
import { secureAuth } from '../../../lib/secureAuth';
import type { MediaSlot } from '../../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export interface AssetUploadContext {
  scenarioUniqid: string;
  fieldName: string;
  slotKind: MediaSlot['kind'];
}

export interface AssetUploadResult {
  ok: boolean;
  filename?: string;
  error?: string;
}

export async function uploadAsset(file: File, ctx: AssetUploadContext): Promise<AssetUploadResult> {
  if (!ctx.scenarioUniqid) {
    return { ok: false, error: 'Cannot upload before scenario is loaded (missing uniqid)' };
  }

  if (ctx.slotKind === 'video') {
    return uploadVideoViaPhp(file, ctx);
  }

  try {
    const fileExt = file.name.split('.').pop() ?? 'bin';
    const fileName = `${ctx.fieldName}_${Date.now()}.${fileExt}`;
    const filePath = `${ctx.scenarioUniqid}/${fileName}`;

    const { error } = await db.storage
      .from('game-media')
      .upload(filePath, file, { cacheControl: '3600', upsert: false });

    if (error) {
      return { ok: false, error: error.message ?? 'Upload failed' };
    }
    return { ok: true, filename: fileName };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Upload failed' };
  }
}

async function uploadVideoViaPhp(file: File, ctx: AssetUploadContext): Promise<AssetUploadResult> {
  try {
    const formData = new FormData();
    formData.append('video', file);
    formData.append('uniqid', ctx.scenarioUniqid);

    const token = secureAuth.getStoredToken();
    const response = await fetch(`${API_BASE_URL}/scenario_files.php?action=upload_video`, {
      method: 'POST',
      credentials: 'include',
      headers: token ? { 'X-Auth-Token': token } : {},
      body: formData,
    });

    const result = (await response.json()) as { success?: boolean; video_url?: string; error?: string };
    if (!response.ok || !result.success || !result.video_url) {
      return { ok: false, error: result.error ?? `Upload failed (HTTP ${response.status})` };
    }

    // Server returns "/media/<uniqid>/scenario_video_<ts>.<ext>"; collapse to
    // bare filename so the shell stores it the same way image/sound slots do.
    return { ok: true, filename: extractFileName(result.video_url) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Upload failed' };
  }
}
