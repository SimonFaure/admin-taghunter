import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Delete, Loader2, Lock } from 'lucide-react';

// 4-digit PIN pad for volunteers (staff check-in link). Submits by itself on
// the 4th digit; a wrong PIN clears the dots and shows the reason.
export function PinPad({ onSubmit, busy, error }: { onSubmit: (pin: string) => void; busy: boolean; error: string | null }) {
  const { t } = useTranslation('checkin');
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (error) setPin('');
  }, [error]);

  const press = (d: string) => {
    if (busy || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) onSubmit(next);
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-xs mx-auto">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-14 h-14 rounded-full bg-slate-900 text-white flex items-center justify-center"><Lock className="w-7 h-7" /></div>
        <h1 className="text-2xl font-bold text-slate-900">{t('pin.title')}</h1>
        <p className="text-slate-600">{t('pin.help')}</p>
      </div>
      <div className="flex gap-4" aria-label={t('pin.title')}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`w-5 h-5 rounded-full border-2 border-slate-900 ${i < pin.length ? 'bg-slate-900' : 'bg-white'}`} />
        ))}
      </div>
      <div className="h-6 text-center">
        {busy ? <Loader2 className="w-6 h-6 animate-spin text-slate-500" /> : error && <p className="text-red-700 font-semibold" role="alert">{t(`pin.errors.${error}`, { defaultValue: t('pin.errors.generic') })}</p>}
      </div>
      <div className="grid grid-cols-3 gap-3 w-full">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} disabled={busy}
            className="h-16 rounded-2xl bg-slate-100 text-2xl font-bold text-slate-900 active:bg-slate-300 disabled:opacity-50">{d}</button>
        ))}
        <span />
        <button type="button" onClick={() => press('0')} disabled={busy}
          className="h-16 rounded-2xl bg-slate-100 text-2xl font-bold text-slate-900 active:bg-slate-300 disabled:opacity-50">0</button>
        <button type="button" onClick={() => setPin(pin.slice(0, -1))} disabled={busy || pin.length === 0} aria-label={t('pin.erase')}
          className="h-16 rounded-2xl text-slate-700 flex items-center justify-center active:bg-slate-200 disabled:opacity-30"><Delete className="w-7 h-7" /></button>
      </div>
    </div>
  );
}
