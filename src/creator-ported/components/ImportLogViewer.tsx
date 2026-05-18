import { useState, useEffect, useRef } from 'react';
import { FileArchive, CheckCircle, XCircle, Clock, Download, ArrowLeft } from 'lucide-react';
import { db } from '../lib/db';

interface ImportLog {
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  timestamp: string;
}

interface ImportLogRecord {
  id: string;
  scenario_id: string | null;
  file_name: string;
  status: 'in_progress' | 'success' | 'failed';
  logs: ImportLog[];
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

interface ImportLogViewerProps {
  onBack: () => void;
}

export function ImportLogViewer({ onBack }: ImportLogViewerProps) {
  const [importLogs, setImportLogs] = useState<ImportLogRecord[]>([]);
  const [selectedLog, setSelectedLog] = useState<ImportLogRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadImportLogs();
  }, []);

  useEffect(() => {
    if (selectedLog && !userHasScrolled && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [selectedLog?.logs, userHasScrolled]);

  const loadImportLogs = async () => {
    setIsLoading(true);
    const { data, error } = await db
      .from('import_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Failed to load import logs:', error);
    } else {
      setImportLogs(data || []);
    }
    setIsLoading(false);
  };

  const downloadLogAsText = (log: ImportLogRecord) => {
    const content = [
      `Import Log: ${log.file_name}`,
      `Status: ${log.status}`,
      `Created: ${new Date(log.created_at).toLocaleString()}`,
      `Completed: ${log.completed_at ? new Date(log.completed_at).toLocaleString() : 'N/A'}`,
      log.error_message ? `Error: ${log.error_message}` : '',
      '\n--- Logs ---\n',
      ...log.logs.map(l => `[${l.type.toUpperCase()}] ${new Date(l.timestamp).toLocaleTimeString()} - ${l.message}`)
    ].filter(Boolean).join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-log-${log.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadLogAsJson = (log: ImportLogRecord) => {
    const content = JSON.stringify(log, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-log-${log.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-blue-600 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (selectedLog) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <FileArchive className="w-8 h-8 text-blue-600" />
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Import Log Details</h2>
                <p className="text-sm text-gray-600">{selectedLog.file_name}</p>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedLog(null);
                setUserHasScrolled(false);
              }}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to List
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Status</div>
              <div className="flex items-center gap-2">
                {getStatusIcon(selectedLog.status)}
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedLog.status)}`}>
                  {selectedLog.status}
                </span>
              </div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Scenario ID</div>
              <div className="font-mono text-sm">{selectedLog.scenario_id || 'N/A'}</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Created At</div>
              <div className="text-sm">{new Date(selectedLog.created_at).toLocaleString()}</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Completed At</div>
              <div className="text-sm">
                {selectedLog.completed_at ? new Date(selectedLog.completed_at).toLocaleString() : 'N/A'}
              </div>
            </div>
          </div>

          {selectedLog.error_message && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="text-sm font-semibold text-red-800 mb-2">Error Message</div>
              <div className="text-sm text-red-700">{selectedLog.error_message}</div>
            </div>
          )}

          <div className="flex gap-3 mb-6">
            <button
              onClick={() => downloadLogAsText(selectedLog)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Download className="w-4 h-4" />
              Download as Text
            </button>
            <button
              onClick={() => downloadLogAsJson(selectedLog)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              <Download className="w-4 h-4" />
              Download as JSON
            </button>
          </div>

          <div
            ref={logContainerRef}
            onScroll={() => setUserHasScrolled(true)}
            onClick={() => setUserHasScrolled(true)}
            className="bg-gray-50 rounded-lg p-4 max-h-[600px] overflow-y-auto"
          >
            <h3 className="font-semibold text-gray-900 mb-3">Import Log</h3>
            <div className="space-y-2">
              {selectedLog.logs.map((log, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-2 text-sm ${
                    log.type === 'error'
                      ? 'text-red-600'
                      : log.type === 'success'
                      ? 'text-green-600'
                      : log.type === 'warning'
                      ? 'text-yellow-600'
                      : 'text-gray-600'
                  }`}
                >
                  {log.type === 'error' && <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                  {log.type === 'success' && <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                  {log.type === 'info' && <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                  {log.type === 'warning' && <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                  <span className="flex-1 break-words">{log.message}</span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FileArchive className="w-8 h-8 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900">Import Logs</h2>
          </div>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-600">Loading import logs...</p>
          </div>
        ) : importLogs.length === 0 ? (
          <div className="text-center py-12">
            <FileArchive className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No import logs found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {importLogs.map((log) => (
              <div
                key={log.id}
                onClick={() => {
                  setSelectedLog(log);
                  setUserHasScrolled(false);
                }}
                className="border border-gray-200 rounded-lg p-4 hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {getStatusIcon(log.status)}
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{log.file_name}</div>
                      <div className="text-sm text-gray-600">
                        {new Date(log.created_at).toLocaleString()}
                        {log.completed_at && (
                          <span className="ml-2">
                            • Duration: {((new Date(log.completed_at).getTime() - new Date(log.created_at).getTime()) / 1000).toFixed(2)}s
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(log.status)}`}>
                      {log.status}
                    </span>
                    <div className="text-sm text-gray-500">
                      {log.logs.length} logs
                    </div>
                  </div>
                </div>
                {log.error_message && (
                  <div className="mt-2 text-sm text-red-600">
                    Error: {log.error_message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
