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
  /** Scenario has the "Adaptable à Tag Hunter Drop" box checked. */
  adaptableDrop: boolean;
  /**
   * Answer options per enigma - GO's letters (2 = A/B, 4 = A/B/C/D) and Drop's
   * on-screen tiles. Shared by both adaptations (`go_answer_count`).
   */
  answerCount: 2 | 4;
}

const GoEditorContext = createContext<GoEditorValue>({
  adaptableGo: false,
  adaptableDrop: false,
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
