import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Save, Plus, Trash2, X, ChevronDown, Search, Upload } from 'lucide-react';
import { db } from '../lib/db';
import { Alert } from './Alert';
import { authService } from '../services/authService';
import { ClientSelector } from './ClientSelector';
import { ConfirmDialog, PublishStep } from './ConfirmDialog';
import { clashComboTerritory } from '../../scenarios/bodies/clash/skeleton';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
import { generatePatternSlug } from '../utils/patterns';

interface PatternEditorProps {
  patternId: string;
  gameType: string;
  patternName: string;
  onBack: () => void;
}

interface Station {
  id: number;
  station_name: string;
  station_function: string;
}

interface PatternRow {
  index: number;
  assignments: Record<string, number | null>;
}

interface StationSelectorProps {
  stations: Station[];
  value: number | null;
  usedStationKeys: Set<number>;
  onChange: (stationId: number | null) => void;
}

function StationSelector({ stations, value, usedStationKeys, onChange }: StationSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const selectedStation = useMemo(() => {
    if (value === null) return null;
    return stations.find(s => s.id === value) || null;
  }, [value, stations]);

  const filteredStations = useMemo(() => {
    if (!search.trim()) return stations;
    const term = search.toLowerCase();
    return stations.filter(
      s => s.station_name.toLowerCase().includes(term) || String(s.id).includes(term)
    );
  }, [stations, search]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = 280;
    const openAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
    setDropdownPos({
      top: openAbove ? rect.top - dropdownHeight : rect.bottom + 4,
      left: rect.left,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    setTimeout(() => inputRef.current?.focus(), 0);

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    };

    const handleScroll = () => updatePosition();

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isOpen, updatePosition]);

  const handleSelect = (stationId: number) => {
    onChange(stationId);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={triggerRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-1 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded cursor-pointer hover:border-slate-500 transition-colors min-w-[180px] text-sm"
      >
        <span className={selectedStation ? 'text-slate-100' : 'text-slate-400'}>
          {selectedStation ? `#${selectedStation.id} - ${selectedStation.station_name}` : 'Select station...'}
        </span>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {value !== null && (
            <button
              onClick={handleClear}
              className="p-0.5 hover:bg-slate-600 rounded transition-colors"
            >
              <X size={14} className="text-slate-400 hover:text-slate-200" />
            </button>
          )}
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] w-64 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl overflow-hidden"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          <div className="p-2 border-b border-slate-700">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search stations..."
                className="w-full pl-7 pr-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filteredStations.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-400">No stations found</div>
            ) : (
              filteredStations.map(station => {
                const isUsedElsewhere = usedStationKeys.has(station.id) && station.id !== value;
                const isCurrentValue = station.id === value;
                return (
                  <button
                    key={station.id}
                    onClick={() => !isUsedElsewhere && handleSelect(station.id)}
                    disabled={isUsedElsewhere}
                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                      isCurrentValue
                        ? 'bg-blue-600 text-white'
                        : isUsedElsewhere
                          ? 'text-slate-500 cursor-not-allowed bg-slate-800/80'
                          : 'text-slate-200 hover:bg-slate-700 cursor-pointer'
                    }`}
                  >
                    <span>#{station.id} - {station.station_name}</span>
                    {isUsedElsewhere && <span className="ml-2 text-xs text-slate-500">(used)</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export function PatternEditor({ patternId, gameType, patternName, onBack }: PatternEditorProps) {
  const [name, setName] = useState(patternName);
  const [slug, setSlug] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [version, setVersion] = useState<number>(1.0);
  const [stations, setStations] = useState<Station[]>([]);
  const [rows, setRows] = useState<PatternRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishVersion, setPublishVersion] = useState('1.0');
  const [publishing, setPublishing] = useState(false);
  const [clientEmail, setClientEmail] = useState('');
  const [clientEmailError, setClientEmailError] = useState('');
  const [isValidatingEmail, setIsValidatingEmail] = useState(false);
  const [publishAsClient, setPublishAsClient] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [publishSteps, setPublishSteps] = useState<PublishStep[]>([]);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const PATTERN_SHAPES: Record<string, { types: string[]; labels: string[] }> = {
    mystery:  { types: ['good_answer_station', 'wrong_answer_station'], labels: ['Good Answer Station', 'Wrong Answer Station'] },
    survival: { types: ['good_answer_station', 'wrong_answer_station'], labels: ['Good Answer Station', 'Wrong Answer Station'] },
    tagquest: { types: ['image_1', 'image_2', 'image_3', 'image_4'],    labels: ['Image 1 Station', 'Image 2 Station', 'Image 3 Station', 'Image 4 Station'] },
    tracks:   { types: ['station'],                                      labels: ['Station'] },
    // Clash: each row = one combination = 3 balise stations. Rows are mapped
    // positionally to the scenario's 8 combinations (territory order).
    clash:    { types: ['station_1', 'station_2', 'station_3'],          labels: ['Balise 1', 'Balise 2', 'Balise 3'] },
  };
  const shape = PATTERN_SHAPES[gameType] ?? PATTERN_SHAPES.tagquest;
  const assignmentTypes = shape.types;
  const columnLabels = shape.labels;

  useEffect(() => {
    const loadData = async () => {
      await loadStations();
      await loadPatternItems();
      await loadPatternInfo();
    };
    loadData();
  }, [patternId]);

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditingName]);

  const loadPatternInfo = async () => {
    try {
      const { data, error } = await db
        .from('patterns')
        .select('version, pattern_slug, name')
        .eq('id', patternId)
        .single();

      if (error) throw error;
      if (data) {
        setVersion(data.version);
        const currentSlug = data.pattern_slug || generatePatternSlug(data.name);
        setSlug(currentSlug);
      }
    } catch (error) {
      console.error('Error loading pattern info:', error);
    }
  };

  const loadStations = async () => {
    try {
      const { data, error } = await db
        .from('si_balises')
        .select('id, station_name, station_function')
        .order('id', { ascending: true });

      if (error) throw error;
      setStations(data || []);
    } catch (error) {
      console.error('Error loading stations:', error);
      setAlert({ type: 'error', message: 'Failed to load stations.' });
    }
  };

  const hydrateRowsFromItems = (items: Array<{ item_index: number; assignment_type: string; station_key_number: number | null }>): PatternRow[] => {
    const rowMap = new Map<number, Record<string, number | null>>();
    items.forEach(item => {
      if (!rowMap.has(item.item_index)) {
        const assignments: Record<string, number | null> = {};
        assignmentTypes.forEach(t => { assignments[t] = null; });
        rowMap.set(item.item_index, assignments);
      }
      const row = rowMap.get(item.item_index)!;
      if (assignmentTypes.includes(item.assignment_type)) {
        row[item.assignment_type] = item.station_key_number;
      }
    });
    const sortedIndices = Array.from(rowMap.keys()).sort((a, b) => a - b);
    return sortedIndices.map(idx => ({ index: idx, assignments: rowMap.get(idx)! }));
  };

  const loadPatternItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await db
        .from('pattern_items')
        .select('id, item_index, assignment_type, station_key_number')
        .eq('pattern_id', patternId)
        .order('item_index', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        setRows(hydrateRowsFromItems(data as any));
        return;
      }

      // No pattern_items rows — try lazy backfill from legacy pattern_data JSON.
      const legacy = await db
        .from('patterns')
        .select('pattern_data')
        .eq('id', patternId)
        .single();
      const raw = legacy?.data?.pattern_data;
      if (raw) {
        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.pattern_data) ? parsed.pattern_data : null;
          if (Array.isArray(items) && items.length > 0 && items.every(it => typeof it?.item_index === 'number' && typeof it?.assignment_type === 'string')) {
            const hydrated = hydrateRowsFromItems(items);
            if (hydrated.length > 0) {
              setRows(hydrated);
              setAlert({ type: 'success', message: 'Loaded from legacy JSON. Save to migrate into pattern_items.' });
              return;
            }
          }
        } catch {
          // fall through to empty default
        }
      }

      const emptyAssignments: Record<string, number | null> = {};
      assignmentTypes.forEach(t => { emptyAssignments[t] = null; });
      setRows([{ index: 1, assignments: { ...emptyAssignments } }]);
    } catch (error) {
      console.error('Error loading pattern items:', error);
      setAlert({ type: 'error', message: 'Failed to load pattern items.' });
    } finally {
      setLoading(false);
    }
  };

  const usedStationKeys = useMemo(() => {
    const used = new Set<number>();
    rows.forEach(row => {
      Object.values(row.assignments).forEach(val => {
        if (val !== null) used.add(val);
      });
    });
    return used;
  }, [rows]);

  const handleAssignmentChange = (rowIndex: number, assignmentType: string, keyNumber: number | null) => {
    setRows(prev =>
      prev.map(row => {
        if (row.index !== rowIndex) return row;
        return {
          ...row,
          assignments: { ...row.assignments, [assignmentType]: keyNumber },
        };
      })
    );
  };

  const addRow = () => {
    const maxIndex = rows.length > 0 ? Math.max(...rows.map(r => r.index)) : 0;
    const emptyAssignments: Record<string, number | null> = {};
    assignmentTypes.forEach(t => { emptyAssignments[t] = null; });
    setRows(prev => [...prev, { index: maxIndex + 1, assignments: emptyAssignments }]);
  };

  const removeRow = (rowIndex: number) => {
    setRows(prev => prev.filter(r => r.index !== rowIndex));
  };

  // Persist the current rows (normalized pattern_items) + patterns row metadata.
  // Shared by the explicit "Save Pattern" button and the publish flow so that
  // publishing always saves first. Throws on failure; returns the saved slug.
  const persistPattern = async (): Promise<string> => {
    const { error: deleteError } = await db
      .from('pattern_items')
      .delete()
      .eq('pattern_id', patternId);

    if (deleteError) throw deleteError;

    const itemsToInsert: Array<{
      pattern_id: string;
      item_index: number;
      assignment_type: string;
      station_key_number: number;
    }> = [];

    rows.forEach(row => {
      Object.entries(row.assignments).forEach(([type, keyNumber]) => {
        if (keyNumber !== null) {
          itemsToInsert.push({
            pattern_id: patternId,
            item_index: row.index,
            assignment_type: type,
            station_key_number: keyNumber,
          });
        }
      });
    });

    if (itemsToInsert.length > 0) {
      const { error: insertError } = await db
        .from('pattern_items')
        .insert(itemsToInsert);

      if (insertError) throw insertError;
    }

    const newSlug = generatePatternSlug(name);
    const { error: updateError } = await db
      .from('patterns')
      .update({ name: name, pattern_slug: newSlug, updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ') })
      .eq('id', patternId);

    if (updateError) throw updateError;

    setSlug(newSlug);
    return newSlug;
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await persistPattern();
      setAlert({ type: 'success', message: 'Pattern saved successfully.' });
    } catch (error) {
      console.error('Error saving pattern:', error);
      const msg = error instanceof Error ? error.message : 'Failed to save pattern.';
      setAlert({ type: 'error', message: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setIsEditingName(false);
    } else if (e.key === 'Escape') {
      setName(patternName);
      setIsEditingName(false);
    }
  };

  const checkEmailExists = async (email: string): Promise<{ exists: boolean; clientId?: string }> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/check_email.php?email=${encodeURIComponent(email)}`
      );
      if (!response.ok) return { exists: false };
      const data = await response.json();
      const exists = data.data?.exists === true || data.exists === true;
      const clientId =
        data.data?.client_id ?? data.client_id ?? data.data?.admin_id ?? data.admin_id;
      return { exists, clientId: clientId != null ? String(clientId) : undefined };
    } catch {
      return { exists: false };
    }
  };

  // Each publish bumps the stored version by a 0.1 increment, automatically.
  const computeNextVersion = (current: number | string | null | undefined): string => {
    const n = parseFloat(String(current ?? ''));
    const base = Number.isFinite(n) && n > 0 ? n : 1.0;
    return (Math.round(base * 10) / 10 + 0.1).toFixed(1);
  };

  const openPublishModal = () => {
    setPublishVersion(computeNextVersion(version));
    setShowPublishModal(true);
  };

  const handlePublish = async () => {
    const userEmail = authService.getEmail();
    if (!userEmail) {
      setAlert({ type: 'error', message: 'You must be logged in to publish patterns.' });
      return;
    }

    if (!publishVersion.trim()) {
      setAlert({ type: 'error', message: 'Please provide a version for the pattern.' });
      return;
    }

    const versionNum = parseFloat(publishVersion);
    if (isNaN(versionNum) || versionNum <= 0) {
      setAlert({ type: 'error', message: 'Version must be a valid positive number (e.g., 1.0, 1.1, 2.0).' });
      return;
    }

    if (publishAsClient) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!clientEmail.trim()) {
        setClientEmailError('Please enter a client email address');
        return;
      }
      if (!emailRegex.test(clientEmail.trim())) {
        setClientEmailError('Please enter a valid email address');
        return;
      }
      setIsValidatingEmail(true);
      setClientEmailError('');
      const result = await checkEmailExists(clientEmail.trim());
      setIsValidatingEmail(false);
      if (!result.exists) {
        setClientEmailError('This email is not registered. Please contact support.');
        return;
      }
      if (!result.clientId) {
        setClientEmailError('Failed to retrieve client information. Please try again.');
        return;
      }
      doPublish(clientEmail.trim(), result.clientId, true);
    } else {
      const userClientId = authService.getClientId();
      if (userEmail && userClientId) {
        doPublish(userEmail, userClientId, false);
      } else {
        setAlert({
          type: 'error',
          message: 'Could not retrieve user information. Please try logging in again.'
        });
      }
    }
  };

  const updateStep = (index: number, status: 'done' | 'doing' | 'todo', label?: string) => {
    setPublishSteps(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], status, ...(label && { label }) };
      }
      return updated;
    });
  };

  const doPublish = async (email: string, clientId: string, asClient = false) => {
    setShowPublishModal(false);

    // Check if user is authenticated
    if (!authService.isAuthenticated()) {
      setAlert({
        type: 'error',
        message: 'You are not logged in or your session has expired. Please log in again.'
      });
      return;
    }

    const versionNum = parseFloat(publishVersion);

    setShowPublishConfirm(true);
    setPublishSteps([
      { label: 'Save pattern data', status: 'doing' },
      { label: 'Publish to Taghunter', status: 'todo' },
    ]);

    try {
      setPublishing(true);
      console.log('=== STARTING PATTERN PUBLISH ===');
      console.log('Client Email:', email);
      console.log('Pattern Name:', name);
      console.log('Game Type:', gameType);
      console.log('Version:', publishVersion, 'Parsed:', versionNum);

      const isAdmin = authService.isAdmin();
      console.log('Is Admin:', isAdmin);
      console.log('As Client:', asClient);
      console.log('Client ID from check-client:', clientId);

      const patternData = rows.map(row => ({
        index: row.index,
        assignments: row.assignments
      }));
      console.log('Pattern Data:', JSON.stringify(patternData, null, 2));

      const requestBody = {
        email: email,
        client_id: clientId,
        name: name,
        game_type: gameType,
        pattern_data: patternData,
        version: versionNum,
        is_default: isAdmin && !asClient,
        // patternId is the row's numeric primary key (the editor route loads by
        // uniqid then passes id). Send it as `id` so the backend updates THIS
        // row instead of inserting a duplicate draft.
        id: patternId,
        slug: slug || generatePatternSlug(name),
      };
      console.log('=== REQUEST BODY ===');
      console.log(JSON.stringify(requestBody, null, 2));

      const apiUrl = `${API_BASE_URL}/patterns.php?action=upload`;
      console.log('=== API URL ===');
      console.log(apiUrl);

      // Publishing always saves the current rows first so pattern_items (what the
      // editor reloads from) and the published pattern_data stay in sync.
      await persistPattern();

      updateStep(0, 'done');
      updateStep(1, 'doing');

      const authHeaders = authService.getAuthHeaders() as Record<string, string>;
      // getAuthHeaders() returns X-Auth-Token (studio's backend expects it; some
      // Apache setups silently strip the Authorization header). Merge whatever it
      // provides and only bail if there is genuinely no token at all.
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...authHeaders,
      };

      if (!headers['X-Auth-Token'] && !headers['Authorization']) {
        throw new Error('Authentication token is missing. Please log in again.');
      }

      console.log('=== MAKING FETCH REQUEST ===');
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      console.log('=== FETCH COMPLETED ===');
      console.log('Response Status:', response.status);
      console.log('Response OK:', response.ok);
      console.log('Response Status Text:', response.statusText);
      console.log('Response Headers:', Object.fromEntries(response.headers.entries()));

      const responseText = await response.text();
      console.log('=== RESPONSE TEXT ===');
      console.log(responseText);

      let responseData;
      try {
        responseData = JSON.parse(responseText);
        console.log('=== PARSED RESPONSE ===');
        console.log(JSON.stringify(responseData, null, 2));
      } catch (parseError) {
        console.error('=== JSON PARSE ERROR ===');
        console.error(parseError);
        throw new Error(`Failed to parse response: ${responseText}`);
      }

      if (!response.ok || !responseData?.success) {
        console.error('=== REQUEST FAILED ===');
        console.error('Error:', responseData?.error);
        console.error('Details:', responseData?.details);

        const errorMsg = responseData?.error || responseData?.details || 'Failed to publish pattern';

        // Check if it's an authentication error
        if (response.status === 401 || errorMsg.includes('Unauthorized') || errorMsg.includes('Invalid or expired token')) {
          throw new Error('Authentication failed. Your session may have expired. Please log out and log in again.');
        }

        throw new Error(errorMsg);
      }

      updateStep(1, 'done');
      console.log('=== PUBLISH SUCCESS ===');

      setShowPublishConfirm(false);
      setPublishSteps([]);

      setAlert({ type: 'success', message: responseData.message || 'Pattern published successfully!' });
      setShowPublishModal(false);
      // Reflect the freshly-published version locally so a subsequent publish
      // (without a reload) increments from the new value.
      setVersion(versionNum);
    } catch (error) {
      console.error('=== EXCEPTION CAUGHT ===');
      console.error('Error Type:', typeof error);
      console.error('Error Object:', error);
      console.error('Error Message:', error instanceof Error ? error.message : String(error));

      setPublishSteps([]);
      console.error('Error Stack:', error instanceof Error ? error.stack : 'No stack');
      const msg = error instanceof Error ? error.message : 'Failed to publish pattern.';
      setAlert({ type: 'error', message: msg });
    } finally {
      console.log('=== PUBLISH PROCESS ENDED ===');
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400">Loading pattern...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
              Back
            </button>
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onBlur={() => setIsEditingName(false)}
                  onKeyDown={handleNameKeyDown}
                  className="text-xl font-bold bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500"
                />
              ) : (
                <h1
                  onClick={() => setIsEditingName(true)}
                  className="text-xl font-bold cursor-pointer hover:text-blue-400 transition-colors"
                  title="Click to edit name"
                >
                  {name}
                </h1>
              )}
              <span className="text-sm text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                {gameType === 'survival' ? 'mystery' : gameType}
              </span>
              <span className="text-sm text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                v{version}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors text-sm font-medium"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Pattern'}
            </button>
            <button
              onClick={openPublishModal}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
            >
              <Upload size={16} />
              Publish
            </button>
          </div>
      </div>

      <div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-16">
                    #
                  </th>
                  {columnLabels.map((label, i) => (
                    <th
                      key={assignmentTypes[i]}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider"
                    >
                      {label}
                    </th>
                  ))}
                  <th className="px-4 py-3 w-12" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr
                    key={row.index}
                    className={`border-b border-slate-700/50 ${
                      rowIdx % 2 === 0 ? 'bg-slate-800' : 'bg-slate-800/60'
                    } hover:bg-slate-750`}
                  >
                    <td className="px-4 py-3 text-sm font-mono text-slate-300">
                      {rowIdx + 1}
                      {gameType === 'clash' && (() => {
                        const t = clashComboTerritory(rowIdx);
                        if (t.territoryNumber === 0) return null;
                        return (
                          <span className="block text-[10px] font-sans text-slate-400 whitespace-nowrap">
                            T{t.territoryNumber} · {t.sizeLabel}
                          </span>
                        );
                      })()}
                    </td>
                    {assignmentTypes.map(type => (
                      <td key={type} className="px-4 py-3">
                        <StationSelector
                          stations={stations}
                          value={row.assignments[type]}
                          usedStationKeys={usedStationKeys}
                          onChange={keyNumber => handleAssignmentChange(row.index, type, keyNumber)}
                        />
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => removeRow(row.index)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                        title="Remove row"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-slate-400 text-sm">
              No rows yet. Click the button below to add one.
            </div>
          )}
        </div>

        <div className="mt-4">
          <button
            onClick={addRow}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 hover:border-slate-600 hover:bg-slate-750 rounded-lg transition-colors text-sm text-slate-300"
          >
            <Plus size={16} />
            Add Row
          </button>
        </div>
      </div>

      {showPublishModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-white mb-4">Publish Pattern</h2>
            <p className="text-slate-300 text-sm mb-4">
              Publishing this pattern will make it available to {authService.isAdmin() ? 'all users as a default pattern' : 'your account'}.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">Pattern Name</label>
              <input
                type="text"
                value={name}
                disabled
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-400 text-sm"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">Game Type</label>
              <input
                type="text"
                value={gameType}
                disabled
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-400 text-sm"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Version
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400 font-mono">v{Number(version || 1.0).toFixed(1)}</span>
                <span className="text-slate-500">→</span>
                <input
                  type="text"
                  value={publishVersion}
                  disabled
                  className="w-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm font-mono"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">Version is bumped automatically by 0.1 on each publish.</p>
            </div>

            {authService.isAdmin() && (
              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => { setPublishAsClient(false); setClientEmail(''); setClientEmailError(''); }}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors border ${!publishAsClient ? 'bg-green-600/20 border-green-500 text-green-300' : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500'}`}
                >
                  Publish (self)
                </button>
                <button
                  type="button"
                  onClick={() => setPublishAsClient(true)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors border ${publishAsClient ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500'}`}
                >
                  Publish as Client
                </button>
              </div>
            )}

            {publishAsClient && (
              <div className="mb-4">
                <ClientSelector
                  value={clientEmail}
                  onChange={(email) => { setClientEmail(email); setClientEmailError(''); }}
                  label="Client Email Address"
                  placeholder="client@example.com"
                  required
                />
                {clientEmailError && (
                  <p className="mt-1.5 text-sm text-red-400">{clientEmailError}</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowPublishModal(false);
                  setPublishVersion('1.0');
                  setPublishAsClient(false);
                  setClientEmail('');
                  setClientEmailError('');
                }}
                disabled={publishing || isValidatingEmail}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing || isValidatingEmail || !publishVersion.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
              >
                <Upload size={16} />
                {isValidatingEmail ? 'Validating...' : publishing ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {alert && (
        <Alert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}

      <ConfirmDialog
        isOpen={showPublishConfirm}
        onCancel={() => {
          if (!publishing) {
            setShowPublishConfirm(false);
            setPublishSteps([]);
          }
        }}
        onConfirm={() => {}}
        title="Publishing Pattern"
        message={publishing ? "Publishing your pattern..." : ""}
        confirmText="OK"
        variant="info"
        steps={publishSteps}
        isProcessing={publishing}
      />
    </div>
  );
}
