import { useState, useEffect } from 'react';
import { supabase } from '../lib/db';
import { Database, RefreshCw, ChevronDown, ChevronUp, Filter, X, Trash2 } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

interface ApiLog {
  id: string;
  endpoint: string;
  method: string;
  request_body: any;
  request_headers: any;
  response_body: any;
  response_status: number;
  response_time_ms: number;
  ip_address: string;
  user_agent: string;
  error_message: string | null;
  created_at: string;
}

export function ApiLogs() {
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [filterEndpoint, setFilterEndpoint] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const loadLogs = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('api_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filterEndpoint !== 'all') {
        query = query.eq('endpoint', filterEndpoint);
      }

      if (filterStatus !== 'all') {
        const statusCode = parseInt(filterStatus);
        if (!isNaN(statusCode)) {
          query = query.eq('response_status', statusCode);
        } else if (filterStatus === 'success') {
          query = query.gte('response_status', 200).lt('response_status', 300);
        } else if (filterStatus === 'error') {
          query = query.gte('response_status', 400);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [filterEndpoint, filterStatus]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadLogs();
  };

  const handleClearLogs = async () => {
    try {
      setClearing(true);
      const { error } = await supabase
        .from('api_logs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records

      if (error) throw error;

      setLogs([]);
      setShowClearConfirm(false);
    } catch (error) {
      console.error('Error clearing logs:', error);
      alert('Failed to clear logs. Please try again.');
    } finally {
      setClearing(false);
    }
  };

  const toggleExpand = (logId: string) => {
    setExpandedLog(expandedLog === logId ? null : logId);
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-400 bg-green-500/20';
    if (status >= 300 && status < 400) return 'text-blue-400 bg-blue-500/20';
    if (status >= 400 && status < 500) return 'text-yellow-400 bg-yellow-500/20';
    return 'text-red-400 bg-red-500/20';
  };

  const getMethodColor = (method: string) => {
    switch (method.toUpperCase()) {
      case 'GET': return 'text-green-400 bg-green-500/20';
      case 'POST': return 'text-blue-400 bg-blue-500/20';
      case 'PUT': return 'text-yellow-400 bg-yellow-500/20';
      case 'DELETE': return 'text-red-400 bg-red-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const uniqueEndpoints = Array.from(new Set(logs.map(log => log.endpoint)));

  const clearFilters = () => {
    setFilterEndpoint('all');
    setFilterStatus('all');
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Database size={32} className="text-blue-500" />
          <h1 className="text-3xl font-bold text-white">API Logs</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowClearConfirm(true)}
            disabled={clearing || logs.length === 0}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 size={18} />
            Clear Logs
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Filter size={20} className="text-slate-400" />
          <h2 className="text-lg font-semibold text-white">Filters</h2>
          {(filterEndpoint !== 'all' || filterStatus !== 'all') && (
            <button
              onClick={clearFilters}
              className="ml-auto px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition flex items-center gap-2"
            >
              <X size={14} />
              Clear Filters
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Endpoint
            </label>
            <select
              value={filterEndpoint}
              onChange={(e) => setFilterEndpoint(e.target.value)}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Endpoints</option>
              {uniqueEndpoints.map((endpoint) => (
                <option key={endpoint} value={endpoint}>
                  {endpoint}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Response Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Status Codes</option>
              <option value="success">Success (2xx)</option>
              <option value="error">Error (4xx, 5xx)</option>
              <option value="200">200</option>
              <option value="400">400</option>
              <option value="401">401</option>
              <option value="404">404</option>
              <option value="500">500</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <RefreshCw size={32} className="animate-spin text-blue-500" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-slate-800 rounded-lg p-12 border border-slate-700 text-center">
          <Database size={48} className="mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400 text-lg">No API logs found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden"
            >
              <div
                className="p-4 cursor-pointer hover:bg-slate-750 transition"
                onClick={() => toggleExpand(log.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className={`px-2 py-1 rounded text-xs font-semibold font-mono shrink-0 ${getMethodColor(log.method)}`}>
                      {log.method}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold font-mono shrink-0 ${getStatusColor(log.response_status)}`}>
                      {log.response_status}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <code className="text-sm text-slate-200 truncate">{log.endpoint}</code>
                      <code className="text-xs text-slate-500 truncate">https://studio.taghunter.fr/backend/api{log.endpoint}</code>
                    </div>
                    <span className="text-xs text-slate-500 ml-auto shrink-0">
                      {log.response_time_ms}ms
                    </span>
                    <span className="text-xs text-slate-500 shrink-0">
                      {formatDate(log.created_at)}
                    </span>
                  </div>
                  <div className="ml-4">
                    {expandedLog === log.id ? (
                      <ChevronUp size={20} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={20} className="text-slate-400" />
                    )}
                  </div>
                </div>
                {log.error_message && (
                  <div className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
                    {log.error_message}
                  </div>
                )}
              </div>

              {expandedLog === log.id && (
                <div className="border-t border-slate-700 p-4 space-y-4 bg-slate-900">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-2">Full URL Called</h3>
                    <div className="bg-slate-950 p-3 rounded border border-slate-700 overflow-x-auto">
                      <code className="text-sm text-cyan-400 break-all">
                        {log.method} https://studio.taghunter.fr/backend/api{log.endpoint}
                      </code>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-300 mb-2">IP Address</h3>
                      <code className="text-sm text-slate-400">{log.ip_address || 'N/A'}</code>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-300 mb-2">User Agent</h3>
                      <code className="text-sm text-slate-400 break-all">
                        {log.user_agent || 'N/A'}
                      </code>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-2">Request Body</h3>
                    <div className="bg-slate-950 p-3 rounded border border-slate-700 overflow-x-auto">
                      <pre className="text-xs text-green-400">
                        {JSON.stringify(log.request_body, null, 2)}
                      </pre>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-2">Response Body</h3>
                    <div className="bg-slate-950 p-3 rounded border border-slate-700 overflow-x-auto">
                      <pre className="text-xs text-blue-400">
                        {JSON.stringify(log.response_body, null, 2)}
                      </pre>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-2">Request Headers</h3>
                    <div className="bg-slate-950 p-3 rounded border border-slate-700 overflow-x-auto">
                      <pre className="text-xs text-orange-400">
                        {JSON.stringify(log.request_headers, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {logs.length > 0 && (
        <div className="mt-6 text-center text-slate-400 text-sm">
          Showing {logs.length} log{logs.length !== 1 ? 's' : ''}
        </div>
      )}

      <ConfirmDialog
        isOpen={showClearConfirm}
        onConfirm={handleClearLogs}
        onCancel={() => setShowClearConfirm(false)}
        title="Clear All API Logs"
        message={`Are you sure you want to permanently delete all ${logs.length} API log${logs.length !== 1 ? 's' : ''}?\n\nThis action cannot be undone and will remove all request history, response data, and error logs from the database.`}
        confirmText="Delete All Logs"
        cancelText="Cancel"
        variant="danger"
        isProcessing={clearing}
      />
    </div>
  );
}
