// @ts-nocheck — ported from creator; retype in Phase 5. See memory: studio merge tech debt.
import { useState, useRef } from 'react';
import { Upload, FileArchive, CheckCircle, XCircle, Loader2, ArrowLeft, FolderTree } from 'lucide-react';
import JSZip from 'jszip';
import { supabase } from '../lib/db';
import { parseCSV, csvToKeyValue } from '../utils/csvParser';

interface ZipImportProps {
  onBack: () => void;
  onSuccess: (scenarioId: string) => void;
}

interface ImportLog {
  type: 'info' | 'success' | 'error' | 'warning' | 'structure';
  message: string;
  timestamp: Date;
}

interface GameToImport {
  slug: string;
  type: string;
}

export function ZipImport({ onBack, onSuccess }: ZipImportProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [progress, setProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const importLogIdRef = useRef<string | null>(null);
  const logsRef = useRef<ImportLog[]>([]);

  const addLog = async (type: ImportLog['type'], message: string) => {
    const newLog = { type, message, timestamp: new Date() };
    logsRef.current = [...logsRef.current, newLog];
    setLogs(logsRef.current);

    if (importLogIdRef.current) {
      const { error } = await supabase
        .from('import_logs')
        .update({ logs: logsRef.current })
        .eq('id', importLogIdRef.current);

      if (error) {
        console.error('Failed to save log to database:', error);
      }
    }

    console.log(`[${type.toUpperCase()}]`, message);
  };

  const sanitizeFileName = (fileName: string): string => {
    return fileName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_');
  };

  const getMimeType = (fileName: string): string => {
    const extension = fileName.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'mp4': 'video/mp4'
    };
    return mimeTypes[extension || ''] || 'application/octet-stream';
  };

  const buildFolderStructure = (files: string[]): string => {
    const tree: Record<string, any> = {};

    files.forEach(path => {
      if (path.endsWith('/')) return;

      const parts = path.split('/');
      let current = tree;

      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          if (!current._files) current._files = [];
          current._files.push(part);
        } else {
          if (!current[part]) current[part] = {};
          current = current[part];
        }
      });
    });

    const renderTree = (node: any, prefix: string = '', isLast: boolean = true): string[] => {
      const lines: string[] = [];
      const entries = Object.entries(node).filter(([key]) => key !== '_files');
      const files = node._files || [];

      entries.forEach(([name, subNode], index) => {
        const isLastEntry = index === entries.length - 1 && files.length === 0;
        const connector = isLastEntry ? '└── ' : '├── ';
        const extension = isLastEntry ? '    ' : '│   ';

        lines.push(`${prefix}${connector}${name}/`);
        lines.push(...renderTree(subNode, prefix + extension, isLastEntry));
      });

      files.forEach((file: string, index: number) => {
        const isLastFile = index === files.length - 1;
        const connector = isLastFile ? '└── ' : '├── ';
        lines.push(`${prefix}${connector}${file}`);
      });

      return lines;
    };

    const rootEntries = Object.entries(tree).filter(([key]) => key !== '_files');
    const rootFiles = tree._files || [];
    const structure: string[] = [];

    rootEntries.forEach(([name, subNode], index) => {
      const isLast = index === rootEntries.length - 1 && rootFiles.length === 0;
      const connector = isLast ? '└── ' : '├── ';
      const extension = isLast ? '    ' : '│   ';

      structure.push(`${connector}${name}/`);
      structure.push(...renderTree(subNode, extension, isLast));
    });

    rootFiles.forEach((file: string, index: number) => {
      const isLast = index === rootFiles.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      structure.push(`${connector}${file}`);
    });

    return structure.join('\n');
  };

  const findGameFile = (zip: JSZip, slug: string, fileName: string): any => {
    // Normalize path separators - try both forward slash and backslash
    const possiblePaths = [
      `games/${slug}/csv/${fileName}`,
      `${slug}/csv/${fileName}`,
      `games/${slug}/${fileName}`,
      `${slug}/${fileName}`,
      // Windows-style paths
      `games\\${slug}\\csv\\${fileName}`,
      `${slug}\\csv\\${fileName}`,
      `games\\${slug}\\${fileName}`,
      `${slug}\\${fileName}`
    ];

    addLog('info', `Searching for ${fileName} with slug: ${slug}`);

    for (const path of possiblePaths) {
      if (zip.files[path]) {
        addLog('success', `Found ${fileName} at: ${path}`);
        return zip.files[path];
      }
    }

    // Try fuzzy matching with normalized paths
    const allPaths = Object.keys(zip.files);

    // Normalize paths for comparison (convert all to forward slashes)
    const normalizedPaths = allPaths.map(p => ({
      original: p,
      normalized: p.replace(/\\/g, '/')
    }));

    // Log potential matches
    const slugPaths = normalizedPaths.filter(({ normalized }) =>
      normalized.toLowerCase().includes(slug.toLowerCase()) &&
      normalized.includes(fileName)
    );

    if (slugPaths.length > 0) {
      addLog('info', `Potential matches for "${slug}/${fileName}":\n${slugPaths.map(p => p.original).join('\n')}`);
    }

    // Find with normalized path comparison
    const foundPath = normalizedPaths.find(({ normalized }) =>
      normalized.includes(`${slug}`) &&
      (normalized.endsWith(`/${fileName}`) || normalized.endsWith(`\\${fileName}`))
    );

    if (foundPath) {
      addLog('success', `Found ${fileName} via fuzzy match at: ${foundPath.original}`);
      return zip.files[foundPath.original];
    }

    addLog('warning', `Could not find ${fileName} for slug: ${slug}`);
    return null;
  };

  const findFileInIdFolder = (zip: JSZip, slug: string, folderId: string): { file: any | null, searchedPaths: string[] } => {
    const allPaths = Object.keys(zip.files);
    const normalizedPaths = allPaths.map(p => ({
      original: p,
      normalized: p.replace(/\\/g, '/')
    }));

    // Look for files in folders matching the ID pattern
    // Path structure: games/{slug}/media/{folderId}/{file_name}
    const possiblePatterns = [
      `games/${slug}/media/${folderId}/`,
      `${slug}/media/${folderId}/`,
      `games/${slug}/${folderId}/`,
      `${slug}/${folderId}/`,
      `games\\${slug}\\media\\${folderId}\\`,
      `${slug}\\media\\${folderId}\\`,
      `games\\${slug}\\${folderId}\\`,
      `${slug}\\${folderId}\\`
    ];

    const searchedPaths = possiblePatterns.map(p => p.replace(/\\/g, '/'));

    for (const pattern of possiblePatterns) {
      const normalizedPattern = pattern.replace(/\\/g, '/');
      const matchingFiles = normalizedPaths.filter(({ normalized }) => {
        return normalized.includes(normalizedPattern) &&
               !normalized.endsWith('/') &&
               normalized.split('/').filter(p => p).length > normalizedPattern.split('/').filter(p => p).length;
      });

      if (matchingFiles.length > 0) {
        addLog('success', `Found file in folder ${folderId}: ${matchingFiles[0].original}`);
        return { file: zip.files[matchingFiles[0].original], searchedPaths };
      }
    }

    return { file: null, searchedPaths };
  };

  const processFile = async (file: File) => {
    if (!file) return;

    setIsProcessing(true);
    setLogs([]);
    logsRef.current = [];
    setProgress(0);

    const startTime = Date.now();

    const { data: importLogData, error: logError } = await supabase
      .from('import_logs')
      .insert({
        file_name: file.name,
        status: 'in_progress',
        logs: []
      })
      .select()
      .single();

    if (logError) {
      console.error('Failed to create import log:', logError);
    } else {
      importLogIdRef.current = importLogData.id;
    }

    try {
      addLog('info', `Loading zip file: ${file.name}`);
      addLog('info', `File size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
      const zip = await JSZip.loadAsync(file);
      addLog('success', `Zip file loaded successfully`);

      const allFiles = Object.keys(zip.files);
      addLog('info', `Found ${allFiles.length} files in zip`);

      const structure = buildFolderStructure(allFiles);
      addLog('structure', `ZIP Structure:\n${structure}`);

      setProgress(5);

      let mainExportFile = zip.files['main_export_file.csv'] || zip.files['main_export_file'];
      if (!mainExportFile) {
        const mainExportPath = allFiles.find(f =>
          f.endsWith('main_export_file.csv') || f.endsWith('main_export_file')
        );
        if (mainExportPath) {
          mainExportFile = zip.files[mainExportPath];
        }
      }

      if (!mainExportFile) {
        addLog('error', 'main_export_file not found in ZIP');
        throw new Error('main_export_file not found');
      }

      addLog('info', 'Reading main_export_file');
      const mainExportContent = await mainExportFile.async('text');
      addLog('structure', `Main Export File Content:\n${mainExportContent.trim()}`);

      const mainExportLines = mainExportContent.trim().split('\n');

      if (mainExportLines.length < 2) {
        addLog('error', 'main_export_file is empty');
        throw new Error('main_export_file is empty');
      }

      // Detect delimiter (comma or semicolon)
      const delimiter = mainExportLines[0].includes(';') ? ';' : ',';
      addLog('info', `Detected CSV delimiter: ${delimiter === ';' ? 'semicolon' : 'comma'}`);

      const headers = mainExportLines[0].split(delimiter).map(h => h.trim());
      const typeIndex = headers.indexOf('type');
      const slugIndex = headers.indexOf('slug');

      if (typeIndex === -1 || slugIndex === -1) {
        addLog('error', 'main_export_file must contain "type" and "slug" columns');
        throw new Error('Invalid main_export_file structure');
      }

      const gamesToImport: GameToImport[] = [];

      for (let i = 1; i < mainExportLines.length; i++) {
        const values = mainExportLines[i].split(delimiter).map(v => v.trim());
        const type = values[typeIndex];
        const slug = values[slugIndex];

        addLog('info', `Line ${i}: type="${type}", slug="${slug}"`);

        if (type === 'game' && slug) {
          addLog('info', `Found game to import: ${slug}`);

          const gameCsvFile = findGameFile(zip, slug, 'game.csv');
          if (!gameCsvFile) {
            addLog('warning', `game.csv not found for ${slug}, skipping`);
            continue;
          }

          const gameCsvContent = await gameCsvFile.async('text');
          const gameLines = gameCsvContent.trim().split('\n');

          if (gameLines.length < 2) {
            addLog('warning', `game.csv for ${slug} is empty, skipping`);
            continue;
          }

          // Detect delimiter for game.csv
          const gameDelimiter = gameLines[0].includes(';') ? ';' : ',';
          const gameHeaders = gameLines[0].split(gameDelimiter).map(h => h.trim());
          const gameValues = gameLines[1].split(gameDelimiter).map(v => v.trim());
          const gameTypeIndex = gameHeaders.indexOf('type');
          const gameType = gameTypeIndex !== -1 ? gameValues[gameTypeIndex] : 'mystery';

          gamesToImport.push({ slug, type: gameType });
          addLog('success', `Detected ${gameType} game: ${slug}`);
        }
      }

      if (gamesToImport.length === 0) {
        addLog('error', 'No valid games found in main_export_file');
        throw new Error('No games found');
      }

      addLog('success', `Found ${gamesToImport.length} game(s) to import`);
      setProgress(10);

      for (let gameIndex = 0; gameIndex < gamesToImport.length; gameIndex++) {
        const game = gamesToImport[gameIndex];
        const gameProgress = 10 + (gameIndex / gamesToImport.length) * 80;

        addLog('info', `Processing game ${gameIndex + 1}/${gamesToImport.length}: ${game.slug}`);

        await importGame(zip, game, allFiles, gameProgress);

        setProgress(gameProgress + (80 / gamesToImport.length));
      }

      setProgress(100);
      const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
      addLog('success', `Import completed successfully in ${totalDuration}s!`);

      if (importLogIdRef.current) {
        await supabase
          .from('import_logs')
          .update({
            status: 'success',
            completed_at: new Date().toISOString()
          })
          .eq('id', importLogIdRef.current);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      addLog('error', errorMessage);
      console.error('Import error:', error);

      if (importLogIdRef.current) {
        await supabase
          .from('import_logs')
          .update({
            status: 'failed',
            error_message: errorMessage,
            completed_at: new Date().toISOString()
          })
          .eq('id', importLogIdRef.current);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    if (isProcessing) return;

    const file = event.dataTransfer.files[0];
    if (file && file.name.endsWith('.zip')) {
      await processFile(file);
    }
  };

  const importGame = async (
    zip: JSZip,
    game: GameToImport,
    allFiles: string[],
    baseProgress: number
  ) => {
    try {
      const gameCsvFile = findGameFile(zip, game.slug, 'game.csv');
      if (!gameCsvFile) {
        throw new Error(`game.csv not found for ${game.slug}`);
      }

      const gameCsvText = await gameCsvFile.async('text');
      const gameDataRows = parseCSV(gameCsvText);

      if (gameDataRows.length === 0) {
        throw new Error(`game.csv for ${game.slug} has no data`);
      }

      const gameData = gameDataRows[0];
      const title = gameData.title;
      const uniqid = gameData.uniqid;
      const scenarioType = gameData.origin || 'custom';

      addLog('info', `Title: ${title}, Type: ${game.type}, Uniqid: ${uniqid}`);

      const gameMetaCsvFile = findGameFile(zip, game.slug, 'game_meta.csv');
      if (!gameMetaCsvFile) {
        throw new Error(`game_meta.csv not found for ${game.slug}`);
      }

      const gameMetaCsvText = await gameMetaCsvFile.async('text');
      const gameMetaData = csvToKeyValue(gameMetaCsvText);
      addLog('success', `Parsed ${Object.keys(gameMetaData).length} meta fields`);

      const storyDescription = gameMetaData.scenario || gameMetaData.story || 'Imported game';
      addLog('info', `Story: ${storyDescription.substring(0, 100)}${storyDescription.length > 100 ? '...' : ''}`);

      const enigmas: any[] = [];
      const overscores: any[] = [];
      const quests: any[] = [];
      const mediaIdsToUpload: Set<string> = new Set();
      const soundFieldMappings: Record<string, string> = {};

      if (game.type === 'mystery') {
        const overscoreIndex = 1;
        let index = overscoreIndex;
        while (gameMetaData[`overscore_step_${index}`]) {
          overscores.push({
            overscore_step: index.toString(),
            overscore_score: gameMetaData[`overscore_step_${index}`],
            name_overscore_step: gameMetaData[`name_overscore_step_${index}`] || '',
            image_overscore_step: gameMetaData[`image_overscore_step_${index}`] || ''
          });
          index++;
        }

        const gameEnigmasCsvFile = findGameFile(zip, game.slug, 'game_enigmas.csv');
        if (gameEnigmasCsvFile) {
          const gameEnigmasCsvText = await gameEnigmasCsvFile.async('text');
          const enigmasData = parseCSV(gameEnigmasCsvText);

          enigmasData.forEach((enigma) => {
            enigmas.push({
              number: enigma.number || enigma.enigma_number,
              text: enigma.text || enigma.enigma_text || '',
              good_answer_points: enigma.good_answer_points || '10',
              wrong_answer_points: enigma.wrong_answer_points || '0',
              good_answer_image: enigma.good_answer_image || ''
            });
          });

          addLog('success', `Processed ${enigmas.length} enigmas`);
        }
      }

      if (game.type === 'tagquest') {
        // Try both game_images.csv and game_media_images.csv
        let gameImagesCsvFile = findGameFile(zip, game.slug, 'game_images.csv');
        if (!gameImagesCsvFile) {
          gameImagesCsvFile = findGameFile(zip, game.slug, 'game_media_images.csv');
        }

        if (gameImagesCsvFile) {
          const gameImagesCsvText = await gameImagesCsvFile.async('text');
          const questsData = parseCSV(gameImagesCsvText);

          questsData.forEach((quest) => {
            quests.push({
              main_image: quest.image_id || quest.full_image_id || quest.main_image || '',
              points: quest.image_points || quest.points || quest.point || '0',
              name: quest.image_name || quest.name || quest.title || '',
              sound: '',
              image_1: '',
              image_2: '',
              image_3: '',
              image_4: '',
              quest_index: quest.image_number || quest.number || quest.quest_number || ''
            });
          });

          addLog('success', `Processed ${quests.length} quests from game_images.csv`);
        }

        // Parse game_images_divisions.csv for quest image divisions
        const gameDivisionsCsvFile = findGameFile(zip, game.slug, 'game_images_divisions.csv');
        if (gameDivisionsCsvFile) {
          const gameDivisionsCsvText = await gameDivisionsCsvFile.async('text');
          const divisionsData = parseCSV(gameDivisionsCsvText);

          divisionsData.forEach((division) => {
            const mainImageNumber = division.main_image_number || division.quest_number;
            const imageId = division.image_id;

            // Find quest by quest_index matching main_image_number
            const quest = quests.find(q => q.quest_index === mainImageNumber);
            if (quest && imageId) {
              // Add image to next available slot
              if (!quest.image_1) quest.image_1 = imageId;
              else if (!quest.image_2) quest.image_2 = imageId;
              else if (!quest.image_3) quest.image_3 = imageId;
              else if (!quest.image_4) quest.image_4 = imageId;
            }
          });

          addLog('success', `Processed ${divisionsData.length} image divisions`);
        }

        // Parse game_sounds.csv to add sounds to quests and meta fields
        const gameSoundsCsvFile = findGameFile(zip, game.slug, 'game_sounds.csv');

        if (gameSoundsCsvFile) {
          const gameSoundsCsvText = await gameSoundsCsvFile.async('text');
          const soundsData = parseCSV(gameSoundsCsvText);

          // CSV key to database field mapping
          const soundFieldMap: Record<string, string> = {
            'late_malus': 'late_malus_sound',
            'malus': 'malus_sound',
            'error': 'cheating_sound',
            'success': 'success_sound',
            'top_1': 'top_1_sound',
            'top_3': 'top_3_sound',
            'top_10': 'top_10_sound'
          };

          soundsData.forEach((sound) => {
            const imageNumber = sound.image_number;
            const soundId = sound.sound_id;

            if (!soundId) return;

            // Check if image_number is a numeric quest_index
            if (/^\d+$/.test(imageNumber)) {
              // It's a quest sound
              const quest = quests.find(q => q.quest_index === imageNumber);
              if (quest) {
                quest.sound = soundId;
              }
            } else if (soundFieldMap[imageNumber]) {
              // Map CSV key to database field name
              const dbField = soundFieldMap[imageNumber];
              soundFieldMappings[dbField] = soundId;
              mediaIdsToUpload.add(soundId);
            } else {
              // Other meta field sounds
              mediaIdsToUpload.add(soundId);
            }
          });

          addLog('success', `Processed ${soundsData.length} sounds (including ${Object.keys(soundFieldMappings).length} meta sounds)`);
        }
      }

      const { data: existingScenario } = await supabase
        .from('scenarios')
        .select('id')
        .eq('uniqid', uniqid)
        .maybeSingle();

      const scenarioData = {
        title,
        game_type: game.type === 'survival' ? 'mystery' : game.type,
        slug: game.slug,
        description: storyDescription,
        status: 'draft',
        uniqid,
        scenario_type: scenarioType,
        media: {
          images: {},
          sounds: {},
          videos: {},
          enigmas: [],
          levels: {},
          overscores: [],
          quests: []
        },
        data: {
          game_meta: {
            title,
            scenario: storyDescription,
            scenario_version: gameMetaData.scenario_version || gameMetaData.game_version || '1.0',
            game_public: gameMetaData.game_public || 'kids',
            font: gameMetaData.font || 'Arial',
            font_color: gameMetaData.font_color || '#000000',
            level_font_color: gameMetaData.level_font_color || '#000000',
            gauge_filling: gameMetaData.gauge_filling || '',
            default_time: gameMetaData.default_time || '60',
            default_time_malus: gameMetaData.default_time_malus || '0',
            points_units: gameMetaData.points_units || 'points',
            number_of_enigmas: gameMetaData.number_of_enigmas || enigmas.length.toString(),
            score_full_game: gameMetaData.score_full_game || '100',
            overscore_steps: gameMetaData.overscore_steps || overscores.length.toString(),
            animation_image_duration: gameMetaData.animation_image_duration || '1',
            animation_enigma_duration: gameMetaData.animation_enigma_duration || '1',
            animation_message_duration: gameMetaData.animation_message_duration || '2',
            combo_2_quests: gameMetaData.bonus_images_2 || '',
            combo_4_quests: gameMetaData.bonus_images_4 || '',
            combo_6_quests: gameMetaData.bonus_images_6 || '',
            malus_points: gameMetaData.malus_value || '',
            late_malus_points: gameMetaData.malus_late_value || '',
            custom_fonts: [],
            ...soundFieldMappings,
            overscores,
            enigmas,
            quests,
            levels: gameMetaData.levels ? JSON.parse(gameMetaData.levels) : {}
          }
        }
      };

      let scenario;

      if (existingScenario) {
        addLog('info', `Updating existing scenario (ID: ${existingScenario.id})`);

        const storageKey = existingScenario.uniqid || existingScenario.id;
        const { data: oldFiles } = await supabase.storage
          .from('game-media')
          .list(storageKey);

        if (oldFiles && oldFiles.length > 0) {
          const filesToDelete = oldFiles.map(file => `${storageKey}/${file.name}`);
          await supabase.storage.from('game-media').remove(filesToDelete);
          addLog('success', `Removed ${filesToDelete.length} old media files`);
        }

        const { data: updatedScenario, error: updateError } = await supabase
          .from('scenarios')
          .update(scenarioData)
          .eq('id', existingScenario.id)
          .select()
          .single();

        if (updateError) {
          throw new Error(`Failed to update scenario: ${updateError.message}`);
        }

        scenario = updatedScenario;
        addLog('success', `Scenario updated (ID: ${scenario.id})`);
      } else {
        const { data: newScenario, error: scenarioError } = await supabase
          .from('scenarios')
          .insert(scenarioData)
          .select()
          .single();

        if (scenarioError) {
          throw new Error(`Failed to create scenario: ${scenarioError.message}`);
        }

        scenario = newScenario;
        addLog('success', `Created scenario ID: ${scenario.id}`);
      }

      const mediaMapping: Record<string, string> = {};
      let uploadedCount = 0;
      let mediaFiles: string[] = [];
      const mediaIdToQuestMap: Record<string, string> = {};

      if (game.type === 'tagquest') {
        // Collect all media IDs from game_meta fields
        const tagquestMediaFields = [
          'background_image', 'malus_container', 'malus_image', 'late_malus_image',
          'top_1_image', 'top_3_image', 'top_10_image'
        ];

        tagquestMediaFields.forEach(field => {
          if (gameMetaData[field]) {
            mediaIdsToUpload.add(gameMetaData[field]);
          }
        });

        // Collect media IDs from quests and track which quest/position they belong to
        quests.forEach((quest, index) => {
          const questNum = index + 1;
          if (quest.main_image) {
            mediaIdsToUpload.add(quest.main_image);
            mediaIdToQuestMap[quest.main_image] = `Quest ${questNum} - Main Image`;
          }
          if (quest.image_1) {
            mediaIdsToUpload.add(quest.image_1);
            mediaIdToQuestMap[quest.image_1] = `Quest ${questNum} - Image 1`;
          }
          if (quest.image_2) {
            mediaIdsToUpload.add(quest.image_2);
            mediaIdToQuestMap[quest.image_2] = `Quest ${questNum} - Image 2`;
          }
          if (quest.image_3) {
            mediaIdsToUpload.add(quest.image_3);
            mediaIdToQuestMap[quest.image_3] = `Quest ${questNum} - Image 3`;
          }
          if (quest.image_4) {
            mediaIdsToUpload.add(quest.image_4);
            mediaIdToQuestMap[quest.image_4] = `Quest ${questNum} - Image 4`;
          }
          if (quest.sound) {
            mediaIdsToUpload.add(quest.sound);
            mediaIdToQuestMap[quest.sound] = `Quest ${questNum} - Sound`;
          }
        });

        addLog('info', `Found ${mediaIdsToUpload.size} unique media IDs to import`);
      } else {
        // For Mystery games, use the old method (media folder)
        const gameFolder = `games/${game.slug}/`;
        const gameFolderWin = `games\\${game.slug}\\`;
        const altFolder = `${game.slug}/`;
        const altFolderWin = `${game.slug}\\`;
        mediaFiles = allFiles.filter(path => {
          const normalizedPath = path.replace(/\\/g, '/');
          return (
            (path.startsWith(gameFolder) || path.startsWith(gameFolderWin) ||
             path.startsWith(altFolder) || path.startsWith(altFolderWin)) &&
            (normalizedPath.includes('/media/')) &&
            !path.endsWith('/') && !path.endsWith('\\')
          );
        });

        addLog('info', `Found ${mediaFiles.length} media files`);
      }

      if (game.type === 'tagquest') {
        // Upload files from ID-based folders
        const mediaIdsArray = Array.from(mediaIdsToUpload);
        const totalFiles = mediaIdsArray.length;

        for (let i = 0; i < mediaIdsArray.length; i++) {
          const mediaId = mediaIdsArray[i];
          try {
            const questInfo = mediaIdToQuestMap[mediaId] ? ` (${mediaIdToQuestMap[mediaId]})` : '';
            addLog('info', `Uploading ${uploadedCount + 1}/${totalFiles}: ID ${mediaId}${questInfo}`);

            const result = findFileInIdFolder(zip, game.slug, mediaId);
            if (!result.file) {
              addLog('warning', `No file found in folder for ID: ${mediaId}${questInfo}. Searched paths:\n${result.searchedPaths.join('\n')}`);
              continue;
            }

            const mediaFile = result.file;
            const normalizedPath = mediaFile.name.replace(/\\/g, '/');
            const lastSepIndex = normalizedPath.lastIndexOf('/');
            const fileName = normalizedPath.substring(lastSepIndex + 1);

            const arrayBuffer = await mediaFile.async('arraybuffer');

            if (arrayBuffer.byteLength === 0) {
              addLog('warning', `Skipping empty file: ${fileName}`);
              continue;
            }

            const contentType = getMimeType(fileName);
            const blob = new Blob([arrayBuffer], { type: contentType });
            const sanitizedFileName = sanitizeFileName(fileName);
            const storagePath = `${scenario.uniqid || scenario.id}/${sanitizedFileName}`;

            const { error: uploadError } = await supabase.storage
              .from('game-media')
              .upload(storagePath, blob, {
                contentType,
                upsert: true
              });

            if (!uploadError) {
              mediaMapping[mediaId] = sanitizedFileName;
              uploadedCount++;
              addLog('success', `Uploaded ID ${mediaId}${questInfo}: ${fileName}`);

              // Update progress after each successful upload
              const uploadProgress = baseProgress + ((i + 1) / totalFiles) * 60;
              setProgress(uploadProgress);
            } else {
              addLog('error', `Failed to upload ID ${mediaId}${questInfo}: ${uploadError.message}`);
            }
          } catch (error) {
            addLog('warning', `Failed to upload ID ${mediaId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      } else {
        // Upload files from media folder (Mystery games)
        for (let i = 0; i < mediaFiles.length; i++) {
          const mediaPath = mediaFiles[i];
          const normalizedPath = mediaPath.replace(/\\/g, '/');
          const lastSepIndex = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));
          const fileName = mediaPath.substring(lastSepIndex + 1);

          try {
            addLog('info', `Uploading ${uploadedCount + 1}/${mediaFiles.length}: ${fileName}`);

            const mediaFile = zip.files[mediaPath];
            const arrayBuffer = await mediaFile.async('arraybuffer');

            if (arrayBuffer.byteLength === 0) {
              addLog('warning', `Skipping empty file: ${fileName}`);
              continue;
            }

            const contentType = getMimeType(fileName);
            const blob = new Blob([arrayBuffer], { type: contentType });
            const sanitizedFileName = sanitizeFileName(fileName);
            const storagePath = `${scenario.uniqid || scenario.id}/${sanitizedFileName}`;

            const { error: uploadError } = await supabase.storage
              .from('game-media')
              .upload(storagePath, blob, {
                contentType,
                upsert: true
              });

            if (!uploadError) {
              mediaMapping[fileName] = sanitizedFileName;
              uploadedCount++;
              addLog('success', `Uploaded: ${fileName}`);

              // Update progress after each successful upload
              const uploadProgress = baseProgress + ((i + 1) / mediaFiles.length) * 60;
              setProgress(uploadProgress);
            } else {
              addLog('error', `Failed to upload ${fileName}: ${uploadError.message}`);
            }
          } catch (error) {
            addLog('warning', `Failed to upload ${fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

      const totalExpected = game.type === 'tagquest' ? mediaIdsToUpload.size : mediaFiles.length;
      addLog('success', `Uploaded ${uploadedCount}/${totalExpected} media files`);

      if (game.type !== 'tagquest') {
        addLog('info', `Media mapping created with ${Object.keys(mediaMapping).length} entries`);
      }

      const updatedMedia = {
        images: {},
        sounds: {},
        videos: {},
        enigmas: [],
        levels: {},
        overscores: [],
        quests: []
      };

      overscores.forEach((overscore) => {
        if (overscore.image_overscore_step && mediaMapping[overscore.image_overscore_step]) {
          updatedMedia.overscores.push({
            overscore_step: overscore.overscore_step,
            image_overscore_step: mediaMapping[overscore.image_overscore_step]
          });
        }
      });

      enigmas.forEach((enigma) => {
        if (enigma.good_answer_image && mediaMapping[enigma.good_answer_image]) {
          updatedMedia.enigmas.push({
            enigma_number: enigma.number,
            good_answer_image: mediaMapping[enigma.good_answer_image]
          });
        }
      });

      quests.forEach((quest) => {
        const questMedia: any = {
          quest_index: quest.quest_index
        };

        if (quest.main_image && mediaMapping[quest.main_image]) {
          questMedia.main_image = mediaMapping[quest.main_image];
        }
        if (quest.sound && mediaMapping[quest.sound]) {
          questMedia.sound = mediaMapping[quest.sound];
        }
        if (quest.image_1 && mediaMapping[quest.image_1]) {
          questMedia.image_1 = mediaMapping[quest.image_1];
        }
        if (quest.image_2 && mediaMapping[quest.image_2]) {
          questMedia.image_2 = mediaMapping[quest.image_2];
        }
        if (quest.image_3 && mediaMapping[quest.image_3]) {
          questMedia.image_3 = mediaMapping[quest.image_3];
        }
        if (quest.image_4 && mediaMapping[quest.image_4]) {
          questMedia.image_4 = mediaMapping[quest.image_4];
        }

        // Only add if at least one media file was mapped
        if (Object.keys(questMedia).length > 1) {
          updatedMedia.quests.push(questMedia);
        }
      });

      const imageFields = [
        'game_visual', 'background_image', 'game_instructions_image',
        'game_instructions_button_image', 'game_instructions_button_hover_image',
        'game_refresh_button_image', 'game_refresh_button_hover_image',
        'steps_container_image', 'enigmas_header_image',
        'time_background_image', 'score_background_image',
        'top_1_image', 'top_3_image', 'top_10_image',
        'team_name_background_image', 'levels_gauge_image',
        'levels_gauge_image_with_content', 'levels_gauge_player_icon_image',
        'levels_gauge_level_icon_image', 'malus_container', 'malus_image', 'late_malus_image'
      ];

      imageFields.forEach(field => {
        if (gameMetaData[field] && mediaMapping[gameMetaData[field]]) {
          updatedMedia.images[field] = mediaMapping[gameMetaData[field]];
        }
      });

      const soundFields = [
        'enigma_success', 'enigma_error', 'enigma_no_answer',
        'top_1_sound', 'top_3_sound', 'top_10_sound', 'final_image_sound'
      ];

      soundFields.forEach(field => {
        if (gameMetaData[field]) {
          if (mediaMapping[gameMetaData[field]]) {
            updatedMedia.sounds[field] = mediaMapping[gameMetaData[field]];
            addLog('info', `Mapped sound field ${field}: ${gameMetaData[field]} → ${mediaMapping[gameMetaData[field]]}`);
          } else {
            addLog('warning', `Sound file not found for ${field}: ${gameMetaData[field]}`);
          }
        }
      });

      await supabase
        .from('scenarios')
        .update({
          media: updatedMedia
        })
        .eq('id', scenario.id);

      addLog('success', `Game ${game.slug} imported successfully`);

    } catch (error) {
      addLog('error', `Failed to import ${game.slug}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-slate-800 rounded-xl shadow-lg p-8 border border-slate-700">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FileArchive className="w-8 h-8 text-blue-400" />
            <h2 className="text-2xl font-bold text-white">Import Scenario From Zip</h2>
          </div>
          <button
            onClick={onBack}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        <div className="mb-6">
          <label className="block w-full">
            <input
              type="file"
              accept=".zip"
              onChange={handleFileUpload}
              disabled={isProcessing}
              className="hidden"
              id="zip-upload"
            />
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all ${
                isDragOver
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-600 hover:border-blue-500'
              } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-lg text-slate-300 mb-2">
                {isProcessing
                  ? 'Processing...'
                  : isDragOver
                  ? 'Drop your zip file here'
                  : 'Click to select or drag and drop a zip file'}
              </p>
              <p className="text-sm text-slate-500">
                ZIP must contain main_export_file and games folder with game data
              </p>
            </div>
          </label>
        </div>

        {(isProcessing || progress > 0) && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-300">Import Progress</span>
              <span className="text-sm font-medium text-slate-300">{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {logs.length > 0 && (
          <div className="bg-slate-900/50 rounded-lg p-4 max-h-96 overflow-y-auto border border-slate-700">
            <h3 className="font-semibold text-white mb-3">Import Log</h3>
            <div className="space-y-2">
              {logs.map((log, index) => (
                log.type === 'structure' ? (
                  <div key={index} className="mt-3 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <FolderTree className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-semibold text-blue-400">ZIP Structure</span>
                      <span className="text-xs text-slate-500 ml-auto">
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="bg-slate-800/70 rounded-lg p-4 border border-slate-700 overflow-x-auto">
                      <pre className="text-xs text-slate-300 font-mono whitespace-pre">
                        {log.message.replace('ZIP Structure:\n', '')}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div
                    key={index}
                    className={`flex items-start gap-2 text-sm ${
                      log.type === 'error'
                        ? 'text-red-400'
                        : log.type === 'success'
                        ? 'text-green-400'
                        : log.type === 'warning'
                        ? 'text-yellow-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {log.type === 'error' && <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                    {log.type === 'success' && <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                    {log.type === 'info' && <Loader2 className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                    {log.type === 'warning' && <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                    <span className="flex-1">{log.message}</span>
                    <span className="text-xs text-slate-500">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                )
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
