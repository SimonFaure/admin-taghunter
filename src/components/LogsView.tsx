import React, { useState, useEffect } from 'react';
import { FileText, RefreshCw, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

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
}

export default function LogsView() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [total, setTotal] = useState(0);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('https://admin.taghunter.fr/backend/api/logs.php?action=list&limit=100', {
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
    if (!confirm('Are you sure you want to clear all logs? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('https://admin.taghunter.fr/backend/api/logs.php?action=clear', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to clear logs');
      }

      setLogs([]);
      setTotal(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear logs');
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
            onClick={clearLogs}
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
                      {Object.keys(log.data).length > 0 && (
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
                        {JSON.stringify(log.response, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
