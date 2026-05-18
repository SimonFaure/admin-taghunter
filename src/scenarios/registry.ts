/**
 * Adapter registry — central lookup keyed on `scenarios.game_type`.
 *
 * Bodies register themselves here (e.g. via side-effect import in App.tsx,
 * or by an explicit `registerAdapter()` call). The route uses
 * `getAdapter(scenario.game_type)` to mount the right body.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import type { ScenarioAdapter, ScenarioGameType } from './types';

const adapterRegistry = new Map<ScenarioGameType, ScenarioAdapter>();

export function registerAdapter(adapter: ScenarioAdapter): void {
  adapterRegistry.set(adapter.kind, adapter);
}

export function getAdapter(gameType: string): ScenarioAdapter | undefined {
  return adapterRegistry.get(gameType as ScenarioGameType);
}

export function listRegisteredAdapters(): ScenarioAdapter[] {
  return Array.from(adapterRegistry.values());
}