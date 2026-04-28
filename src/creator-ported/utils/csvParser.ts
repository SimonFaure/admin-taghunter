export interface CSVRow {
  [key: string]: string;
}

function detectDelimiter(line: string): string {
  // Prefer semicolon if it exists (more specific)
  return line.includes(';') ? ';' : ',';
}

function parseCSVLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      // Escaped quote (double quote "" becomes single quote ")
      current += '"';
      i++; // Skip the next quote
    } else if (char === '"') {
      // Toggle quote state but don't include the quote character
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

export function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.trim().split('\n');
  if (lines.length === 0) return [];

  // Detect delimiter from first line
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCSVLine(lines[0], delimiter);
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i], delimiter);
    const row: CSVRow = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    rows.push(row);
  }

  return rows;
}

export function csvToKeyValue(csvText: string): Record<string, string> {
  const lines = csvText.trim().split('\n');
  const keyValue: Record<string, string> = {};

  if (lines.length === 0) return keyValue;

  // Detect delimiter
  const delimiter = detectDelimiter(lines[0]);

  // Check if this is a game_meta.csv format (4 columns: id, game_id, game_meta, game_meta_value)
  const headerColumns = parseCSVLine(lines[0], delimiter);
  const isGameMetaFormat = headerColumns.length === 4 &&
                           headerColumns[2] === 'game_meta' &&
                           headerColumns[3] === 'game_meta_value';

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const columns = parseCSVLine(lines[i], delimiter);

    if (isGameMetaFormat && columns.length >= 4) {
      // For game_meta.csv: use columns[2] as key and columns[3] as value
      const key = columns[2];
      const value = columns[3];
      if (key) {
        keyValue[key] = value || '';
      }
    } else if (columns.length >= 2) {
      // For simple key-value CSV: use columns[0] as key and columns[1] as value
      const key = columns[0];
      const value = columns[1];
      if (key) {
        keyValue[key] = value || '';
      }
    }
  }

  return keyValue;
}
