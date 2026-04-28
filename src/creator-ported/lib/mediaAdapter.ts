// Media adapter that mimics the subset of Supabase Storage used by the Creator,
// routing calls to /backend/api/media.php on the admin backend. Returned shapes
// match Supabase (`{ data, error }`) so existing call sites don't need to change.

import { authService } from '../services/authService';

const API_BASE_URL   = import.meta.env.VITE_API_BASE_URL   || '/backend/api';
const MEDIA_BASE_URL = import.meta.env.VITE_MEDIA_BASE_URL || '';

type StorageResult<T> = { data: T | null; error: { message: string } | null };

function authHeaders(): Record<string, string> {
  return authService.getAuthHeaders() as Record<string, string>;
}

class MediaBucket {
  // Supabase call: supabase.storage.from('game-media').upload(path, file, opts?)
  async upload(
    path: string,
    file: Blob | File,
    options?: { upsert?: boolean; contentType?: string; cacheControl?: string }
  ): Promise<StorageResult<{ path: string }>> {
    try {
      const formData = new FormData();
      const filename = (file as File).name || path.split('/').pop() || 'file';
      formData.append('file', file, filename);
      formData.append('path', path);
      formData.append('upsert', options?.upsert === false ? 'false' : 'true');

      const response = await fetch(`${API_BASE_URL}/media.php?action=upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.error) {
        return { data: null, error: { message: body.error || `HTTP ${response.status}` } };
      }
      return { data: { path: body.path ?? path }, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e?.message || 'Upload failed' } };
    }
  }

  // Supabase call: supabase.storage.from('game-media').download(path)
  async download(path: string): Promise<StorageResult<Blob>> {
    try {
      const response = await fetch(`${MEDIA_BASE_URL}/media/${path}`, {
        headers: authHeaders(),
      });
      if (!response.ok) {
        return { data: null, error: { message: `HTTP ${response.status}` } };
      }
      return { data: await response.blob(), error: null };
    } catch (e: any) {
      return { data: null, error: { message: e?.message || 'Download failed' } };
    }
  }

  // Supabase call: supabase.storage.from('game-media').remove([paths])
  async remove(paths: string[]): Promise<StorageResult<{ deleted: string[] }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/media.php?action=delete_path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ paths }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.error) {
        return { data: null, error: { message: body.error || `HTTP ${response.status}` } };
      }
      return { data: { deleted: body.deleted ?? [] }, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e?.message || 'Remove failed' } };
    }
  }

  // Supabase call: supabase.storage.from('game-media').list(prefix)
  async list(prefix: string): Promise<StorageResult<Array<{ name: string; size: number; updated_at: string }>>> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/media.php?action=list_folder&path=${encodeURIComponent(prefix)}`,
        { headers: authHeaders() }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.error) {
        return { data: null, error: { message: body.error || `HTTP ${response.status}` } };
      }
      return { data: body.files ?? [], error: null };
    } catch (e: any) {
      return { data: null, error: { message: e?.message || 'List failed' } };
    }
  }

  // Supabase call: supabase.storage.from('game-media').getPublicUrl(path) (synchronous)
  getPublicUrl(path: string): { data: { publicUrl: string } } {
    return { data: { publicUrl: `${MEDIA_BASE_URL}/media/${path}` } };
  }
}

export const mediaStorage = {
  from(_bucket: string) {
    // Bucket name ignored — we have a single /media root on the admin backend.
    return new MediaBucket();
  },
};
