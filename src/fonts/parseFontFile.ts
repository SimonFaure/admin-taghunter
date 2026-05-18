/**
 * Auto-detect a font's family / weight / style from its file.
 *
 * Reads the OpenType `name` + `OS/2` + `head` tables via opentype.js. When the
 * font can't be parsed (corrupt, missing tables, oddly built), falls back to
 * deriving everything from the filename — the upload is NEVER blocked.
 *
 * Studio-only: the playground never parses fonts (it just renders what the
 * scenario's `custom_fonts` registry already records).
 *
 * Plan: C:\Users\faure\.claude\plans\studio-custom-fonts-typography.md
 */

import type { LocalizedName } from 'opentype.js';

// opentype.js (~270 kB) is loaded on demand — only when an author actually
// uploads a custom font — so it stays out of the initial editor bundle.

export interface ParsedFont {
  family: string;
  /** CSS numeric weight, 100–900. */
  weight: number;
  style: 'normal' | 'italic';
  /**
   * `true`  → family/weight/style read from the font's own metadata.
   * `false` → font metadata unreadable; values derived from the filename.
   */
  detected: boolean;
}

/** Named-weight tokens recognised in filenames / subfamily names. */
const WEIGHT_TOKENS: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  book: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

function pickName(rec: LocalizedName | undefined): string {
  if (!rec) return '';
  return (rec.en || rec['0'] || Object.values(rec)[0] || '').trim();
}

/** Derive family/weight/style from a filename like `MyFont-BoldItalic.ttf`. */
function fallbackFromFilename(filename: string): Omit<ParsedFont, 'detected'> {
  const base = filename.replace(/\.[^.]+$/, '');
  let weight = 400;
  let style: 'normal' | 'italic' = 'normal';
  const kept: string[] = [];

  for (const token of base.split(/[-_ ]+/)) {
    const lc = token.toLowerCase();
    if (lc in WEIGHT_TOKENS) {
      weight = WEIGHT_TOKENS[lc];
      continue;
    }
    if (lc === 'italic' || lc === 'oblique') {
      style = 'italic';
      continue;
    }
    kept.push(token);
  }
  const family = kept.join(' ').trim() || base.trim() || 'Custom Font';
  return { family, weight, style };
}

export async function parseFontFile(file: File): Promise<ParsedFont> {
  try {
    const { parse } = await import('opentype.js');
    const font = parse(await file.arrayBuffer());
    const family =
      pickName(font.names?.fontFamily) || pickName(font.names?.fullName);

    const os2 = font.tables?.os2 ?? {};
    const head = font.tables?.head ?? {};
    const subfamily = pickName(font.names?.fontSubfamily).toLowerCase();

    // Weight: prefer OS/2.usWeightClass; nudge from the subfamily name when
    // the table looks like an un-set default but the name says otherwise.
    let weight =
      typeof os2.usWeightClass === 'number' && os2.usWeightClass >= 100
        ? os2.usWeightClass
        : 400;
    for (const [token, value] of Object.entries(WEIGHT_TOKENS)) {
      if (subfamily.includes(token) && weight === 400 && value !== 400) {
        weight = value;
        break;
      }
    }

    // Italic: OS/2.fsSelection bit 0, or head.macStyle bit 1, or the name.
    const italic =
      (typeof os2.fsSelection === 'number' && (os2.fsSelection & 0x01) !== 0) ||
      (typeof head.macStyle === 'number' && (head.macStyle & 0x02) !== 0) ||
      subfamily.includes('italic') ||
      subfamily.includes('oblique');

    if (family) {
      return { family, weight, style: italic ? 'italic' : 'normal', detected: true };
    }
  } catch (err) {
    console.warn('[parseFontFile] metadata parse failed; using filename', {
      name: file.name,
      err,
    });
  }
  return { ...fallbackFromFilename(file.name), detected: false };
}
