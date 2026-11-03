import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowDown, ArrowUp, Loader2, Trash2, Upload, X } from 'lucide-react';
import { EventsApiError, centsToEuros, eurosToCents, eventsApi, formatMoney } from '../../../lib/eventsApi';
import type { EventEditorPayload, EventJob, UploadKind } from '../../../types/events';

// Shared bits for the Events editor (Events phases 2-3).

export const btnPrimary = 'inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed';
export const btnSecondary = 'inline-flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50';
export const btnGhost = 'inline-flex items-center gap-1 px-2 py-1 text-slate-500 rounded hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 text-sm';
export const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400';
export const smallInputCls = 'border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400';
export const card = 'bg-white rounded-xl border border-slate-200 p-6';

export interface TabProps {
  data: EventEditorPayload;
  onSaved: (p: EventEditorPayload) => void;
}

export function Card({ title, help, children, actions }: { title?: string; help?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className={card}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          {title && <h3 className="text-lg font-semibold text-slate-900">{title}</h3>}
          {actions}
        </div>
      )}
      {help && <p className="text-sm text-slate-600 mb-4">{help}</p>}
      {!help && title && <div className="mb-3" />}
      {children}
    </section>
  );
}

export function Field({ label, help, error, wide, children }: {
  label: ReactNode; help?: ReactNode; error?: string | null; wide?: boolean; children: ReactNode;
}) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
      {help && !error && <span className="block mt-1 text-xs text-slate-500">{help}</span>}
      {error && <span className="block mt-1 text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; help?: ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-800">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {help && <span className="block text-xs text-slate-500">{help}</span>}
      </span>
    </label>
  );
}

/** Save button + status line, shared by every tab. */
export function SaveBar({ dirty, saving, onSave, label, msg }: {
  dirty: boolean; saving: boolean; onSave: () => void; label?: string; msg?: { ok: boolean; text: string } | null;
}) {
  const { t } = useTranslation('events');
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className={btnPrimary} onClick={onSave} disabled={!dirty || saving}>
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {saving ? t('common.saving') : (label ?? t('common.save'))}
      </button>
      {dirty && !saving && <span className="text-xs text-amber-700">{t('common.unsaved')}</span>}
      {msg && <span className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</span>}
    </div>
  );
}

export function MoveButtons({ index, count, onMove, onRemove }: {
  index: number; count: number; onMove: (from: number, to: number) => void; onRemove?: () => void;
}) {
  const { t } = useTranslation('events');
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button type="button" className={btnGhost} title={t('common.moveUp')} disabled={index === 0} onClick={() => onMove(index, index - 1)}><ArrowUp className="w-4 h-4" /></button>
      <button type="button" className={btnGhost} title={t('common.moveDown')} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}><ArrowDown className="w-4 h-4" /></button>
      {onRemove && <button type="button" className={btnGhost} title={t('common.remove')} onClick={onRemove}><Trash2 className="w-4 h-4" /></button>}
    </div>
  );
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/** Upload one file to the event media folder; reports the stored file name. */
export function UploadButton({ eventId, kind, accept, onUploaded, label }: {
  eventId: number; kind: UploadKind; accept: string; onUploaded: (file: string, url: string) => void; label?: string;
}) {
  const { t } = useTranslation('events');
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setBusy(true);
        setErr(null);
        try {
          const r = await eventsApi.upload(eventId, kind, f);
          onUploaded(r.file, r.url);
        } catch (ex) {
          setErr(errorText(t, ex));
        } finally {
          setBusy(false);
        }
      }} />
      <button type="button" className={btnSecondary} disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {busy ? t('common.uploading') : (label ?? t('common.upload'))}
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  );
}

type T = ReturnType<typeof useTranslation>['t'];

/** Human message for an API error (first field error, else the code). */
export function errorText(t: T, e: unknown): string {
  if (e instanceof EventsApiError) {
    const first = e.errors ? Object.values(e.errors)[0] : null;
    const code = first ?? e.message;
    return t(`errors.${code}`, { defaultValue: t('errors.generic') });
  }
  return t('errors.generic');
}

/** Field error for a key (or a key prefix like "slots.2."). */
export function fieldError(t: T, errors: Record<string, string> | undefined, key: string): string | null {
  if (!errors) return null;
  const code = errors[key];
  return code ? t(`errors.${code}`, { defaultValue: code }) : null;
}

export function isDirty(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation('events');
  const tone = status === 'published' ? 'bg-emerald-100 text-emerald-800' : status === 'archived' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tone}`}>{t(`status.${status}`)}</span>;
}

/** Euro amount input (accepts "18,50" or "18.5"); reports cents, or null when empty. */
export function MoneyInput({ cents, onChange, className, placeholder }: {
  cents: number | null; onChange: (c: number | null) => void; className?: string; placeholder?: string;
}) {
  const [text, setText] = useState(centsToEuros(cents));
  useEffect(() => {
    if (eurosToCents(text) !== cents) setText(centsToEuros(cents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);
  return (
    <div className="relative">
      <input inputMode="decimal" className={`${className ?? smallInputCls} pr-6`} value={text} placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          const c = eurosToCents(e.target.value);
          if (c !== null || e.target.value.trim() === '') onChange(c);
        }} />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span>
    </div>
  );
}

/** Integer input; empty -> null. */
export function IntInput({ value, onChange, className, min, max, placeholder }: {
  value: number | null; onChange: (v: number | null) => void; className?: string; min?: number; max?: number; placeholder?: string;
}) {
  return (
    <input type="number" inputMode="numeric" min={min} max={max} className={className ?? smallInputCls} placeholder={placeholder}
      value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Math.trunc(Number(e.target.value)))} />
  );
}

// ── Phase 3 helpers ─────────────────────────────────────────────────────

/** Centered dialog (click outside or X to close). */
export function Modal({ title, onClose, children, footer, wide }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button className={btnGhost} onClick={onClose} aria-label="×"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export const btnDanger = 'inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed';

/** Poll a cancellation job every 2 s until it is done / in error. */
export function useJobPolling(initial: EventJob | null | undefined, onFinished?: (job: EventJob) => void): EventJob | null {
  const [job, setJob] = useState<EventJob | null>(initial ?? null);
  const finished = useRef(onFinished);
  finished.current = onFinished;
  useEffect(() => { setJob(initial ?? null); }, [initial]);
  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'error') return;
    const id = setTimeout(() => {
      eventsApi.job(job.id).then((j) => {
        setJob(j);
        if (j.status === 'done' || j.status === 'error') finished.current?.(j);
      }).catch(() => setJob({ ...job }));
    }, 2000);
    return () => clearTimeout(id);
  }, [job]);
  return job;
}

export function JobProgress({ job }: { job: EventJob }) {
  const { t, i18n } = useTranslation('events');
  const p = job.progress;
  const total = p.total ?? 0;
  const done = (p.done ?? 0) + (p.failed ?? 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 100;
  const running = job.status === 'queued' || job.status === 'running';
  return (
    <div className={`rounded-lg border p-3 text-sm ${job.status === 'error' ? 'border-red-200 bg-red-50' : running ? 'border-blue-200 bg-blue-50' : 'border-emerald-200 bg-emerald-50'}`}>
      <div className="flex items-center gap-2 font-medium text-slate-800">
        {running && <Loader2 className="w-4 h-4 animate-spin" />}
        {t(`cancel.job.${job.status}`, { kind: t(`cancel.kind.${job.kind}`) })}
      </div>
      <div className="mt-2 h-2 rounded bg-white overflow-hidden"><div className="h-full bg-slate-800 transition-all" style={{ width: `${pct}%` }} /></div>
      <div className="mt-1 text-xs text-slate-600">
        {t('cancel.job.progress', { done: p.done ?? 0, total })}
        {(p.refunded_cents ?? 0) > 0 && ` · ${t('cancel.job.refunded', { amount: formatMoney(p.refunded_cents ?? 0, i18n.language) })}`}
        {(p.failed ?? 0) > 0 && ` · ${t('cancel.job.failed', { count: p.failed })}`}
      </div>
      {p.last_error && <div className="mt-1 text-xs text-red-700">{p.last_error}</div>}
    </div>
  );
}

/** Ask a reason, warn, start a slot/event cancellation, then follow the job. */
export function CancelFlowModal({ kind, label, onStart, onClose, onDone }: {
  kind: 'cancel_slot' | 'cancel_event';
  label: ReactNode;
  onStart: (reason: string) => Promise<EventEditorPayload>;
  onClose: () => void;
  onDone: (p: EventEditorPayload | null) => void;
}) {
  const { t } = useTranslation('events');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [started, setStarted] = useState<EventJob | null>(null);
  const [payload, setPayload] = useState<EventEditorPayload | null>(null);
  const job = useJobPolling(started);
  const finished = !!job && (job.status === 'done' || job.status === 'error');

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      const p = await onStart(reason.trim());
      setPayload(p);
      setStarted(p.job ?? null);
      if (!p.job) onDone(p);
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (started && !finished) return; // keep the progress visible until refunds are through
    if (started) onDone(payload);
    else onClose();
  };

  return (
    <Modal title={t(`cancel.${kind}.title`)} onClose={close}
      footer={started ? (
        <button className={btnPrimary} disabled={!finished} onClick={() => onDone(payload)}>{t('cancel.close')}</button>
      ) : (
        <>
          <button className={btnSecondary} onClick={onClose}>{t('common.cancel')}</button>
          <button className={btnDanger} disabled={!confirm || busy} onClick={start}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}{t(`cancel.${kind}.confirm`)}
          </button>
        </>
      )}>
      {!started ? (
        <div className="space-y-4 text-sm">
          <p className="font-medium text-slate-900">{label}</p>
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-900">
            <AlertTriangle className="w-4 h-4 inline mr-1 -mt-0.5" />{t(`cancel.${kind}.warning`)}
          </div>
          <Field label={t('cancel.reason')} help={t('cancel.reasonHelp')}>
            <input className={inputCls} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={t('cancel.reasonPlaceholder')} />
          </Field>
          <Toggle checked={confirm} onChange={setConfirm} label={t('cancel.understand')} />
          {err && <p className="text-red-600">{err}</p>}
        </div>
      ) : job ? <JobProgress job={job} /> : null}
    </Modal>
  );
}

/** Coloured pill. */
export function Pill({ tone, children }: { tone: 'green' | 'blue' | 'amber' | 'red' | 'slate' | 'violet'; children: ReactNode }) {
  const cls = {
    green: 'bg-emerald-100 text-emerald-800', blue: 'bg-blue-100 text-blue-800', amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800', slate: 'bg-slate-200 text-slate-700', violet: 'bg-violet-100 text-violet-800',
  }[tone];
  return <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cls}`}>{children}</span>;
}
