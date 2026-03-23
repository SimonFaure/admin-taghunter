import { useState, useEffect, useCallback } from 'react';
import {
  X, CreditCard, Search, CheckSquare, Square, Layers, Calendar,
  Trash2, AlertCircle, CheckCircle, ChevronDown, ChevronUp, Filter, Download
} from 'lucide-react';
import { onDemandCardsApi, OnDemandPoolCard, ClientOnDemandCard } from '../lib/api';

interface AssignOnDemandCardsModalProps {
  clientId: number;
  clientName: string;
  onClose: () => void;
}

type ViewMode = 'pool' | 'assigned';

export function AssignOnDemandCardsModal({ clientId, clientName, onClose }: AssignOnDemandCardsModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('pool');

  const [poolCards, setPoolCards] = useState<OnDemandPoolCard[]>([]);
  const [filteredPool, setFilteredPool] = useState<OnDemandPoolCard[]>([]);
  const [assignments, setAssignments] = useState<ClientOnDemandCard[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [endDate, setEndDate] = useState('');

  const [showRangeFilter, setShowRangeFilter] = useState(false);
  const [rangeField, setRangeField] = useState<'key_number' | 'card_id'>('key_number');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removingAll, setRemovingAll] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFilter();
  }, [searchQuery, poolCards]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [poolRes, assignRes] = await Promise.all([
        onDemandCardsApi.getPool(),
        onDemandCardsApi.getClientAssignments(clientId),
      ]);
      if (poolRes.data) {
        setPoolCards(poolRes.data.data);
        setFilteredPool(poolRes.data.data);
      }
      if (assignRes.data) setAssignments(assignRes.data.data);
      if (poolRes.error) setError(poolRes.error);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const applyFilter = useCallback(() => {
    if (!searchQuery.trim()) {
      setFilteredPool(poolCards);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredPool(
      poolCards.filter(
        (c) =>
          c.key_name.toLowerCase().includes(q) ||
          c.key_number.toLowerCase().includes(q) ||
          c.card_id.toLowerCase().includes(q) ||
          c.color.toLowerCase().includes(q)
      )
    );
  }, [searchQuery, poolCards]);

  const assignedPoolIds = new Set(assignments.map((a) => a.pool_card_id));

  const toggleCard = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const unassigned = filteredPool.filter((c) => !assignedPoolIds.has(c.id));
    setSelectedIds(new Set(unassigned.map((c) => c.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const applyRangeSelection = () => {
    if (!rangeFrom && !rangeTo) return;
    const fromNum = rangeFrom ? parseFloat(rangeFrom) : -Infinity;
    const toNum = rangeTo ? parseFloat(rangeTo) : Infinity;

    const inRange = poolCards.filter((c) => {
      const val = parseFloat(rangeField === 'key_number' ? c.key_number : c.card_id);
      if (isNaN(val)) return false;
      return val >= fromNum && val <= toNum;
    });

    setSelectedIds((prev) => {
      const next = new Set(prev);
      inRange.forEach((c) => {
        if (!assignedPoolIds.has(c.id)) next.add(c.id);
      });
      return next;
    });
    setShowRangeFilter(false);
  };

  const handleAssign = async () => {
    if (selectedIds.size === 0) return;
    setAssigning(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await onDemandCardsApi.assignCards(
        clientId,
        Array.from(selectedIds),
        endDate || null
      );
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setSuccessMsg(`${res.data.assigned} card(s) assigned successfully`);
        setSelectedIds(new Set());
        setEndDate('');
        const assignRes = await onDemandCardsApi.getClientAssignments(clientId);
        if (assignRes.data) setAssignments(assignRes.data.data);
      }
    } catch {
      setError('Assignment failed');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (assignmentId: string) => {
    setRemoving(assignmentId);
    setError(null);
    try {
      const res = await onDemandCardsApi.removeAssignment(assignmentId);
      if (res.error) {
        setError(res.error);
      } else {
        setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
      }
    } catch {
      setError('Failed to remove assignment');
    } finally {
      setRemoving(null);
    }
  };

  const handleRemoveAll = async () => {
    if (!window.confirm(`Remove all on-demand card assignments for ${clientName}?`)) return;
    setRemovingAll(true);
    setError(null);
    try {
      const res = await onDemandCardsApi.removeAllAssignments(clientId);
      if (res.error) {
        setError(res.error);
      } else {
        setAssignments([]);
        setSuccessMsg('All assignments removed');
      }
    } catch {
      setError('Failed to remove assignments');
    } finally {
      setRemovingAll(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return 'No expiry';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const handleDownloadAssigned = () => {
    const headers = ['key_name', 'color', 'key_number', 'id', 'end_date', 'assigned_at'];
    const rows = assignments.map((a) => [
      a.key_name || '',
      a.color || '',
      a.key_number || '',
      a.card_id || '',
      a.end_date || '',
      a.assigned_at || '',
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().split('T')[0];
    a.download = `on_demand_${clientName.replace(/\s+/g, '_')}_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const unassignedInFilter = filteredPool.filter((c) => !assignedPoolIds.has(c.id));
  const selectedCount = selectedIds.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">On Demand Cards</h2>
              <p className="text-xs text-slate-500">{clientName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 bg-white px-6 flex-shrink-0">
          <button
            onClick={() => setViewMode('pool')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              viewMode === 'pool' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Assign Cards
            {poolCards.length > 0 && (
              <span className="ml-2 text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                {poolCards.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setViewMode('assigned')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              viewMode === 'assigned' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Assigned Cards
            {assignments.length > 0 && (
              <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                {assignments.length}
              </span>
            )}
          </button>
        </div>

        {(error || successMsg) && (
          <div className="flex-shrink-0 px-6 pt-4">
            {successMsg && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                {successMsg}
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" />
            </div>
          ) : viewMode === 'pool' ? (
            <div className="p-6">
              {poolCards.length === 0 ? (
                <div className="text-center py-12">
                  <CreditCard className="w-14 h-14 text-slate-200 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-slate-700 mb-1">No pool available</h3>
                  <p className="text-sm text-slate-500">Upload a cards pool first from the main cards page</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search pool cards..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                      />
                    </div>
                    <button
                      onClick={() => setShowRangeFilter((v) => !v)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        showRangeFilter ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Filter className="w-3.5 h-3.5" />
                      Range
                      {showRangeFilter ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={selectAll} className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                      Select All
                    </button>
                    {selectedCount > 0 && (
                      <button onClick={clearSelection} className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                        Clear ({selectedCount})
                      </button>
                    )}
                  </div>

                  {showRangeFilter && (
                    <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Select by Range</p>
                      <div className="flex flex-wrap gap-3 items-end">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-slate-500">Field</label>
                          <select
                            value={rangeField}
                            onChange={(e) => setRangeField(e.target.value as 'key_number' | 'card_id')}
                            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                          >
                            <option value="key_number">key_number</option>
                            <option value="card_id">id</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-slate-500">From</label>
                          <input
                            type="text"
                            placeholder="e.g. 1"
                            value={rangeFrom}
                            onChange={(e) => setRangeFrom(e.target.value)}
                            className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-slate-500">To</label>
                          <input
                            type="text"
                            placeholder="e.g. 50"
                            value={rangeTo}
                            onChange={(e) => setRangeTo(e.target.value)}
                            className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                          />
                        </div>
                        <button
                          onClick={applyRangeSelection}
                          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
                        >
                          Apply Range
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
                    <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                          <tr>
                            <th className="w-10 px-4 py-2.5"></th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Key Name</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Color</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Key Number</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredPool.map((card) => {
                            const isAssigned = assignedPoolIds.has(card.id);
                            const isSelected = selectedIds.has(card.id);
                            return (
                              <tr
                                key={card.id}
                                onClick={() => !isAssigned && toggleCard(card.id)}
                                className={`transition-colors ${
                                  isAssigned
                                    ? 'bg-green-50/50 cursor-default'
                                    : isSelected
                                    ? 'bg-blue-50 cursor-pointer'
                                    : 'hover:bg-slate-50 cursor-pointer'
                                }`}
                              >
                                <td className="px-4 py-2.5">
                                  {isAssigned ? (
                                    <CheckSquare className="w-4 h-4 text-green-500" />
                                  ) : isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-blue-600" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-300" />
                                  )}
                                </td>
                                <td className="px-4 py-2.5 font-medium text-slate-900">{card.key_name || '-'}</td>
                                <td className="px-4 py-2.5">
                                  <span className="inline-flex items-center gap-1.5 text-slate-700">
                                    <span className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0" style={{ backgroundColor: card.color || '#ccc' }} />
                                    {card.color || '-'}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-slate-700">{card.key_number || '-'}</td>
                                <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{card.card_id || '-'}</td>
                                <td className="px-4 py-2.5">
                                  {isAssigned ? (
                                    <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium bg-green-100 px-2 py-0.5 rounded-full">
                                      <CheckCircle className="w-3 h-3" />
                                      Assigned
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400">Available</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {unassignedInFilter.length === 0 && filteredPool.length > 0 && (
                    <p className="text-sm text-slate-500 text-center mb-4">All visible cards are already assigned</p>
                  )}

                  <div className="flex flex-wrap items-end gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        End Date (optional)
                      </label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                      />
                    </div>
                    <div className="flex-1 flex items-end">
                      <button
                        onClick={handleAssign}
                        disabled={selectedCount === 0 || assigning}
                        className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-medium text-sm hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {assigning ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Assigning...
                          </>
                        ) : (
                          <>
                            <Layers className="w-4 h-4" />
                            Assign {selectedCount > 0 ? `${selectedCount} Card${selectedCount > 1 ? 's' : ''}` : 'Cards'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="p-6">
              {assignments.length === 0 ? (
                <div className="text-center py-12">
                  <Layers className="w-14 h-14 text-slate-200 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-slate-700 mb-1">No cards assigned</h3>
                  <p className="text-sm text-slate-500 mb-4">Use the Assign Cards tab to add cards for this client</p>
                  <button
                    onClick={() => setViewMode('pool')}
                    className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
                  >
                    Assign Cards
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-slate-600">
                      <span className="font-semibold text-slate-900">{assignments.length}</span> card{assignments.length !== 1 ? 's' : ''} assigned
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDownloadAssigned}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download CSV
                      </button>
                      <button
                        onClick={handleRemoveAll}
                        disabled={removingAll}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove All
                      </button>
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Key Name</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Color</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Key Number</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">End Date</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned</th>
                            <th className="px-4 py-2.5"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {assignments.map((a) => (
                            <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-2.5 font-medium text-slate-900">{a.key_name || '-'}</td>
                              <td className="px-4 py-2.5">
                                <span className="inline-flex items-center gap-1.5 text-slate-700">
                                  <span className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0" style={{ backgroundColor: a.color || '#ccc' }} />
                                  {a.color || '-'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-slate-700">{a.key_number || '-'}</td>
                              <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{a.card_id || '-'}</td>
                              <td className="px-4 py-2.5">
                                {a.end_date ? (
                                  <span className={`text-sm ${new Date(a.end_date) < new Date() ? 'text-red-600 font-medium' : 'text-slate-700'}`}>
                                    {formatDate(a.end_date)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-400">No expiry</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-slate-400">{formatDate(a.assigned_at)}</td>
                              <td className="px-4 py-2.5">
                                <button
                                  onClick={() => handleRemove(a.id)}
                                  disabled={removing === a.id}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                                  title="Remove"
                                >
                                  {removing === a.id ? (
                                    <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
