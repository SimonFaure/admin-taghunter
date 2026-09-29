/**
 * Wraps the existing LanguageSelector + AddLanguageModal with the shell's state.
 * Pure presentational glue.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useState } from 'react';
import { LanguageSelector, AddLanguageModal } from '../../../creator-ported/components/LanguageSelector';
import { useScenarioEditor } from '../useScenarioEditor';

interface LanguageBarProps {
  /**
   * Languages released to clients (admin view of an admin-owned scenario), or
   * null when the scenario is not gated. Any other language is shown as a
   * draft: stored, but stripped from every client and playground payload
   * until validated in Admin > Translations > Scenarios.
   */
  validatedLanguages?: string[] | null;
}

export function LanguageBar({ validatedLanguages = null }: LanguageBarProps) {
  const editor = useScenarioEditor();
  const [showAddModal, setShowAddModal] = useState(false);

  const draftLanguages = validatedLanguages
    ? editor.availableLanguages.filter(
        (l) => l !== editor.defaultLanguage && !validatedLanguages.includes(l),
      )
    : [];

  return (
    <>
      <LanguageSelector
        availableLanguages={editor.availableLanguages}
        currentLanguage={editor.currentLanguage}
        onLanguageChange={editor.switchLanguage}
        onAddLanguage={() => setShowAddModal(true)}
        onRemoveLanguage={editor.removeLanguage}
        draftLanguages={draftLanguages}
      />
      {showAddModal && (
        <AddLanguageModal
          availableLanguages={editor.availableLanguages}
          onSelect={(lang) => {
            editor.addLanguage(lang);
            setShowAddModal(false);
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  );
}