/**
 * Product template section — Slice 2B placeholder.
 *
 * Tagquest's existing "use default images / texts" feature pulls from the
 * `default_config` table (see TagquestConfig.tsx:467-527). Lifting that flow
 * needs the shell to expose a `mergeFromDefaultConfig` helper — deferred per
 * the risk #3 in the Stage 2 plan ("keep in body to start; lift to shell only
 * if needed").
 *
 * For Slice 2B we render an inline notice so the capability flag is visible.
 */

import { useScenarioEditor } from '../../../shell/useScenarioEditor';

export function ProductTemplateSection() {
  const editor = useScenarioEditor();
  if (!editor.adapter.capabilities.supportsProductTemplate) return null;

  return (
    <section className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
      <strong>Product template:</strong> the "use default images/texts" toggles
      from the legacy editor are not yet ported. They will return in a
      follow-up; for now create new tagquest scenarios from scratch.
    </section>
  );
}