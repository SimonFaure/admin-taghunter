import { AlertTriangle, XCircle, CheckCircle, X, Send } from 'lucide-react';
import type { ValidationResult } from '../utils/publishValidation';

interface PublishValidationModalProps {
  result: ValidationResult;
  onProceed: () => void;
  onCancel: () => void;
}

export function PublishValidationModal({ result, onProceed, onCancel }: PublishValidationModalProps) {
  const hasErrors = result.errors.length > 0;
  const hasWarnings = result.warnings.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            {hasErrors ? (
              <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center">
                <XCircle size={20} className="text-red-400" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-amber-600/20 flex items-center justify-center">
                <AlertTriangle size={20} className="text-amber-400" />
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold text-white">
                {hasErrors ? 'Cannot Publish' : 'Publish with Warnings'}
              </h2>
              <p className="text-sm text-slate-400">
                {hasErrors
                  ? 'Please fix the errors below before publishing'
                  : 'Some optional fields are missing. You can still publish.'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[50vh] overflow-y-auto">
          {result.errors.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <XCircle size={14} className="text-red-400" />
                <span className="text-sm font-semibold text-red-400 uppercase tracking-wide">
                  Errors ({result.errors.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {result.errors.map((issue, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 px-3 py-2.5 bg-red-950/40 border border-red-800/40 rounded-lg"
                  >
                    <XCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-red-300">{issue.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-amber-400" />
                <span className="text-sm font-semibold text-amber-400 uppercase tracking-wide">
                  Warnings ({result.warnings.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {result.warnings.map((issue, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-950/40 border border-amber-800/40 rounded-lg"
                  >
                    <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-amber-300">{issue.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasErrors && !hasWarnings && (
            <div className="flex items-center gap-3 px-4 py-3 bg-green-950/40 border border-green-800/40 rounded-lg">
              <CheckCircle size={16} className="text-green-400" />
              <span className="text-sm text-green-300">All required fields are filled in.</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
          >
            Go Back
          </button>
          {!hasErrors && (
            <button
              onClick={onProceed}
              className="px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition flex items-center gap-2"
            >
              <Send size={14} />
              Publish Anyway
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
