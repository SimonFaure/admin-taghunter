/**
 * Tag Hunter GO authoring context. Lets section components react to whether the
 * scenario is currently flagged `adaptable_go` without each one reading the full
 * editor state. The shell provides it; outside a provider it defaults to "off"
 * so CollapsibleSection (used only inside the editor today, but defensive) and
 * any future consumer behave normally for non-GO / non-mystery scenarios.
 *
 * Design: memory project_taghunter_go / plans/tag-hunter-go.md (Phase 1).
 */

import { createContext, useContext, type ReactNode } from 'react';

export interface GoEditorValue {
  /** Scenario has the "Adaptable à TGH Go" box checked. */
  adaptableGo: boolean;
  /** On-screen letter options per enigma in GO (2 = A/B, 4 = A/B/C/D). */
  answerCount: 2 | 4;
}

const GoEditorContext = createContext<GoEditorValue>({
  adaptableGo: false,
  answerCount: 2,
});

export function GoEditorProvider({
  value,
  children,
}: {
  value: GoEditorValue;
  children: ReactNode;
}) {
  return <GoEditorContext.Provider value={value}>{children}</GoEditorContext.Provider>;
}

export function useGoEditor(): GoEditorValue {
  return useContext(GoEditorContext);
}
