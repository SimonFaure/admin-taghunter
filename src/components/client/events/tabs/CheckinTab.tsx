import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Check, Copy, KeyRound, Loader2, Lock, Plus, Smartphone, Trash2, Users } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { eventsApi } from '../../../../lib/eventsApi';
import type { StaffLink } from '../../../../types/events';
import { btnDanger, btnPrimary, btnSecondary, Card, errorText, inputCls, Modal, Pill, type TabProps } from '../ui';

// Event editor -> "Accueil" (Events phase 4): arrivals, the licensee's own
// check-in screen, and staff links (+ PIN) for volunteers at the entrance.

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={btnSecondary} onClick={() => {
      void navigator.clipboard?.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }}>{done ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}{label}</button>
  );
}

export function CheckinTab({ data, onSaved }: TabProps) {
  const { t, i18n } = useTranslation('events');
  const ev = data.event;
  const links = data.staff_links ?? [];
  const counts = data.checkin_counts ?? { expected: 0, arrived: 0 };
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [shown, setShown] = useState<{ link: StaffLink; pin: string; fresh: boolean } | null>(null);
  const [revoking, setRevoking] = useState<StaffLink | null>(null);

  const reload = async () => onSaved(await eventsApi.get(ev.id));

  const create = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await eventsApi.staffLinkCreate(ev.id, label.trim());
      setShown({ link: r.link, pin: r.pin, fresh: true });
      setLabel('');
      await reload();
    } catch (e) {
      setMsg(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const newPin = async (l: StaffLink) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await eventsApi.staffLinkPin(ev.id, l.id);
      setShown({ link: r.link, pin: r.pin, fresh: false });
      await reload();
    } catch (e) {
      setMsg(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await eventsApi.staffLinkRevoke(ev.id, revoking.id);
      setRevoking(null);
      await reload();
    } catch (e) {
      setMsg(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const pct = counts.expected > 0 ? Math.round((counts.arrived / counts.expected) * 100) : 0;
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' }) : '–');

  return (
    <div className="space-y-6">
      <Card title={t('checkin.title')} help={t('checkin.help')}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-slate-500" />
            <div>
              <div className="text-2xl font-bold text-slate-900">{counts.arrived} / {counts.expected}</div>
              <div className="text-sm text-slate-500">{t('checkin.arrived')}</div>
            </div>
          </div>
          <div className="flex-1 min-w-[160px] h-3 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <Link to={`/m/checkin/${ev.id}`} className={btnPrimary}><Smartphone className="w-4 h-4" />{t('checkin.open')}</Link>
        </div>
      </Card>

      <Card title={t('checkin.staffTitle')} help={t('checkin.staffHelp')}>
        <div className="flex flex-wrap gap-2 mb-4">
          <input className={`${inputCls} max-w-xs`} value={label} maxLength={80} placeholder={t('checkin.labelPlaceholder')} onChange={(e) => setLabel(e.target.value)} />
          <button className={btnPrimary} onClick={create} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{t('checkin.create')}
          </button>
        </div>
        {msg && <p className="text-sm text-red-600 mb-3">{msg}</p>}
        {links.length === 0 ? (
          <p className="text-sm text-slate-500">{t('checkin.noLinks')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900 flex items-center gap-2">
                    {l.label || t('checkin.unnamed')}
                    {l.locked && <Pill tone="amber"><Lock className="w-3 h-3 inline mr-1" />{t('checkin.locked')}</Pill>}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{l.url}</div>
                  <div className="text-xs text-slate-400">{t('checkin.lastUsed', { date: fmt(l.last_used_at) })}</div>
                </div>
                <CopyButton text={l.url} label={t('checkin.copyLink')} />
                <button className={btnSecondary} onClick={() => newPin(l)} disabled={busy}><KeyRound className="w-4 h-4" />{t('checkin.newPin')}</button>
                <button className={`${btnSecondary} text-red-700`} onClick={() => setRevoking(l)} disabled={busy}><Trash2 className="w-4 h-4" />{t('checkin.revoke')}</button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {shown && (
        <Modal title={shown.fresh ? t('checkin.createdTitle') : t('checkin.newPinTitle')} onClose={() => setShown(null)}
          footer={<button className={btnPrimary} onClick={() => setShown(null)}>{t('checkin.done')}</button>}>
          <div className="space-y-4">
            <p className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3">{t('checkin.pinOnce')}</p>
            <div className="flex flex-col sm:flex-row gap-5 items-center">
              <div className="bg-white p-2 border border-slate-200 rounded-lg"><QRCodeSVG value={shown.link.url} size={160} /></div>
              <div className="space-y-3 min-w-0 flex-1 w-full">
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase">{t('checkin.pin')}</div>
                  <div className="text-4xl font-bold tracking-[0.3em] text-slate-900">{shown.pin}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase">{t('checkin.link')}</div>
                  <div className="text-sm text-slate-700 break-all">{shown.link.url}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={shown.link.url} label={t('checkin.copyLink')} />
                  <CopyButton text={shown.pin} label={t('checkin.copyPin')} />
                  <CopyButton text={t('checkin.shareText', { url: shown.link.url, pin: shown.pin })} label={t('checkin.copyBoth')} />
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {revoking && (
        <Modal title={t('checkin.revokeTitle')} onClose={() => setRevoking(null)}
          footer={<>
            <button className={btnSecondary} onClick={() => setRevoking(null)}>{t('common.cancel')}</button>
            <button className={btnDanger} onClick={revoke} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('checkin.revoke')}</button>
          </>}>
          <p className="text-sm text-slate-700">{t('checkin.revokeText', { label: revoking.label || t('checkin.unnamed') })}</p>
        </Modal>
      )}
    </div>
  );
}
