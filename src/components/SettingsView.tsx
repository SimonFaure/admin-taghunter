import { useState } from 'react';
import { Database, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export function SettingsView() {
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const runMigrations = async () => {
    setIsMigrating(true);
    setMigrationStatus(null);

    try {
      const response = await fetch('https://admin.taghunter.fr/backend/api/migrate.php', {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setMigrationStatus({
          success: true,
          message: data.message || 'Database migrations completed successfully!',
        });
      } else {
        setMigrationStatus({
          success: false,
          message: data.error || 'Migration failed. Please check the server logs.',
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
            <li>API logging system</li>
            <li>Game data fields (game_data, game_type)</li>
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
            <span className="text-sm text-slate-600">Backend URL</span>
            <span className="text-sm font-medium text-slate-900">
              admin.taghunter.fr/backend
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-sm text-slate-600">Database</span>
            <span className="text-sm font-medium text-slate-900">MySQL</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-slate-600">Environment</span>
            <span className="text-sm font-medium text-slate-900">Production</span>
          </div>
        </div>
      </div>
    </div>
  );
}
