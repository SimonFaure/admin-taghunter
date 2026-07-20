import { useState, useRef } from 'react';
import { Upload, FileArchive, CheckCircle, X, AlertCircle } from 'lucide-react';
import JSZip from 'jszip';
import { parseCSV } from '../utils/csvParser';
import { db } from '../lib/db';
import { authService } from '../services/authService';
import { Alert } from './Alert';

interface PatternImportProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedPattern {
  name: string;
  game_type: string;
  pattern_uniqid: string;
  slug: string;
  items: PatternItem[];
}

interface PatternItem {
  index: number;
  assignments: Record<string, number | null>;
}

export function PatternImport({ onClose, onSuccess }: PatternImportProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedPattern, setParsedPattern] = useState<ParsedPattern | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({
    show: false,
    type: 'success',
    message: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const zipFile = files.find(f => f.name.endsWith('.zip'));

    if (zipFile) {
      await processZipFile(zipFile);
    } else {
      setError('Please drop a ZIP file');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.zip')) {
      await processZipFile(file);
    } else {
      setError('Please select a ZIP file');
    }
  };

  const processZipFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    setParsedPattern(null);

    try {
      const zip = await JSZip.loadAsync(file);
      const fileList = Object.keys(zip.files);

      console.log('Files in ZIP:', fileList);

      const patternsFolder = fileList.find(f => f.includes('patterns/') && !f.endsWith('patterns/'));
      if (!patternsFolder) {
        throw new Error('No patterns folder found in ZIP file');
      }

      const patternsFolderPath = patternsFolder.substring(0, patternsFolder.indexOf('patterns/') + 9);
      console.log('Patterns folder path:', patternsFolderPath);

      const subfolders = fileList
        .filter(f => f.startsWith(patternsFolderPath) && f.includes('/csv/'))
        .map(f => {
          const relativePath = f.substring(patternsFolderPath.length);
          const subfolder = relativePath.split('/')[0];
          return subfolder;
        })
        .filter((v, i, a) => v && a.indexOf(v) === i);

      if (subfolders.length === 0) {
        throw new Error('No pattern subfolders with csv folder found');
      }

      const firstSubfolder = subfolders[0];
      const patternSlug = firstSubfolder;
      console.log('First subfolder (slug):', firstSubfolder);

      const csvPath = `${patternsFolderPath}${firstSubfolder}/csv/`;
      console.log('CSV path:', csvPath);

      const patternCsvPath = `${csvPath}pattern.csv`;
      const patternCsvFile = zip.files[patternCsvPath];

      if (!patternCsvFile) {
        throw new Error(`pattern.csv not found at ${patternCsvPath}`);
      }

      const patternCsvContent = await patternCsvFile.async('text');
      const patternData = parseCSV(patternCsvContent);

      if (patternData.length === 0) {
        throw new Error('pattern.csv is empty');
      }

      const patternInfo = patternData[0];
      const name = patternInfo.name?.replace(/^"|"$/g, '') || '';
      const game_type = patternInfo.game_type || '';
      const pattern_uniqid = patternInfo.pattern_uniqid || '';

      console.log('Pattern info:', { name, game_type, pattern_uniqid });

      if (!name || !game_type) {
        throw new Error('Missing name or game_type in pattern.csv');
      }

      let items: PatternItem[] = [];

      if (game_type === 'tagquest') {
        const baliseCsvPath = `${csvPath}patterns_balises.csv`;
        const baliseCsvFile = zip.files[baliseCsvPath];

        if (!baliseCsvFile) {
          throw new Error(`patterns_balises.csv not found at ${baliseCsvPath}`);
        }

        const baliseCsvContent = await baliseCsvFile.async('text');
        const baliseData = parseCSV(baliseCsvContent);

        const groupedByImage: Record<number, any[]> = {};
        baliseData.forEach(row => {
          const position = parseInt(row.position);
          const image = parseInt(row.image);
          const balise_id = parseInt(row.balise_id);

          if (!groupedByImage[image]) {
            groupedByImage[image] = [];
          }

          groupedByImage[image].push({ position, balise_id });
        });

        items = Object.entries(groupedByImage).map(([image, data]) => {
          const assignments: Record<string, number | null> = {
            image_1: null,
            image_2: null,
            image_3: null,
            image_4: null,
          };

          data.forEach(({ position, balise_id }) => {
            if (position >= 1 && position <= 4) {
              assignments[`image_${position}`] = balise_id;
            }
          });

          return {
            index: parseInt(image),
            assignments,
          };
        });
      } else if (game_type === 'mystery' || game_type === 'survival') {
        const baliseCsvPath = `${csvPath}patterns_survival_balises.csv`;
        const baliseCsvFile = zip.files[baliseCsvPath];

        if (!baliseCsvFile) {
          throw new Error(`patterns_survival_balises.csv not found at ${baliseCsvPath}`);
        }

        const baliseCsvContent = await baliseCsvFile.async('text');
        const baliseData = parseCSV(baliseCsvContent);

        const groupedByEnigma: Record<number, any> = {};
        baliseData.forEach(row => {
          const enigma_id = parseInt(row.enigma_id);
          const good_answers = row.good_answers || '[]';
          const wrong_answers = row.wrong_answers || '[]';

          let goodAnswersArray: string[] = [];
          let wrongAnswersArray: string[] = [];

          try {
            const cleanGood = good_answers.replace(/""/g, '"').replace(/^"|"$/g, '');
            goodAnswersArray = JSON.parse(cleanGood);
          } catch (e) {
            console.warn('Error parsing good_answers:', e);
          }

          try {
            const cleanWrong = wrong_answers.replace(/""/g, '"').replace(/^"|"$/g, '');
            wrongAnswersArray = JSON.parse(cleanWrong);
          } catch (e) {
            console.warn('Error parsing wrong_answers:', e);
          }

          groupedByEnigma[enigma_id] = {
            good_answers: goodAnswersArray,
            wrong_answers: wrongAnswersArray,
          };
        });

        items = Object.entries(groupedByEnigma).map(([enigma_id, data]) => {
          const assignments: Record<string, number | null> = {};

          if (data.good_answers.length > 0) {
            assignments['good_answer_station'] = parseInt(data.good_answers[0]);
          }

          if (data.wrong_answers.length > 0) {
            assignments['wrong_answer_station'] = parseInt(data.wrong_answers[0]);
          }

          return {
            index: parseInt(enigma_id),
            assignments,
          };
        });
      } else if (game_type === 'maximus') {
        // Legacy maximus patterns share the survival balise CSV shape
        // (enigma_id / good_answers / wrong_answers) but map to the `tracks`
        // game type. A tracks checkpoint is a binary "reached or not" hit, so
        // we keep a single `station` assignment per checkpoint (matching the
        // studio tracks editor's PATTERN_SHAPES) from good_answers[0] and
        // ignore wrong_answers entirely. The enigma_id is preserved as the
        // 1-based item_index - the playground runtime matches a checkpoint to
        // its station by the checkpoint's ordinal position.
        const baliseCsvPath = `${csvPath}patterns_maximus_balises.csv`;
        const baliseCsvFile = zip.files[baliseCsvPath];

        if (!baliseCsvFile) {
          throw new Error(`patterns_maximus_balises.csv not found at ${baliseCsvPath}`);
        }

        const baliseCsvContent = await baliseCsvFile.async('text');
        const baliseData = parseCSV(baliseCsvContent);

        const groupedByCheckpoint: Record<number, { station: number | null }> = {};
        baliseData.forEach(row => {
          const enigma_id = parseInt(row.enigma_id);
          const good_answers = row.good_answers || '[]';

          let goodAnswersArray: string[] = [];
          try {
            const cleanGood = good_answers.replace(/""/g, '"').replace(/^"|"$/g, '');
            goodAnswersArray = JSON.parse(cleanGood);
          } catch (e) {
            console.warn('Error parsing good_answers:', e);
          }

          if (goodAnswersArray.length > 1) {
            console.warn(
              `Checkpoint ${enigma_id} declares ${goodAnswersArray.length} stations; ` +
                'tracks supports one station per checkpoint, using the first.'
            );
          }

          groupedByCheckpoint[enigma_id] = {
            station: goodAnswersArray.length > 0 ? parseInt(goodAnswersArray[0]) : null,
          };
        });

        items = Object.entries(groupedByCheckpoint).map(([enigma_id, data]) => {
          const assignments: Record<string, number | null> = {};

          if (data.station !== null && !Number.isNaN(data.station)) {
            assignments['station'] = data.station;
          }

          return {
            index: parseInt(enigma_id),
            assignments,
          };
        });
      } else {
        throw new Error(`Unsupported game type: ${game_type}`);
      }

      items.sort((a, b) => a.index - b.index);

      setParsedPattern({
        name,
        game_type,
        pattern_uniqid,
        slug: patternSlug,
        items,
      });
    } catch (err) {
      console.error('Error processing ZIP file:', err);
      setError(err instanceof Error ? err.message : 'Unknown error processing ZIP file');
    } finally {
      setIsProcessing(false);
    }
  };

  const generatePatternUniqid = () =>
    Math.random().toString(36).substr(2, 9) + Date.now().toString(36);

  const handleImport = async () => {
    if (!parsedPattern) return;

    setIsProcessing(true);
    try {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const normalizedGameType =
        parsedPattern.game_type === 'survival'
          ? 'mystery'
          : parsedPattern.game_type === 'maximus'
            ? 'tracks'
            : parsedPattern.game_type;

      const { data: existing } = await db
        .from('patterns')
        .select('id')
        .eq('name', parsedPattern.name)
        .eq('game_type', normalizedGameType);
      if (Array.isArray(existing) && existing.length > 0) {
        setAlert({
          show: true,
          type: 'error',
          message: `A pattern named "${parsedPattern.name}" already exists for game type "${normalizedGameType}". Rename or delete the existing one before re-importing.`,
        });
        setIsProcessing(false);
        return;
      }

      const patternUniqid = parsedPattern.pattern_uniqid?.trim() || generatePatternUniqid();
      const ownerEmail = authService.getEmail() ?? '';
      const ownerId = authService.getClientId();

      const { data: pattern, error: patternError } = await db
        .from('patterns')
        .insert({
          name: parsedPattern.name,
          game_type: normalizedGameType,
          pattern_slug: parsedPattern.slug,
          pattern_uniqid: patternUniqid,
          pattern_data: '[]',
          owner_type: 'admin',
          owner_id: ownerId,
          created_by_email: ownerEmail,
          is_default: 1,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (patternError) throw patternError;

      const patternItems = [];
      for (const item of parsedPattern.items) {
        for (const [assignmentType, stationKey] of Object.entries(item.assignments)) {
          if (stationKey !== null) {
            patternItems.push({
              pattern_id: pattern.id,
              item_index: item.index,
              assignment_type: assignmentType,
              station_key_number: stationKey,
            });
          }
        }
      }

      if (patternItems.length > 0) {
        const { error: itemsError } = await db
          .from('pattern_items')
          .insert(patternItems);

        if (itemsError) throw itemsError;
      }

      setAlert({
        show: true,
        type: 'success',
        message: `Pattern "${parsedPattern.name}" imported successfully`,
      });

      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err) {
      console.error('Error importing pattern:', err);
      setAlert({
        show: true,
        type: 'error',
        message: 'Failed to import pattern',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      {alert.show && (
        <Alert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert(prev => ({ ...prev, show: false }))}
        />
      )}

      <div className="relative w-full max-w-2xl mx-4 bg-slate-800 rounded-2xl shadow-2xl border border-slate-700">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">Import Pattern from ZIP</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!parsedPattern && (
            <>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-12 text-center transition ${
                  isDragging
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-600 hover:border-slate-500'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div className="flex flex-col items-center gap-4">
                  {isProcessing ? (
                    <>
                      <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                      <p className="text-white font-medium">Processing ZIP file...</p>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center">
                        <FileArchive size={32} className="text-slate-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium mb-1">
                          Drop your ZIP file here
                        </p>
                        <p className="text-slate-400 text-sm">or</p>
                      </div>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                      >
                        <Upload size={18} />
                        Browse Files
                      </button>
                    </>
                  )}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-400 font-medium">Error</p>
                    <p className="text-red-300 text-sm mt-1">{error}</p>
                  </div>
                </div>
              )}

              <div className="bg-slate-900/50 rounded-lg p-4 text-sm text-slate-300 space-y-2">
                <p className="font-medium text-white">Expected ZIP structure:</p>
                <pre className="text-xs bg-slate-950 p-3 rounded overflow-x-auto">
{`patterns/
  {pattern-slug}/
    csv/
      pattern.csv
      patterns_balises.csv          (tagquest)
      patterns_survival_balises.csv (mystery)
      patterns_maximus_balises.csv  (tracks)`}
                </pre>
                <p className="text-xs text-slate-500">The folder name is used as the pattern slug.</p>
              </div>
            </>
          )}

          {parsedPattern && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <CheckCircle size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-green-400 font-medium">Pattern parsed successfully</p>
                  <p className="text-green-300 text-sm mt-1">
                    Ready to import into the database
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-4 space-y-3">
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wide">Pattern Name</label>
                  <p className="text-white font-medium mt-1">{parsedPattern.name}</p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wide">Slug</label>
                  <p className="text-slate-300 font-mono text-sm mt-1">{parsedPattern.slug}</p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wide">Game Type</label>
                  <p className="text-white font-medium mt-1 capitalize">{parsedPattern.game_type}</p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wide">Items</label>
                  <p className="text-white font-medium mt-1">{parsedPattern.items.length} assignments</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-900/50 border-t border-slate-700 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          {parsedPattern && (
            <button
              onClick={handleImport}
              disabled={isProcessing}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Importing...' : 'Import Pattern'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
