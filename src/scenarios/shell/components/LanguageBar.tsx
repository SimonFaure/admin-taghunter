/**
 * Wraps the existing LanguageSelector + AddLanguageModal with the shell's state.
 * Pure presentational glue.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useState } from 'react';
import { LanguageSelector, AddLanguageModal } from '../../../creator-ported/components/LanguageSelector';
import { useScenarioEditor } from '../useScenarioEditor';

export function LanguageBar() {
  const editor = useScenarioEditor();
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <>
      <LanguageSelector
        availableLanguages={editor.availableLanguages}
        currentLanguage={editor.currentLanguage}
        onLanguageChange={editor.switchLanguage}
        onAddLanguage={() => setShowAddModal(true)}
        onRemoveLanguage={editor.removeLanguage}
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