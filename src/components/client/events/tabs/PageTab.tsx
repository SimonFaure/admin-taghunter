import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { eventsApi } from '../../../../lib/eventsApi';
import { emptyContent, type EventContent, type EventLang, type EventLayout, type EventTheme } from '../../../../types/events';
import {
  btnSecondary, Card, errorText, Field, inputCls, isDirty, move, MoveButtons, SaveBar, smallInputCls, Toggle, UploadButton, type TabProps,
} from '../ui';

function normalize(c: Partial<EventContent> | undefined): EventContent {
  const e = emptyContent();
  return { ...e, ...(c ?? {}), practical: { ...e.practical, ...(c?.practical ?? {}) } };
}

export function PageTab({ data, onSaved }: TabProps) {
  return (
    <div className="space-y-6">
      <ContentCard data={data} onSaved={onSaved} />
      <DesignCard data={data} onSaved={onSaved} />
    </div>
  );
}

// ── Texts, per language ──────────────────────────────────────────────────

function ContentCard({ data, onSaved }: TabProps) {
  const { t } = useTranslation('events');
  const ev = data.event;
  const [lang, setLang] = useState<EventLang>(ev.main_language);
  const saved = useMemo(() => normalize(data.contents[lang]), [data, lang]);
  const [draft, setDraft] = useState<EventContent>(saved);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setDraft(saved); setMsg(null); }, [saved]);
  const dirty = isDirty(draft, saved);

  const set = <K extends keyof EventContent>(k: K, v: EventContent[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const main = lang !== ev.main_language ? normalize(data.contents[ev.main_language]) : null;
  const ph = (v: string | undefined) => (main && v ? v : undefined);

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await eventsApi.contentSave(ev.id, lang, draft));
      setMsg({ ok: true, text: t('common.saved') });
    } catch (e) {
      setMsg({ ok: false, text: errorText(t, e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={t('page.texts')} actions={ev.languages.length > 1 ? (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-600">{t('page.language')}</span>
        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
          {ev.languages.map((l) => (
            <button key={l} disabled={dirty && l !== lang} onClick={() => setLang(l)}
              className={`px-3 py-1.5 text-sm ${l === lang ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'} disabled:opacity-40`}>
              {l.toUpperCase()}{l === ev.main_language ? ' ★' : ''}
            </button>
          ))}
        </div>
      </div>
    ) : undefined} help={ev.languages.length > 1 ? t('page.languageHelp') : undefined}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('page.title')}>
          <input className={inputCls} value={draft.title} maxLength={120} placeholder={ph(main?.title)} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label={t('page.subtitle')}>
          <input className={inputCls} value={draft.subtitle} maxLength={200} placeholder={ph(main?.subtitle)} onChange={(e) => set('subtitle', e.target.value)} />
        </Field>
        <Field label={t('page.date_text')}>
          <input className={inputCls} value={draft.date_text} maxLength={120} placeholder={ph(main?.date_text) ?? t('page.date_text_placeholder')} onChange={(e) => set('date_text', e.target.value)} />
        </Field>
        <Field label={t('page.cta_label')}>
          <input className={inputCls} value={draft.cta_label} maxLength={40} placeholder={ph(main?.cta_label) ?? t('page.cta_label_placeholder')} onChange={(e) => set('cta_label', e.target.value)} />
        </Field>
        <Field label={t('page.description')} help={t('page.markdownHelp')} wide>
          <textarea className={`${inputCls} min-h-[160px] font-mono`} value={draft.description_md} maxLength={8000} placeholder={ph(main?.description_md)} onChange={(e) => set('description_md', e.target.value)} />
        </Field>
      </div>

      <h4 className="font-semibold text-slate-900 mt-6 mb-3">{t('page.practical')}</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('page.hours')}>
          <textarea rows={2} className={`${inputCls} resize-y`} value={draft.practical.hours} maxLength={200} placeholder={ph(main?.practical.hours)} onChange={(e) => set('practical', { ...draft.practical, hours: e.target.value })} />
        </Field>
        <Field label={t('page.ages')}>
          <textarea rows={2} className={`${inputCls} resize-y`} value={draft.practical.ages} maxLength={200} placeholder={ph(main?.practical.ages)} onChange={(e) => set('practical', { ...draft.practical, ages: e.target.value })} />
        </Field>
        <Field label={t('page.info')} wide>
          <textarea className={`${inputCls} min-h-[80px]`} value={draft.practical.info_md} maxLength={4000} onChange={(e) => set('practical', { ...draft.practical, info_md: e.target.value })} />
        </Field>
      </div>

      <ListEditor
        title={t('page.steps')} addLabel={t('page.addStep')} items={draft.steps} max={8}
        blank={{ title: '', text: '' }} onChange={(v) => set('steps', v)}
        render={(it, upd) => (
          <div className="grid gap-2 sm:grid-cols-3 flex-1">
            <input className={smallInputCls} placeholder={t('page.stepTitle')} value={it.title} maxLength={80} onChange={(e) => upd({ ...it, title: e.target.value })} />
            <input className={`${smallInputCls} sm:col-span-2`} placeholder={t('page.stepText')} value={it.text} maxLength={600} onChange={(e) => upd({ ...it, text: e.target.value })} />
          </div>
        )}
      />
      <ListEditor
        title={t('page.testimonials')} addLabel={t('page.addTestimonial')} items={draft.testimonials} max={12}
        blank={{ quote: '', author: '', role: '' }} onChange={(v) => set('testimonials', v)}
        render={(it, upd) => (
          <div className="grid gap-2 sm:grid-cols-4 flex-1">
            <textarea className={`${smallInputCls} sm:col-span-2`} rows={2} placeholder={t('page.quote')} value={it.quote} maxLength={600} onChange={(e) => upd({ ...it, quote: e.target.value })} />
            <input className={smallInputCls} placeholder={t('page.author')} value={it.author} maxLength={80} onChange={(e) => upd({ ...it, author: e.target.value })} />
            <input className={smallInputCls} placeholder={t('page.role')} value={it.role} maxLength={80} onChange={(e) => upd({ ...it, role: e.target.value })} />
          </div>
        )}
      />
      <ListEditor
        title={t('page.faq')} addLabel={t('page.addFaq')} items={draft.faq} max={30}
        blank={{ q: '', a: '' }} onChange={(v) => set('faq', v)}
        render={(it, upd) => (
          <div className="grid gap-2 flex-1">
            <input className={smallInputCls} placeholder={t('page.question')} value={it.q} maxLength={200} onChange={(e) => upd({ ...it, q: e.target.value })} />
            <textarea className={smallInputCls} rows={2} placeholder={t('page.answer')} value={it.a} maxLength={2000} onChange={(e) => upd({ ...it, a: e.target.value })} />
          </div>
        )}
      />

      <div className="grid gap-4 mt-6">
        <Field label={t('page.terms')} help={t('page.termsHelp')}>
          <textarea className={`${inputCls} min-h-[120px]`} value={draft.terms_text_md} maxLength={20000} placeholder={ph(main?.terms_text_md)} onChange={(e) => set('terms_text_md', e.target.value)} />
        </Field>
        <Field label={t('page.seo')} help={t('page.seoHelp')}>
          <input className={inputCls} value={draft.seo_description} maxLength={300} placeholder={ph(main?.seo_description)} onChange={(e) => set('seo_description', e.target.value)} />
        </Field>
      </div>

      <div className="mt-6"><SaveBar dirty={dirty} saving={saving} onSave={save} label={t('page.saveContent')} msg={msg} /></div>
    </Card>
  );
}

function ListEditor<T>({ title, addLabel, items, max, blank, onChange, render }: {
  title: string; addLabel: string; items: T[]; max: number; blank: T;
  onChange: (v: T[]) => void; render: (item: T, update: (v: T) => void) => ReactNode;
}) {
  return (
    <div className="mt-6">
      <h4 className="font-semibold text-slate-900 mb-2">{title}</h4>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-start gap-2">
            {render(it, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}
            <MoveButtons index={i} count={items.length} onMove={(a, b) => onChange(move(items, a, b))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>
      {items.length < max && (
        <button type="button" className={`${btnSecondary} mt-2`} onClick={() => onChange([...items, { ...blank }])}><Plus className="w-4 h-4" />{addLabel}</button>
      )}
    </div>
  );
}

// ── Layout + theme ───────────────────────────────────────────────────────

function DesignCard({ data, onSaved }: TabProps) {
  const { t } = useTranslation('events');
  const ev = data.event;
  const saved = useMemo(() => ({ layout: ev.layout, theme: ev.theme }), [ev]);
  const [layout, setLayout] = useState<EventLayout>(ev.layout);
  const [theme, setTheme] = useState<EventTheme>(ev.theme);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setLayout(saved.layout); setTheme(saved.theme); }, [saved]);
  const dirty = isDirty({ layout, theme }, saved);
  const media = (f: string | null) => (f ? data.media_base + encodeURIComponent(f) : null);

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await eventsApi.update(ev.id, { layout, theme }));
      setMsg({ ok: true, text: t('common.saved') });
    } catch (e) {
      setMsg({ ok: false, text: errorText(t, e) });
    } finally {
      setSaving(false);
    }
  };

  const sections = layout.sections;
  return (
    <Card title={t('page.sections')} help={t('page.sectionsHelp')}>
      <div className="grid gap-2 sm:grid-cols-2">
        {sections.map((s, i) => (
          <div key={s.key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" checked={s.enabled} onChange={(e) => setLayout({ ...layout, sections: sections.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)) })} />
              <span className="text-slate-400 w-5">{i + 1}.</span>{t(`page.section.${s.key}`)}
            </label>
            <MoveButtons index={i} count={sections.length} onMove={(a, b) => setLayout({ ...layout, sections: move(sections, a, b) })} />
          </div>
        ))}
      </div>

      <h4 className="font-semibold text-slate-900 mt-6 mb-3">{t('page.hero')}</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('page.heroImage')} help={t('page.heroImageHelp')}>
          <div className="flex items-center gap-3">
            {layout.hero.image && <img src={media(layout.hero.image) ?? ''} alt="" className="h-16 w-28 object-cover rounded border border-slate-200" />}
            <UploadButton eventId={ev.id} kind="hero" accept="image/png,image/jpeg,image/webp"
              label={layout.hero.image ? t('common.replace') : undefined}
              onUploaded={(f) => setLayout({ ...layout, hero: { ...layout.hero, image: f } })} />
            {layout.hero.image && <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => setLayout({ ...layout, hero: { ...layout.hero, image: null } })}><Trash2 className="w-4 h-4" /></button>}
          </div>
        </Field>
        <Field label={t('page.videoUrl')}>
          <input className={inputCls} value={layout.hero.video_url ?? ''} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => setLayout({ ...layout, hero: { ...layout.hero, video_url: e.target.value || null } })} />
        </Field>
        <div className="sm:col-span-2">
          <Toggle checked={layout.hero.countdown} onChange={(v) => setLayout({ ...layout, hero: { ...layout.hero, countdown: v } })} label={t('page.countdown')} />
        </div>
      </div>

      <h4 className="font-semibold text-slate-900 mt-6 mb-3">{t('page.partners')}</h4>
      <div className="space-y-2">
        {layout.partners.map((p, i) => {
          const upd = (v: typeof p) => setLayout({ ...layout, partners: layout.partners.map((x, j) => (j === i ? v : x)) });
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              {p.logo && <img src={media(p.logo) ?? ''} alt="" className="h-10 w-16 object-contain rounded border border-slate-200 bg-white" />}
              <UploadButton eventId={ev.id} kind="partner" accept="image/png,image/jpeg,image/webp" label={t('page.partnerLogo')} onUploaded={(f) => upd({ ...p, logo: f })} />
              <input className={`${smallInputCls} w-40`} placeholder={t('page.partnerName')} value={p.name} maxLength={120} onChange={(e) => upd({ ...p, name: e.target.value })} />
              <input className={`${smallInputCls} flex-1 min-w-[12rem]`} placeholder={`${t('page.partnerUrl')} (https://…)`} value={p.url ?? ''} onChange={(e) => upd({ ...p, url: e.target.value || null })} />
              <MoveButtons index={i} count={layout.partners.length}
                onMove={(a, b) => setLayout({ ...layout, partners: move(layout.partners, a, b) })}
                onRemove={() => setLayout({ ...layout, partners: layout.partners.filter((_, j) => j !== i) })} />
            </div>
          );
        })}
      </div>
      {layout.partners.length < 24 && (
        <button type="button" className={`${btnSecondary} mt-2`} onClick={() => setLayout({ ...layout, partners: [...layout.partners, { name: '', logo: null, url: null }] })}>
          <Plus className="w-4 h-4" />{t('page.addPartner')}
        </button>
      )}

      <h4 className="font-semibold text-slate-900 mt-6 mb-3">{t('page.theme')}</h4>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('page.primary')}>
          <div className="flex items-center gap-2">
            <input type="color" className="h-9 w-12 rounded border border-slate-300" value={theme.primary} onChange={(e) => setTheme({ ...theme, primary: e.target.value })} />
            <input className={smallInputCls + ' w-24 font-mono'} value={theme.primary} onChange={(e) => setTheme({ ...theme, primary: e.target.value })} />
          </div>
        </Field>
        <Field label={t('page.accent')}>
          <div className="flex items-center gap-2">
            <input type="color" className="h-9 w-12 rounded border border-slate-300" value={theme.accent} onChange={(e) => setTheme({ ...theme, accent: e.target.value })} />
            <input className={smallInputCls + ' w-24 font-mono'} value={theme.accent} onChange={(e) => setTheme({ ...theme, accent: e.target.value })} />
          </div>
        </Field>
        <Field label={t('page.mode')}>
          <select className={inputCls} value={theme.mode} onChange={(e) => setTheme({ ...theme, mode: e.target.value as 'dark' | 'light' })}>
            <option value="dark">{t('page.modeDark')}</option>
            <option value="light">{t('page.modeLight')}</option>
          </select>
        </Field>
        <Field label={t('page.headingFont')}>
          <select className={inputCls} value={theme.heading_font ?? ''} onChange={(e) => setTheme({ ...theme, heading_font: e.target.value || null })}>
            <option value="">{t('page.defaultFont')}</option>
            {data.fonts.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          {theme.heading_font && (
            <div className="mt-1 text-xl text-slate-800 truncate" style={{ fontFamily: `"${theme.heading_font}"` }}>{data.contents[ev.main_language]?.title || 'Aa Bb Cc'}</div>
          )}
        </Field>
        <Field label={t('page.logo')} wide>
          <div className="flex items-center gap-3">
            {theme.logo && <img src={media(theme.logo) ?? ''} alt="" className="h-12 max-w-[10rem] object-contain rounded border border-slate-200 p-1" style={{ background: theme.mode === 'dark' ? '#0f172a' : '#fff' }} />}
            <UploadButton eventId={ev.id} kind="logo" accept="image/png,image/jpeg,image/webp" label={theme.logo ? t('common.replace') : undefined} onUploaded={(f) => setTheme({ ...theme, logo: f })} />
            {theme.logo && <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => setTheme({ ...theme, logo: null })}><Trash2 className="w-4 h-4" /></button>}
          </div>
        </Field>
      </div>

      <div className="mt-6"><SaveBar dirty={dirty} saving={saving} onSave={save} label={t('page.saveDesign')} msg={msg} /></div>
    </Card>
  );
}
