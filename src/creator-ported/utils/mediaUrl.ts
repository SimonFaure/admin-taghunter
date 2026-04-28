const MEDIA_BASE_URL = import.meta.env.VITE_MEDIA_BASE_URL || '';

export function getMediaUrl(scenarioId: string | number, fileName: string): string {
  if (!fileName) return '';

  if (fileName.startsWith('http') || fileName.startsWith('data:')) {
    return fileName;
  }

  return `${MEDIA_BASE_URL}/media/${scenarioId}/${fileName}`;
}

export function extractFileName(url: string): string {
  if (!url) return '';
  // Preserve full URLs (data URIs, http/https URLs)
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  const parts = url.split('/');
  return parts[parts.length - 1];
}
