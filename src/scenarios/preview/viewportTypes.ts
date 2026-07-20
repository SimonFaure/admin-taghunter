/**
 * Viewport types and default - split from `ViewportSelect.tsx` so the
 * component file exports only the component (Vite fast-refresh constraint).
 */

export interface ViewportSize {
  width: number;
  height: number;
}

export const DEFAULT_VIEWPORT: ViewportSize = { width: 1920, height: 1080 };
