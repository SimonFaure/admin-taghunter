import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CreditCard,
  Plus,
  Upload,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Pencil,
  X,
  Save,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  CardRow,
  NewCardInput,
  CardUpdateInput,
  ImportCsvResponse,
  CardsConflictError,
} from '../lib/cardsApi';

export interface CardsEditorApi {
  list: () => Promise<{ cards: CardRow[]; version: number }>;
  create: (card: NewCardInput) => Promise<void>;
  update: (id: number, fields: CardUpdateInput) => Promise<void>;
  remove: (id: number) => Promise<void>;
  importCsv: (file: File) => Promise<ImportCsvResponse>;
}

interface Props {
  api: CardsEditorApi;
  title?: string;
  description?: string;
  /** When true, the section header acts as a toggle that shows/hides the body. */
  collapsible?: boolean;
  /** Initial collapsed state when `collapsible` is set. Defaults to expanded. */
  defaultCollapsed?: boolean;
}

interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

type EditState =
  | { kind: 'none' }
  | { kind: 'register'; idStr: string; keyNumberStr: string; keyName: string; color: string }
  | { kind: 'edit'; id: number; keyNumberStr: string; keyName: string; color: string };

type ImportState = { open: false } | { open: true; busy: boolean; dragActive: boolean };

function suggestNextKeyNumber(cards: CardRow[]): number {
  if (cards.length === 0) return 1;
  return Math.max(...cards.map((c) => c.key_number)) + 1;
}

export function CardsRegistryEditor({
  api,
  title = 'Cards',
  description,
  collapsible = false,
  defaultCollapsed = false,
}: Props) {
  const [collapsed, setCollapsed] = useState(collapsible ? defaultCollapsed : false);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [version, setVersion] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editState, setEditState] = useState<EditState>({ kind: 'none' });
  const [importState, setImportState] = useState<ImportState>({ open: false });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [keyNumberError, setKeyNumberError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CardRow | null>(null);
  const toastIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(
    () => [...cards].sort((a, b) => a.key_number - b.key_number || a.id - b.id),
    [cards]
  );

  const showToast = (type: Toast['type'], message: string) => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  };

  const reload = async () => {
    setLoading(true);
    try {
      const res = await api.list();
      setCards(res.cards);
      setVersion(res.version);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load cards');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openRegister = () => {
    setKeyNumberError(null);
    setEditState({
      kind: 'register',
      idStr: '',
      keyNumberStr: String(suggestNextKeyNumber(cards)),
      keyName: '',
      color: '',
    });
  };

  const openEdit = (card: CardRow) => {
    setKeyNumberError(null);
    setEditState({
      kind: 'edit',
      id: card.id,
      keyNumberStr: String(card.key_number),
      keyName: card.key_name,
      color: card.color ?? '',
    });
  };

  const cancelEdit = () => {
    setEditState({ kind: 'none' });
    setKeyNumberError(null);
  };

  const handleConflict = (err: unknown): boolean => {
    if (err instanceof CardsConflictError) {
      if (err.errorCode === 'key_number_taken') {
        setKeyNumberError('This key number is already taken by another card');
        showToast('error', 'Key number already in use — choose another');
      } else {
        showToast('error', 'A card with this chip ID is already registered');
      }
      return true;
    }
    return false;
  };

  const submitRegister = async () => {
    if (editState.kind !== 'register') return;
    setKeyNumberError(null);
    const id = parseInt(editState.idStr, 10);
    const keyNumber = parseInt(editState.keyNumberStr, 10);
    if (!Number.isFinite(id) || id <= 0) {
      showToast('error', 'Chip ID must be a positive integer');
      return;
    }
    if (!Number.isFinite(keyNumber) || keyNumber <= 0) {
      showToast('error', 'Key number must be a positive integer');
      return;
    }
    if (editState.keyName.trim() === '') {
      showToast('error', 'Name is required');
      return;
    }

    setBusy(true);
    try {
      await api.create({
        id,
        key_number: keyNumber,
        key_name: editState.keyName.trim(),
        color: editState.color.trim() === '' ? null : editState.color.trim(),
      });
      showToast('success', `Registered ${editState.keyName} (#${keyNumber})`);
      setEditState({ kind: 'none' });
      await reload();
    } catch (err) {
      if (!handleConflict(err)) {
        showToast('error', err instanceof Error ? err.message : 'Failed to register card');
      }
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async () => {
    if (editState.kind !== 'edit') return;
    setKeyNumberError(null);
    const keyNumber = parseInt(editState.keyNumberStr, 10);
    if (!Number.isFinite(keyNumber) || keyNumber <= 0) {
      showToast('error', 'Key number must be a positive integer');
      return;
    }
    if (editState.keyName.trim() === '') {
      showToast('error', 'Name is required');
      return;
    }

    setBusy(true);
    try {
      await api.update(editState.id, {
        key_number: keyNumber,
        key_name: editState.keyName.trim(),
        color: editState.color.trim() === '' ? null : editState.color.trim(),
      });
      showToast('success', 'Card updated');
      setEditState({ kind: 'none' });
      await reload();
    } catch (err) {
      if (!handleConflict(err)) {
        showToast('error', err instanceof Error ? err.message : 'Failed to update card');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (card: CardRow) => {
    setConfirmDelete(card);
  };

  const performDelete = async () => {
    if (!confirmDelete) return;
    const card = confirmDelete;
    setBusy(true);
    try {
      await api.remove(card.id);
      showToast('success', 'Card deleted');
      setConfirmDelete(null);
      await reload();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete card');
    } finally {
      setBusy(false);
    }
  };

  const openImport = () => setImportState({ open: true, busy: false, dragActive: false });
  const closeImport = () => setImportState({ open: false });

  const handleImport = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showToast('error', 'Only CSV files are allowed');
      return;
    }
    setImportState({ open: true, busy: true, dragActive: false });
    try {
      const res = await api.importCsv(file);
      const parts = [`${res.inserted} inserted`, `${res.updated} updated`];
      if (res.skipped > 0) parts.push(`${res.skipped} skipped`);
      showToast(res.skipped > 0 ? 'info' : 'success', `Import done: ${parts.join(', ')}`);
      if (res.errors.length > 0) {
        showToast('error', `Errors: ${res.errors.slice(0, 3).join(' | ')}${res.errors.length > 3 ? ' …' : ''}`);
      }
      closeImport();
      await reload();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Import failed');
      setImportState({ open: true, busy: false, dragActive: false });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleImport(file);
  };

  return (
    <div className="space-y-6 relative">
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-6 py-4 rounded-lg shadow-lg border-2 min-w-80 ${
              t.type === 'success'
                ? 'bg-green-50 border-green-500 text-green-900'
                : t.type === 'error'
                ? 'bg-red-50 border-red-500 text-red-900'
                : 'bg-blue-50 border-blue-500 text-blue-900'
            }`}
          >
            {t.type === 'success' && <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />}
            {t.type === 'error' && <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
            {t.type === 'info' && <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />}
            <span className="font-medium">{t.message}</span>
          </div>
        ))}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className={`flex items-start justify-between flex-wrap gap-4 ${collapsed ? '' : 'mb-6'}`}>
          <div>
            {collapsible ? (
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                aria-expanded={!collapsed}
                className="flex items-center gap-2 text-xl font-bold text-slate-900 hover:text-slate-700 transition-colors"
              >
                {collapsed ? (
                  <ChevronRight className="w-5 h-5 text-slate-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-500" />
                )}
                <CreditCard className="w-6 h-6" />
                <span>{title}</span>
              </button>
            ) : (
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-6 h-6" />
                <span>{title}</span>
              </h2>
            )}
            {description && <p className="text-slate-600 mt-1">{description}</p>}
            <div className="mt-2 text-xs text-slate-500">
              {cards.length} card{cards.length === 1 ? '' : 's'} · version {version.toFixed(2)}
            </div>
          </div>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={onFileChange}
                className="hidden"
              />
              <button
                onClick={openImport}
                disabled={busy}
                className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-all text-sm disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>Import CSV</span>
              </button>
              <button
                onClick={openRegister}
                disabled={busy || editState.kind !== 'none'}
                className="inline-flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-all text-sm disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Register card</span>
              </button>
            </div>
          )}
        </div>

        {!collapsed && editState.kind === 'register' && (
          <div className="mb-6 p-4 border border-slate-200 rounded-lg bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Register a new card</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Field label="Chip ID" hint="from the card chip">
                <input
                  type="number"
                  min={1}
                  value={editState.idStr}
                  onChange={(e) => setEditState({ ...editState, idStr: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  placeholder="e.g. 2145811"
                />
              </Field>
              <Field label="Key #" hint="display number" error={keyNumberError ?? undefined}>
                <input
                  type="number"
                  min={1}
                  value={editState.keyNumberStr}
                  onChange={(e) => setEditState({ ...editState, keyNumberStr: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg text-sm ${
                    keyNumberError ? 'border-red-400' : 'border-slate-300'
                  }`}
                />
              </Field>
              <Field label="Name" hint="required">
                <input
                  type="text"
                  value={editState.keyName}
                  onChange={(e) => setEditState({ ...editState, keyName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  placeholder="e.g. Alpha"
                />
              </Field>
              <Field label="Color" hint="optional">
                <input
                  type="text"
                  value={editState.color}
                  onChange={(e) => setEditState({ ...editState, color: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  placeholder="e.g. red"
                />
              </Field>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={submitRegister}
                disabled={busy}
                className="inline-flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>Save</span>
              </button>
              <button
                onClick={cancelEdit}
                disabled={busy}
                className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        )}

        {!collapsed && (loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900"></div>
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-slate-50 p-12 rounded-xl border border-slate-200 text-center">
            <CreditCard className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No cards registered yet</h3>
            <p className="text-slate-600 text-sm">
              Click <strong>Register card</strong> to add one manually, or <strong>Import CSV</strong> to bulk-import.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Key #</Th>
                  <Th>Name</Th>
                  <Th>Color</Th>
                  <Th>Chip ID</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {sorted.map((card) => {
                  const isEditing = editState.kind === 'edit' && editState.id === card.id;
                  if (isEditing) {
                    return (
                      <tr key={card.id} className="bg-slate-50">
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={1}
                            value={editState.keyNumberStr}
                            onChange={(e) =>
                              setEditState({ ...editState, keyNumberStr: e.target.value })
                            }
                            className={`w-24 px-2 py-1 border rounded text-sm ${
                              keyNumberError ? 'border-red-400' : 'border-slate-300'
                            }`}
                          />
                          {keyNumberError && (
                            <div className="text-xs text-red-600 mt-1">{keyNumberError}</div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editState.keyName}
                            onChange={(e) =>
                              setEditState({ ...editState, keyName: e.target.value })
                            }
                            className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editState.color}
                            onChange={(e) =>
                              setEditState({ ...editState, color: e.target.value })
                            }
                            className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                          />
                        </td>
                        <td className="px-4 py-2 text-sm text-slate-500 font-mono">{card.id}</td>
                        <td className="px-4 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={submitEdit}
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-slate-900 text-white rounded text-xs hover:bg-slate-700 disabled:opacity-50"
                            >
                              <Save className="w-3 h-3" />
                              <span>Save</span>
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-2 py-1 border border-slate-300 text-slate-700 rounded text-xs hover:bg-slate-50 disabled:opacity-50"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={card.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2 text-sm font-medium text-slate-900">
                        #{card.key_number}
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-900">{card.key_name}</td>
                      <td className="px-4 py-2 text-sm text-slate-600">
                        {card.color || <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-500 font-mono">{card.id}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEdit(card)}
                            disabled={busy || editState.kind !== 'none'}
                            className="inline-flex items-center gap-1 px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Edit"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(card)}
                            disabled={busy || editState.kind !== 'none'}
                            className="inline-flex items-center gap-1 px-2 py-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {importState.open && (
        <ImportCsvModal
          busy={importState.busy}
          dragActive={importState.dragActive}
          onDragChange={(active) =>
            setImportState((s) => (s.open ? { ...s, dragActive: active } : s))
          }
          onCancel={closeImport}
          onPick={() => fileInputRef.current?.click()}
          onDrop={(file) => handleImport(file)}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          card={confirmDelete}
          busy={busy}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={performDelete}
        />
      )}
    </div>
  );
}

interface ImportCsvModalProps {
  busy: boolean;
  dragActive: boolean;
  onDragChange: (active: boolean) => void;
  onCancel: () => void;
  onPick: () => void;
  onDrop: (file: File) => void;
}

function ImportCsvModal({
  busy,
  dragActive,
  onDragChange,
  onCancel,
  onPick,
  onDrop,
}: ImportCsvModalProps) {
  const handleDragEvent = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      onDragChange(true);
    } else if (e.type === 'dragleave') {
      onDragChange(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragChange(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onDrop(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Import cards from CSV</h3>
          <button
            onClick={onCancel}
            disabled={busy}
            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div
          onClick={busy ? undefined : onPick}
          onDragEnter={handleDragEvent}
          onDragOver={handleDragEvent}
          onDragLeave={handleDragEvent}
          onDrop={busy ? undefined : handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            busy
              ? 'border-slate-200 bg-slate-50 cursor-wait'
              : dragActive
                ? 'border-slate-900 bg-slate-100 cursor-pointer'
                : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50 cursor-pointer'
          }`}
        >
          <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="font-semibold text-slate-900 mb-1">
            {busy ? 'Importing…' : 'Drop CSV here or click to browse'}
          </p>
          <p className="text-xs text-slate-500">
            Expected headers: <code className="bg-slate-200 px-1 rounded">key_name, color, key_number, id</code>
          </p>
          <p className="text-xs text-slate-500 mt-1">Existing rows are upserted by chip ID.</p>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConfirmDeleteModalProps {
  card: CardRow;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDeleteModal({ card, busy, onCancel, onConfirm }: ConfirmDeleteModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-2">Delete card?</h3>
        <p className="text-sm text-slate-700 mb-1">
          <strong>{card.key_name}</strong> (chip <code className="font-mono">{card.id}</code>, key #{card.key_number})
        </p>
        <p className="text-xs text-slate-500 mb-6">
          This deletes the card on studio and on every device on the next sync. It cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider ${className}`}
    >
      {children}
    </th>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700">{label}</span>
      {hint && <span className="block text-xs text-slate-400 mb-1">{hint}</span>}
      {children}
      {error && <span className="block text-xs text-red-600 mt-1">{error}</span>}
    </label>
  );
}
