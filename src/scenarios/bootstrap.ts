/**
 * Adapter bootstrap — side-effect module that registers every shipped adapter
 * with the registry. Imported once (in App.tsx or the route) so the registry
 * is populated before any scenario lookup runs.
 *
 * Adding a new game type = adding one `registerAdapter(...)` line here.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { registerAdapter } from './registry';
import { tagquestAdapter } from './bodies/tagquest/adapter';
import { mysteryAdapter } from './bodies/mystery/adapter';
import { tracksAdapter } from './bodies/tracks/adapter';
import { clashAdapter } from './bodies/clash/adapter';

registerAdapter(tagquestAdapter as Parameters<typeof registerAdapter>[0]);
registerAdapter(mysteryAdapter as Parameters<typeof registerAdapter>[0]);
registerAdapter(tracksAdapter as Parameters<typeof registerAdapter>[0]);
registerAdapter(clashAdapter as Parameters<typeof registerAdapter>[0]);