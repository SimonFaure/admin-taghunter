import { useEffect, useState } from 'react';
import { Database, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

type DbInfo = {
  host: string;
  port: number;
  database: string;
  charset: string;
  server_version: string;
};

export function SettingsView() {
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<{
    success: boolean;
    message: string;
    details?: string[];
  } | null>(null);
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const [dbInfoError, setDbInfoError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/db_info.php`, { credentials: 'include' })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.success) {
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        setDbInfo(body.data);
      })
      .catch((err: Error) => setDbInfoError(err.message));
  }, []);

  const runMigrations = async () => {
    setIsMigrating(true);
    setMigrationStatus(null);

    try {
      const response = await fetch(`${API_BASE_URL}/migrate.php`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setMigrationStatus({
          success: true,
          message: data.message || 'Database migrations completed successfully!',
          details: data.details || [],
        });
      } else {
        setMigrationStatus({
          success: false,
          message: data.error || 'Migration failed. Please check the server logs.',
          details: data.details || [],
        });
      }
    } catch (error) {
      setMigrationStatus({
        success: false,
        message: 'Failed to connect to the server. Please try again.',
      });
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Database className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Database Migrations</h3>
            <p className="text-sm text-slate-600">
              Run database migrations to update your schema
            </p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-2">
            Available Migrations:
          </h4>
          <ul className="text-sm text-slate-700 space-y-1 ml-4 list-disc">
            <li>Core tables (admin_users, clients, scenarios)</li>
            <li>Roles and permissions</li>
            <li>Launched games tracking</li>
            <li>Client scenarios (purchased products)</li>
            <li>API logging system</li>
            <li>Game data fields (game_data, game_type)</li>
            <li>App versions tracking</li>
            <li>Cards and devices management</li>
          </ul>
        </div>

        {migrationStatus && (
          <div
            className={`mb-4 p-4 rounded-lg flex items-start space-x-3 ${
              migrationStatus.success
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            {migrationStatus.success ? (
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              <p
                className={`text-sm font-medium ${
                  migrationStatus.success ? 'text-green-900' : 'text-red-900'
                }`}
              >
                {migrationStatus.message}
              </p>
              {migrationStatus.details && migrationStatus.details.length > 0 && (
                <div className="mt-3 space-y-1">
                  {migrationStatus.details.map((detail, index) => (
                    <p
                      key={index}
                      className={`text-xs font-mono ${
                        migrationStatus.success ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {detail}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <button
          onClick={runMigrations}
          disabled={isMigrating}
          className={`flex items-center justify-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
            isMigrating
              ? 'bg-slate-300 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isMigrating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Running Migrations...</span>
            </>
          ) : (
            <>
              <Database className="w-5 h-5" />
              <span>Run Database Migrations</span>
            </>
          )}
        </button>

        <p className="text-xs text-slate-500 mt-3">
          Note: This will safely apply all pending migrations. Existing data will not be affected.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-4">System Information</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-sm text-slate-600">API base URL</span>
            <span className="text-sm font-medium text-slate-900 font-mono">
              {API_BASE_URL}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-sm text-slate-600">Database host</span>
            <span className="text-sm font-medium text-slate-900 font-mono">
              {dbInfoError
                ? <span className="text-red-600">error</span>
                : dbInfo
                  ? `${dbInfo.host}:${dbInfo.port}`
                  : 'loading…'}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-sm text-slate-600">Database name</span>
            <span className="text-sm font-medium text-slate-900 font-mono">
              {dbInfoError
                ? <span className="text-red-600">{dbInfoError}</span>
                : dbInfo?.database ?? 'loading…'}
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-slate-600">MySQL server</span>
            <span className="text-sm font-medium text-slate-900 font-mono">
              {dbInfo?.server_version ?? (dbInfoError ? '—' : 'loading…')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
