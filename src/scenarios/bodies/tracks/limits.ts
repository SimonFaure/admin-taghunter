/**
 * Tracks authoring limits.
 *
 * Kept in its own leaf module so both the editor section and
 * `creator-ported/utils/publishValidation.ts` can read it without pulling in
 * the adapter (which itself imports publishValidation).
 */

/**
 * Hard cap on checkpoints per Track scenario (retours point 48). The editor
 * refuses to add past it and publish validation errors above it; nothing is
 * truncated silently, so a legacy course over the cap keeps its data until the
 * author trims it. Same intent as `TAGQUEST_MAX_QUESTS` in Quest.
 */
export const TRACKS_MAX_CHECKPOINTS = 24;
