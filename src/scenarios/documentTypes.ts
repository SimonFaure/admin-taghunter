/**
 * The documents a product scenario must ship with, per game type, and how a
 * scenario file is recognised as one of them.
 *
 * A file's type is `scenario_files.doc_type`: an explicit choice made in the
 * admin scenario details panel, or NULL = automatic, in which case it is
 * recognised from the file NAME here. The explicit choice always wins,
 * including "other". Checklist only - licensees and playgrounds never read it.
 *
 * Decision record: memory project_scenario_overview_mandatory_rules.
 */

export const OTHER_DOC_TYPE = 'other';

export interface DocumentType {
  id: string;
  label: string;
  /** Matched against the file name, lowercased, accents and punctuation removed. */
  pattern: RegExp;
}

const FICHE_MISSION = /fiche\s+(de\s+)?mission/;
const VISUELS_BALISES = /visuels?\s+(des?\s+)?balises?|balises?/;
const PHOTOCALL = /photo\s?call/;

const DOCS: Record<string, DocumentType> = {
  fiche_mission_a4: { id: 'fiche_mission_a4', label: 'Fiche de mission A4', pattern: FICHE_MISSION },
  fiche_mission_a5: { id: 'fiche_mission_a5', label: 'Fiche mission A5', pattern: FICHE_MISSION },
  livret_jeu_a5: { id: 'livret_jeu_a5', label: 'Livret de jeu A5', pattern: /livret/ },
  visuels_balises: { id: 'visuels_balises', label: 'Visuels balises', pattern: VISUELS_BALISES },
  photocall: { id: 'photocall', label: 'Photocall', pattern: PHOTOCALL },
  affiche_a3: { id: 'affiche_a3', label: 'Affiche A3', pattern: /affiche/ },
  roll_up: { id: 'roll_up', label: 'Roll Up', pattern: /roll\s?up|kakemono/ },
};

/** Required documents, in display order. Keyed by `scenarios.game_type`. */
export const REQUIRED_DOCUMENTS: Record<string, readonly DocumentType[]> = {
  tagquest: [DOCS.fiche_mission_a4, DOCS.visuels_balises, DOCS.photocall],
  mystery: [DOCS.livret_jeu_a5, DOCS.visuels_balises, DOCS.photocall],
  tracks: [DOCS.fiche_mission_a5],
  clash: [DOCS.affiche_a3, DOCS.roll_up, DOCS.visuels_balises],
};

export const requiredDocuments = (gameType: string): readonly DocumentType[] =>
  REQUIRED_DOCUMENTS[gameType] ?? [];

const normalize = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** The required document a file NAME points at for this game type, or "other". */
export function detectDocumentType(gameType: string, fileName: string): string {
  const name = normalize(fileName);
  return requiredDocuments(gameType).find((d) => d.pattern.test(name))?.id ?? OTHER_DOC_TYPE;
}

/** A file's effective type: its explicit `doc_type`, else recognised from its name. */
export function resolveDocumentType(gameType: string, fileName: string, docType?: string | null): string {
  return docType || detectDocumentType(gameType, fileName);
}

export function documentTypeLabel(gameType: string, id: string): string {
  return requiredDocuments(gameType).find((d) => d.id === id)?.label ?? 'Other';
}
