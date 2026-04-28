// @ts-nocheck — ported from creator; retype in Phase 5. See memory: studio merge tech debt.
import JSZip from 'jszip';

export interface ValidationResult {
  success: boolean;
  message?: string;
  slug?: string;
  gameType?: string;
  games?: Array<{slug: string, type: string}>;
}

export async function validateAndExtractZip(file: File): Promise<ValidationResult> {
  try {
    const zip = await JSZip.loadAsync(file);
    const fileList = Object.keys(zip.files);

    console.log('Files in ZIP:', fileList);

    let mainExportFile = zip.files['main_export_file.csv'];
    if (!mainExportFile) {
      const mainExportPath = fileList.find(f => f.endsWith('main_export_file.csv'));
      if (mainExportPath) {
        mainExportFile = zip.files[mainExportPath];
      }
    }

    if (!mainExportFile) {
      return {
        success: false,
        message: 'main_export_file.csv not found in ZIP. This file is required to identify games to import.'
      };
    }

    const mainExportContent = await mainExportFile.async('text');
    const lines = mainExportContent.trim().split('\n');

    if (lines.length < 2) {
      return {
        success: false,
        message: 'main_export_file.csv is empty or invalid.'
      };
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const typeIndex = headers.indexOf('type');
    const slugIndex = headers.indexOf('slug');

    if (typeIndex === -1 || slugIndex === -1) {
      return {
        success: false,
        message: 'main_export_file.csv must contain "type" and "slug" columns.'
      };
    }

    const gamesToImport: Array<{slug: string, type: string}> = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const type = values[typeIndex];
      const slug = values[slugIndex];

      if (type === 'game' && slug) {
        const gameType = await detectGameType(zip, slug, fileList);
        if (gameType) {
          gamesToImport.push({ slug, type: gameType });
        }
      }
    }

    if (gamesToImport.length === 0) {
      return {
        success: false,
        message: 'No valid games found in main_export_file.csv with type="game".'
      };
    }

    for (const game of gamesToImport) {
      const validation = await validateGameStructure(zip, game.slug, game.type, fileList);
      if (!validation.success) {
        return validation;
      }
    }

    for (const game of gamesToImport) {
      await saveGameToDataFolder(zip, game.slug, fileList);
    }

    return {
      success: true,
      slug: gamesToImport[0].slug,
      gameType: gamesToImport[0].type,
      games: gamesToImport
    };
  } catch (error) {
    return {
      success: false,
      message: `Error processing ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

async function detectGameType(zip: JSZip, slug: string, fileList: string[]): Promise<string | null> {
  const possiblePaths = [
    `games/${slug}/csv/game.csv`,
    `games/${slug}/game.csv`,
    `${slug}/csv/game.csv`,
    `${slug}/game.csv`
  ];

  let gameCsvFile = null;
  for (const path of possiblePaths) {
    if (zip.files[path]) {
      gameCsvFile = zip.files[path];
      break;
    }
  }

  if (!gameCsvFile) {
    const gameCsvPath = fileList.find(f =>
      f.includes(`games/${slug}`) && f.endsWith('game.csv')
    );
    if (gameCsvPath) {
      gameCsvFile = zip.files[gameCsvPath];
    }
  }

  if (!gameCsvFile) {
    console.warn(`game.csv not found for slug: ${slug}`);
    return null;
  }

  try {
    const gameCsvContent = await gameCsvFile.async('text');
    const lines = gameCsvContent.trim().split('\n');

    if (lines.length < 2) {
      return null;
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const values = lines[1].split(',').map(v => v.trim());
    const typeIndex = headers.indexOf('type');

    if (typeIndex !== -1) {
      return values[typeIndex] || null;
    }
  } catch (error) {
    console.error(`Error reading game.csv for ${slug}:`, error);
  }

  return null;
}

async function validateGameStructure(
  zip: JSZip,
  slug: string,
  gameType: string,
  fileList: string[]
): Promise<ValidationResult> {
  const gameFolder = `games/${slug}`;

  const hasGameFolder = fileList.some(f => f.startsWith(gameFolder) || f.startsWith(`${slug}/`));
  if (!hasGameFolder) {
    return {
      success: false,
      message: `Game folder not found: ${gameFolder}`
    };
  }

  const hasCsvFolder = fileList.some(f =>
    f.includes(`${gameFolder}/csv/`) || f.includes(`${slug}/csv/`)
  );
  const hasMediaFolder = fileList.some(f =>
    f.includes(`${gameFolder}/media/`) || f.includes(`${slug}/media/`)
  );

  if (!hasCsvFolder || !hasMediaFolder) {
    return {
      success: false,
      message: `Invalid folder structure for game "${slug}". Must contain "csv" and "media" folders.`
    };
  }

  let requiredFiles: string[] = [];

  if (gameType === 'mystery') {
    requiredFiles = [
      'game.csv',
      'game_enigmas.csv',
      'game_media_images.csv',
      'game_meta.csv',
      'game_sounds.csv',
      'game_user_meta.csv'
    ];
  } else if (gameType === 'tagquest') {
    requiredFiles = [
      'game.csv',
      'game_media_images.csv',
      'game_meta.csv',
      'game_images.csv',
      'game_images_balises.csv',
      'game_images_divisions.csv',
      'game_sounds.csv'
    ];
  }

  for (const requiredFileName of requiredFiles) {
    const found = fileList.some(f =>
      (f.includes(`${gameFolder}/csv/${requiredFileName}`) ||
       f.includes(`${slug}/csv/${requiredFileName}`))
    );
    if (!found) {
      return {
        success: false,
        message: `Missing required file for ${gameType} game "${slug}": ${requiredFileName}`
      };
    }
  }

  return { success: true };
}

async function saveGameToDataFolder(zip: JSZip, slug: string, fileList: string[]): Promise<void> {
  const isElectron = typeof window !== 'undefined' && (window as any).electron?.isElectron;

  if (isElectron) {
    const gamePrefix = `games/${slug}/`;
    const altPrefix = `${slug}/`;

    for (const [fullPath, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue;

      let relativePath = '';
      if (fullPath.startsWith(gamePrefix)) {
        relativePath = fullPath.substring(gamePrefix.length);
      } else if (fullPath.startsWith(altPrefix)) {
        relativePath = fullPath.substring(altPrefix.length);
      } else {
        continue;
      }

      if (!relativePath) continue;

      const isBinary = relativePath.match(/\.(png|jpg|jpeg|gif|mp3|wav|ogg|mp4|webp)$/i);
      const content = isBinary
        ? await zipEntry.async('base64')
        : await zipEntry.async('text');

      await (window as any).electron.games.writeFile(slug, relativePath, content, isBinary);
    }
  } else {
    throw new Error('File system access not available. This feature requires the Electron app.');
  }
}
