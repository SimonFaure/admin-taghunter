import { AlertTriangle, Trash2, CheckCircle, Check, Loader2, Circle } from 'lucide-react';

export interface PublishStep {
  label: string;
  status: 'done' | 'doing' | 'todo';
}

interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  steps?: PublishStep[];
  isProcessing?: boolean;
}

export const ConfirmDialog = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning',
  steps,
  isProcessing = false,
}: ConfirmDialogProps) => {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: Trash2,
      iconBg: 'bg-red-500/10',
      iconColor: 'text-red-500',
      button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
      border: 'border-red-500/20',
    },
    warning: {
      icon: AlertTriangle,
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-500',
      button: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
      border: 'border-amber-500/20',
    },
    info: {
      icon: CheckCircle,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-500',
      button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
      border: 'border-blue-500/20',
    },
  };

  const style = variantStyles[variant];
  const Icon = style.icon;

  const renderStepIcon = (status: 'done' | 'doing' | 'todo') => {
    switch (status) {
      case 'done':
        return <Check className="text-green-500" size={18} />;
      case 'doing':
        return <Loader2 className="text-blue-500 animate-spin" size={18} />;
      case 'todo':
        return <Circle className="text-slate-600" size={18} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md mx-4 bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 animate-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-12 h-12 rounded-full ${style.iconBg} flex items-center justify-center`}>
              <Icon className={`${style.iconColor}`} size={24} />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-white mb-2">
                {title}
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {message}
              </p>
            </div>
          </div>

          {steps && steps.length > 0 && (
            <div className="mt-6 space-y-3">
              {steps.map((step, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                    step.status === 'doing'
                      ? 'bg-blue-500/10 border border-blue-500/30'
                      : step.status === 'done'
                      ? 'bg-green-500/5 border border-green-500/20'
                      : 'bg-slate-900/30 border border-slate-700/30'
                  }`}
                >
                  {renderStepIcon(step.status)}
                  <span
                    className={`text-sm ${
                      step.status === 'done'
                        ? 'text-green-400'
                        : step.status === 'doing'
                        ? 'text-blue-400 font-medium'
                        : 'text-slate-500'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`flex items-center justify-end gap-3 px-6 py-4 bg-slate-900/50 border-t ${style.border} rounded-b-2xl`}>
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isProcessing}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed ${style.button}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
