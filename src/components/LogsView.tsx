import { useState, useEffect } from 'react';
import { FileText, RefreshCw, Trash2, ChevronDown, ChevronUp, Wrench, Gamepad2, AlertTriangle } from 'lucide-react';
import { authFetch } from '../lib/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface LogEntry {
  timestamp: string;
  endpoint: string;
  method: string;
  action: string;
  user_id: number | null;
  ip: string;
  user_agent: string;
  data: Record<string, any>;
  response: Record<string, any>;
  status_code: number;
  source?: string;
}

export default function LogsView() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [total, setTotal] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await authFetch(`${API_BASE_URL}/logs.php?action=list&limit=100`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }

      const data = await response.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    try {
      setClearing(true);
      const response = await authFetch(`${API_BASE_URL}/logs.php?action=clear`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to clear logs');
      }

      setLogs([]);
      setTotal(0);
      setShowClearConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear logs');
      setShowClearConfirm(false);
    } finally {
      setClearing(false);
    }
  };

  const toggleLogExpansion = (index: number) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedLogs(newExpanded);
  };

  const getStatusColor = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) return 'text-green-600 bg-green-50';
    if (statusCode >= 400 && statusCode < 500) return 'text-orange-600 bg-orange-50';
    if (statusCode >= 500) return 'text-red-600 bg-red-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getMethodColor = (method: string) => {
    switch (method.toUpperCase()) {
      case 'GET': return 'text-blue-600 bg-blue-50';
      case 'POST': return 'text-green-600 bg-green-50';
      case 'PUT': return 'text-yellow-600 bg-yellow-50';
      case 'DELETE': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Logs</h1>
          <p className="text-gray-600 mt-1">Total entries: {total}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear Logs
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {logs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">No logs available</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log, index) => (
            <div
              key={index}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden"
            >
              <div
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleLogExpansion(index)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(log.status_code)}`}>
                      {log.status_code}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${getMethodColor(log.method)}`}>
                      {log.method}
                    </span>
                    {log.source === 'creator' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300">
                        <Wrench className="w-3 h-3" />
                        Creator
                      </span>
                    )}
                    {log.source === 'playground' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-300">
                        <Gamepad2 className="w-3 h-3" />
                        Playground
                      </span>
                    )}
                    <span className="text-sm font-medium text-gray-900">
                      {log.endpoint} - {log.action}
                    </span>
                    <span className="text-sm text-gray-500">
                      {log.timestamp}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {log.user_id && (
                      <span className="text-xs text-gray-500">
                        User: {log.user_id}
                      </span>
                    )}
                    {expandedLogs.has(index) ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              {expandedLogs.has(index) && (
                <div className="px-4 pb-4 border-t border-gray-200 bg-gray-50">
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <h4 className="text-xs font-semibold text-gray-700 mb-2">Request Details</h4>
                      <div className="text-xs space-y-1">
                        <div className="flex">
                          <span className="text-gray-600 w-24">IP:</span>
                          <span className="text-gray-900">{log.ip}</span>
                        </div>
                        <div className="flex">
                          <span className="text-gray-600 w-24">User Agent:</span>
                          <span className="text-gray-900 break-all">{log.user_agent}</span>
                        </div>
                      </div>
                      {log.data && Object.keys(log.data).length > 0 && (
                        <div className="mt-3">
                          <h5 className="text-xs font-semibold text-gray-700 mb-1">Request Data</h5>
                          <pre className="text-xs bg-white p-2 rounded border border-gray-200 overflow-x-auto">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-gray-700 mb-2">Response</h4>
                      <pre className="text-xs bg-white p-2 rounded border border-gray-200 overflow-x-auto">
                        {JSON.stringify(log.response || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Clear All Logs</h3>
                  <p className="text-sm text-slate-600 mb-3">
                    Are you sure you want to clear all <span className="font-semibold">{total} log entries</span>? This action cannot be undone.
                  </p>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-700">
                      All API activity history will be permanently deleted.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex items-center justify-end space-x-3 rounded-b-xl">
              <button
                onClick={() => setShowClearConfirm(false)}
                disabled={clearing}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={clearLogs}
                disabled={clearing}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all disabled:opacity-50 flex items-center space-x-2"
              >
                {clearing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    <span>Clearing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Clear All Logs</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
