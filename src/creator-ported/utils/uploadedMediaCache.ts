// Per-scenario cache of filenames already uploaded to the admin media endpoint.
// Lives in localStorage — purely an optimisation to avoid re-uploading unchanged
// files during a publish. Loss on logout or browser clear is acceptable.

const KEY_PREFIX = 'taghunter_uploaded_media:';

const storageKey = (scenarioId: string | number) => `${KEY_PREFIX}${scenarioId}`;

export function getUploadedFilenames(scenarioId: string | number): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(scenarioId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function markUploaded(scenarioId: string | number, fileName: string): void {
  try {
    const existing = getUploadedFilenames(scenarioId);
    if (existing.has(fileName)) return;
    existing.add(fileName);
    localStorage.setItem(storageKey(scenarioId), JSON.stringify([...existing]));
  } catch {
    // ignore storage errors — cache is best-effort
  }
}

export function clearUploadedCache(scenarioId: string | number): void {
  try {
    localStorage.removeItem(storageKey(scenarioId));
  } catch {
    // ignore
  }
}
