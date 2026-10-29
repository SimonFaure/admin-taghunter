// Excel helpers for the cards registry: the downloadable import template, and
// converting a filled-in .xlsx/.xls back to the CSV that cards.php?action=import_csv expects.

/** Column headers the backend requires (cards.php parseCardsCsvFile). Never translate these. */
export const CARDS_IMPORT_HEADERS = ['key_name', 'color', 'key_number', 'id'] as const;
export type CardsImportHeader = (typeof CARDS_IMPORT_HEADERS)[number];

/**
 * Example card written on the template's 2nd line. Its chip ID + key number are fixed so the
 * Excel import can recognise and drop it if the licensee forgets to delete it.
 */
export const MOCK_CARD = { key_number: 1, id: 1234567 } as const;

export interface CardsTemplateLabels {
  fileName: string;
  cardsSheet: string;
  instructionsSheet: string;
  /** Localized name/color of the example card. */
  mockName: string;
  mockColor: string;
  /** Header row of the instructions table: column, description, required, example. */
  tableHeader: [string, string, string, string];
  /** Per column: description, required (Yes/No). */
  columns: Record<CardsImportHeader, { description: string; required: string }>;
  /** Free-text notes listed below the table. */
  notes: string[];
}

export function mockCardValues(mockName: string, mockColor: string): Record<CardsImportHeader, string | number> {
  return { key_name: mockName, color: mockColor, key_number: MOCK_CARD.key_number, id: MOCK_CARD.id };
}

export async function downloadCardsTemplate(labels: CardsTemplateLabels) {
  const XLSX = await import('xlsx');
  const mock = mockCardValues(labels.mockName, labels.mockColor);

  // Data sheet first: the import reads the first sheet holding the headers.
  const cardsWs = XLSX.utils.aoa_to_sheet([
    [...CARDS_IMPORT_HEADERS],
    CARDS_IMPORT_HEADERS.map((h) => mock[h]),
  ]);
  cardsWs['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];

  const instructions: (string | number)[][] = [
    labels.tableHeader,
    ...CARDS_IMPORT_HEADERS.map((h) => [
      h,
      labels.columns[h].description,
      labels.columns[h].required,
      mock[h],
    ]),
    [],
    ...labels.notes.map((n) => [n]),
  ];
  const helpWs = XLSX.utils.aoa_to_sheet(instructions);
  helpWs['!cols'] = [{ wch: 14 }, { wch: 70 }, { wch: 12 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, cardsWs, labels.cardsSheet.slice(0, 31));
  XLSX.utils.book_append_sheet(wb, helpWs, labels.instructionsSheet.slice(0, 31));

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = labels.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function isExcelFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.xlsx') || name.endsWith('.xls');
}

/**
 * Turn an .xlsx/.xls into a comma-separated CSV File the existing import endpoint accepts.
 * Picks the first sheet whose header row contains "key_name" (falls back to the first sheet)
 * and drops the template's example card line.
 */
export async function excelToCardsCsvFile(file: File): Promise<File> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });

  const toRows = (name: string) =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      raw: true,
      defval: '',
      blankrows: false,
    });
  const headerCells = (rows: unknown[][]) => (rows[0] ?? []).map((c) => String(c ?? '').trim());

  const sheetName =
    wb.SheetNames.find((n) => headerCells(toRows(n)).includes('key_name')) ?? wb.SheetNames[0];
  if (!sheetName) throw new Error('Empty workbook');

  const rows = toRows(sheetName);
  const headers = headerCells(rows);
  const idCol = headers.indexOf('id');
  const keyCol = headers.indexOf('key_number');
  const isMock = (r: unknown[]) =>
    idCol >= 0 &&
    keyCol >= 0 &&
    String(r[idCol] ?? '').trim() === String(MOCK_CARD.id) &&
    String(r[keyCol] ?? '').trim() === String(MOCK_CARD.key_number);
  const kept = [rows[0] ?? [], ...rows.slice(1).filter((r) => !isMock(r))];

  // rawNumbers: keep chip IDs as plain digits even if Excel shows thousands separators.
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(kept), {
    FS: ',',
    RS: '\n',
    blankrows: false,
    rawNumbers: true,
  });
  const base = file.name.replace(/\.(xlsx|xls)$/i, '');
  return new File([csv], `${base}.csv`, { type: 'text/csv' });
}
