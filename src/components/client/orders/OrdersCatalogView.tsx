import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, ImageOff, Minus, Package, Plus, ShoppingCart, Trash2, Truck, X } from 'lucide-react';
import { ordersApi, OrdersApiError } from '../../../lib/ordersApi';
import { formatMoney, isoDayFromNow, mediaUrl, pickText, rentalDays } from '../../../lib/ordersFormat';
import type { OrderCategory, OrderContact, OrderKind, OrderMode, OrderProduct } from '../../../types/orders';
import { OrderMarkdown } from '../../orders/OrderMarkdown';

// /my/orders/equipment (kind=sale) and /my/orders/rental (kind=rent).
// Memory: project_studio_commandes_equipment_orders.

type Basket = { qty: Record<number, number>; start: string; end: string };
const EMPTY_BASKET: Basket = { qty: {}, start: '', end: '' };
const storageKey = (kind: OrderKind) => `th_orders_basket_${kind}`;

function loadBasket(kind: OrderKind): Basket {
  try {
    const raw = localStorage.getItem(storageKey(kind));
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object' && v.qty) return { ...EMPTY_BASKET, ...v };
  } catch {
    /* storage unavailable */
  }
  return EMPTY_BASKET;
}

function saveBasket(kind: OrderKind, b: Basket) {
  try {
    localStorage.setItem(storageKey(kind), JSON.stringify(b));
  } catch {
    /* storage unavailable */
  }
}

const unitPrice = (p: OrderProduct, kind: OrderKind) => (kind === 'rent' ? p.rent_price_cents_per_day : p.sale_price_cents) ?? 0;

export function OrdersCatalogView({ kind }: { kind: OrderKind }) {
  const { t, i18n } = useTranslation('orders');
  const lang = i18n.language;
  const [searchParams] = useSearchParams();
  const focusId = Number(searchParams.get('product') || 0);

  const [products, setProducts] = useState<OrderProduct[]>([]);
  const [categories, setCategories] = useState<OrderCategory[]>([]);
  const [profile, setProfile] = useState<OrderContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [basket, setBasket] = useState<Basket>(() => loadBasket(kind));
  const [detail, setDetail] = useState<OrderProduct | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [sentNumber, setSentNumber] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await ordersApi.catalog();
      setProducts(r.products);
      setCategories(r.categories);
      setProfile(r.profile);
    } catch (e) {
      setError(e instanceof OrdersApiError && e.message === 'orders_unavailable' ? t('errors.orders_unavailable') : t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setBasket(loadBasket(kind));
  }, [kind]);

  const updateBasket = (fn: (b: Basket) => Basket) => {
    setBasket((prev) => {
      const next = fn(prev);
      saveBasket(kind, next);
      return next;
    });
  };

  const pageProducts = useMemo(
    () => products.filter((p) => (kind === 'rent' ? p.rent_enabled : p.sale_enabled)),
    [products, kind],
  );
  const byId = useMemo(() => new Map(pageProducts.map((p) => [p.id, p])), [pageProducts]);

  // Drop basket lines whose product disappeared (hidden, deleted, no longer for this mode).
  useEffect(() => {
    if (loading) return;
    const stale = Object.keys(basket.qty).map(Number).filter((id) => !byId.has(id));
    if (stale.length) {
      updateBasket((b) => {
        const qty = { ...b.qty };
        stale.forEach((id) => delete qty[id]);
        return { ...b, qty };
      });
    }
  }, [loading, byId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = useMemo(() => {
    const byName = (a: OrderProduct, b: OrderProduct) =>
      a.sort_order - b.sort_order || pickText(a.name_i18n, lang).localeCompare(pickText(b.name_i18n, lang));
    const cats = [...categories].sort((a, b) => a.sort_order - b.sort_order || pickText(a.name_i18n, lang).localeCompare(pickText(b.name_i18n, lang)));
    const known = new Set(cats.map((c) => c.id));
    const out = cats
      .map((c) => ({ key: String(c.id), title: pickText(c.name_i18n, lang), items: pageProducts.filter((p) => p.category_id === c.id).sort(byName) }))
      .filter((s) => s.items.length > 0);
    const rest = pageProducts.filter((p) => p.category_id == null || !known.has(p.category_id)).sort(byName);
    if (rest.length) out.push({ key: 'none', title: out.length ? t('uncategorized') : '', items: rest });
    return out;
  }, [categories, pageProducts, lang, t]);

  const lines = Object.entries(basket.qty)
    .map(([id, q]) => ({ product: byId.get(Number(id)), qty: q }))
    .filter((l): l is { product: OrderProduct; qty: number } => !!l.product && l.qty > 0);
  const days = kind === 'rent' ? rentalDays(basket.start, basket.end) : 1;
  const total = lines.reduce((s, l) => s + unitPrice(l.product, kind) * l.qty * Math.max(days, kind === 'rent' ? 0 : 1), 0);
  const minStart = isoDayFromNow(1);
  const datesOk = kind === 'sale' || (days > 0 && basket.start >= minStart);

  const setQty = (id: number, q: number) =>
    updateBasket((b) => {
      const qty = { ...b.qty };
      if (q <= 0) delete qty[id];
      else qty[id] = Math.min(999, q);
      return { ...b, qty };
    });

  // Deep link from the other page's "Aussi ..." badge: scroll to + highlight the product.
  const focusRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!loading && focusId && focusRef.current) focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [loading, focusId]);

  const otherPath = kind === 'sale' ? '/my/orders/rental' : '/my/orders/equipment';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          {kind === 'rent' ? <CalendarDays className="w-6 h-6" /> : <Package className="w-6 h-6" />}
          {kind === 'rent' ? t('titleRent') : t('titleSale')}
        </h2>
        <p className="text-slate-600 mt-1 max-w-3xl">{kind === 'rent' ? t('subtitleRent') : t('subtitleSale')}</p>
      </div>

      {notice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start justify-between gap-4">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-amber-700 hover:text-amber-900"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" /></div>
      ) : error ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-600 mb-4">{error}</p>
          <button type="button" onClick={() => void load()} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm">{t('retry')}</button>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 min-w-0 space-y-8">
            {pageProducts.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">{t('empty')}</div>
            ) : (
              sections.map((s) => (
                <section key={s.key}>
                  {s.title && <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">{s.title}</h3>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {s.items.map((p) => (
                      <div key={p.id} ref={p.id === focusId ? focusRef : undefined}>
                        <ProductCard
                          product={p}
                          kind={kind}
                          lang={lang}
                          inBasket={basket.qty[p.id] ?? 0}
                          highlighted={p.id === focusId}
                          otherPath={otherPath}
                          onAdd={() => setQty(p.id, (basket.qty[p.id] ?? 0) + 1)}
                          onOpen={() => setDetail(p)}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>

          <aside className="w-full lg:w-80 lg:sticky lg:top-8 shrink-0 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><ShoppingCart className="w-5 h-5" />{t('basket.title')}</h3>

            {kind === 'rent' && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-600">
                  {t('rent.start')}
                  <input
                    type="date"
                    min={minStart}
                    value={basket.start}
                    onChange={(e) => updateBasket((b) => ({ ...b, start: e.target.value, end: b.end && b.end < e.target.value ? e.target.value : b.end }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  {t('rent.end')}
                  <input
                    type="date"
                    min={basket.start || minStart}
                    value={basket.end}
                    onChange={(e) => updateBasket((b) => ({ ...b, end: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                {days > 0 && <p className="col-span-2 text-xs text-slate-500">{t('basket.days', { count: days })}</p>}
              </div>
            )}

            {lines.length === 0 ? (
              <p className="text-sm text-slate-500">{t('basket.empty')}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lines.map(({ product: p, qty }) => (
                  <li key={p.id} className="py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{pickText(p.name_i18n, lang)}</p>
                      <p className="text-xs text-slate-500">
                        {kind === 'rent' ? t('pricePerDay', { price: formatMoney(unitPrice(p, kind), lang) }) : t('priceHt', { price: formatMoney(unitPrice(p, kind), lang) })}
                      </p>
                    </div>
                    <QtyStepper value={qty} onChange={(q) => setQty(p.id, q)} />
                    <button type="button" onClick={() => setQty(p.id, 0)} className="text-slate-400 hover:text-rose-600" title={t('basket.remove')}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {lines.length > 0 && (
              <div className="border-t border-slate-200 pt-3 space-y-1">
                {kind === 'rent' && days === 0 ? (
                  <p className="text-xs text-slate-500">{t('basket.datesHint')}</p>
                ) : (
                  <p className="flex justify-between text-sm font-semibold text-slate-900">
                    <span>{t('basket.estimate')}</span>
                    <span>{formatMoney(total, lang)}</span>
                  </p>
                )}
                <p className="text-xs text-slate-500">{t('basket.note')}</p>
              </div>
            )}

            <button
              type="button"
              disabled={lines.length === 0 || !datesOk}
              onClick={() => setSubmitOpen(true)}
              className="w-full px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('basket.send')}
            </button>
          </aside>
        </div>
      )}

      {detail && (
        <ProductDetailModal
          product={detail}
          kind={kind}
          lang={lang}
          inBasket={basket.qty[detail.id] ?? 0}
          otherPath={otherPath}
          onAdd={() => setQty(detail.id, (basket.qty[detail.id] ?? 0) + 1)}
          onClose={() => setDetail(null)}
        />
      )}

      {submitOpen && profile && (
        <SubmitModal
          kind={kind}
          profile={profile}
          basket={basket}
          lines={lines}
          lang={lang}
          onClose={() => setSubmitOpen(false)}
          onSent={(number) => {
            setSubmitOpen(false);
            updateBasket(() => EMPTY_BASKET);
            setSentNumber(number);
          }}
          onUnavailable={() => {
            setSubmitOpen(false);
            setNotice(t('errors.product_unavailable'));
            void load();
          }}
        />
      )}

      {sentNumber && <SentModal number={sentNumber} onClose={() => setSentNumber(null)} />}
    </div>
  );
}

function QtyStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center rounded-lg border border-slate-300">
      <button type="button" onClick={() => onChange(value - 1)} className="px-1.5 py-1 text-slate-500 hover:text-slate-900"><Minus className="w-3.5 h-3.5" /></button>
      <input
        type="number"
        min={1}
        max={999}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="w-10 text-center text-sm border-0 p-0 focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => onChange(value + 1)} className="px-1.5 py-1 text-slate-500 hover:text-slate-900"><Plus className="w-3.5 h-3.5" /></button>
    </div>
  );
}

function CrossBadge({ product, kind, lang, otherPath }: { product: OrderProduct; kind: OrderKind; lang: string; otherPath: string }) {
  const { t } = useTranslation('orders');
  if (kind === 'sale' && product.rent_enabled && product.rent_price_cents_per_day != null) {
    return (
      <Link to={`${otherPath}?product=${product.id}`} className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100">
        <CalendarDays className="w-3.5 h-3.5" />
        {t('alsoRent', { price: formatMoney(product.rent_price_cents_per_day, lang) })}
        <ArrowRight className="w-3 h-3" />
      </Link>
    );
  }
  if (kind === 'rent' && product.sale_enabled && product.sale_price_cents != null) {
    return (
      <Link to={`${otherPath}?product=${product.id}`} className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2.5 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100">
        <Package className="w-3.5 h-3.5" />
        {t('alsoSale', { price: formatMoney(product.sale_price_cents, lang) })}
        <ArrowRight className="w-3 h-3" />
      </Link>
    );
  }
  return null;
}

function priceLabel(p: OrderProduct, kind: OrderKind, lang: string, t: (k: string, o?: Record<string, unknown>) => string) {
  return kind === 'rent'
    ? t('pricePerDay', { price: formatMoney(p.rent_price_cents_per_day ?? 0, lang) })
    : t('priceHt', { price: formatMoney(p.sale_price_cents ?? 0, lang) });
}

function ProductCard({ product: p, kind, lang, inBasket, highlighted, otherPath, onAdd, onOpen }: {
  product: OrderProduct; kind: OrderKind; lang: string; inBasket: number; highlighted: boolean; otherPath: string;
  onAdd: () => void; onOpen: () => void;
}) {
  const { t } = useTranslation('orders');
  const cover = p.images[0];
  const description = pickText(kind === 'rent' ? p.rent_description_i18n : p.sale_description_i18n, lang);
  return (
    <div className={`h-full flex flex-col rounded-xl border bg-white overflow-hidden transition-shadow ${highlighted ? 'border-amber-400 ring-2 ring-amber-300' : 'border-slate-200'}`}>
      <button type="button" onClick={onOpen} className="aspect-[4/3] bg-slate-100 flex items-center justify-center overflow-hidden">
        {cover ? (
          <img src={mediaUrl(cover.url)} alt="" className="w-full h-full object-contain" loading="lazy" />
        ) : (
          <span className="flex flex-col items-center text-slate-400 text-xs gap-1"><ImageOff className="w-6 h-6" />{t('noPhoto')}</span>
        )}
      </button>
      <div className="flex-1 flex flex-col p-4 gap-2">
        <button type="button" onClick={onOpen} className="text-left">
          <h4 className="font-semibold text-slate-900 hover:underline">{pickText(p.name_i18n, lang)}</h4>
          {p.sku && <p className="text-xs text-slate-400">{p.sku}</p>}
        </button>
        <p className="text-base font-semibold text-slate-900">{priceLabel(p, kind, lang, t)}</p>
        {description && (
          <div className="relative max-h-16 overflow-hidden">
            <OrderMarkdown source={description} />
            <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white" />
          </div>
        )}
        <div><CrossBadge product={p} kind={kind} lang={lang} otherPath={otherPath} /></div>
        <div className="mt-auto pt-2 flex items-center justify-between gap-2">
          <button type="button" onClick={onOpen} className="text-sm text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline">{t('details')}</button>
          <div className="flex items-center gap-2">
            {inBasket > 0 && <span className="text-xs text-emerald-700">{t('inBasket', { count: inBasket })}</span>}
            <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800">
              <Plus className="w-4 h-4" />{t('add')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductDetailModal({ product: p, kind, lang, inBasket, otherPath, onAdd, onClose }: {
  product: OrderProduct; kind: OrderKind; lang: string; inBasket: number; otherPath: string; onAdd: () => void; onClose: () => void;
}) {
  const { t } = useTranslation('orders');
  const [idx, setIdx] = useState(0);
  const img = p.images[idx];
  const description = pickText(kind === 'rent' ? p.rent_description_i18n : p.sale_description_i18n, lang);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{pickText(p.name_i18n, lang)}</h3>
            {p.sku && <p className="text-xs text-slate-400">{p.sku}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 grid md:grid-cols-2 gap-5">
          <div>
            <div className="relative aspect-[4/3] bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden">
              {img ? <img src={mediaUrl(img.url)} alt="" className="w-full h-full object-contain" /> : <ImageOff className="w-8 h-8 text-slate-400" />}
              {p.images.length > 1 && (
                <>
                  <button type="button" onClick={() => setIdx((idx - 1 + p.images.length) % p.images.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full p-1"><ChevronLeft className="w-5 h-5" /></button>
                  <button type="button" onClick={() => setIdx((idx + 1) % p.images.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full p-1"><ChevronRight className="w-5 h-5" /></button>
                </>
              )}
            </div>
            {p.images.length > 1 && (
              <div className="flex gap-2 mt-2 overflow-x-auto">
                {p.images.map((im, i) => (
                  <button key={im.file} type="button" onClick={() => setIdx(i)} className={`w-14 h-14 rounded border shrink-0 overflow-hidden ${i === idx ? 'border-slate-900' : 'border-slate-200'}`}>
                    <img src={mediaUrl(im.url)} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3">
            <p className="text-lg font-semibold text-slate-900">{priceLabel(p, kind, lang, t)}</p>
            <CrossBadge product={p} kind={kind} lang={lang} otherPath={otherPath} />
            <OrderMarkdown source={description} />
            <div className="flex items-center gap-3 pt-2">
              <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800">
                <Plus className="w-4 h-4" />{t('add')}
              </button>
              {inBasket > 0 && <span className="text-sm text-emerald-700">{t('inBasket', { count: inBasket })}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type FieldKey = keyof OrderContact | 'message' | 'pickup_mode' | 'return_mode';

function SubmitModal({ kind, profile, basket, lines, lang, onClose, onSent, onUnavailable }: {
  kind: OrderKind; profile: OrderContact; basket: Basket; lines: { product: OrderProduct; qty: number }[]; lang: string;
  onClose: () => void; onSent: (number: string) => void; onUnavailable: () => void;
}) {
  const { t } = useTranslation('orders');
  const [form, setForm] = useState<Record<FieldKey, string>>({
    company: profile.company ?? '', contact_name: profile.contact_name ?? '', contact_email: profile.contact_email ?? '',
    contact_phone: profile.contact_phone ?? '', address_line1: profile.address_line1 ?? '', address_line2: profile.address_line2 ?? '',
    postal_code: profile.postal_code ?? '', city: profile.city ?? '', country: profile.country ?? '', message: '',
    pickup_mode: 'post', return_mode: 'post',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [generic, setGeneric] = useState<string | null>(null);
  const set = (k: FieldKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setErrors({});
    setGeneric(null);
    try {
      const req = await ordersApi.submit({
        kind,
        lang,
        lines: lines.map((l) => ({ product_id: l.product.id, quantity: l.qty })),
        ...(kind === 'rent' ? { rent_start: basket.start, rent_end: basket.end, pickup_mode: form.pickup_mode as OrderMode, return_mode: form.return_mode as OrderMode } : {}),
        company: form.company || null, contact_name: form.contact_name || null, contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null, address_line1: form.address_line1 || null, address_line2: form.address_line2 || null,
        postal_code: form.postal_code || null, city: form.city || null, country: form.country || null, message: form.message || undefined,
      });
      onSent(req.number);
    } catch (err) {
      if (err instanceof OrdersApiError && err.message === 'product_unavailable') return onUnavailable();
      if (err instanceof OrdersApiError && err.message === 'validation') {
        setErrors(err.errors);
        setGeneric(t('form.fixErrors'));
      } else {
        setGeneric(t('errors.generic'));
      }
    } finally {
      setSending(false);
    }
  };

  const field = (k: FieldKey, label: string, opts: { type?: string; className?: string } = {}) => (
    <label className={`text-sm text-slate-700 ${opts.className ?? ''}`}>
      {label}
      <input
        type={opts.type ?? 'text'}
        value={form[k]}
        onChange={set(k)}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${errors[k] ? 'border-rose-400' : 'border-slate-300'}`}
      />
      {errors[k] && <span className="text-xs text-rose-600">{errors[k] === 'required' ? t('form.required') : t('form.invalid')}</span>}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">{t('form.title')}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-5">
          {kind === 'rent' && (
            <div className="grid sm:grid-cols-2 gap-3">
              {(['pickup_mode', 'return_mode'] as const).map((k) => (
                <label key={k} className="text-sm text-slate-700">
                  <span className="flex items-center gap-1"><Truck className="w-4 h-4" />{k === 'pickup_mode' ? t('rent.pickup') : t('rent.return')}</span>
                  <select value={form[k]} onChange={set(k)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="post">{t('mode.post')}</option>
                    <option value="in_person">{t('mode.in_person')}</option>
                  </select>
                </label>
              ))}
            </div>
          )}
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-2">{t('form.contactTitle')}</h4>
            <div className="grid sm:grid-cols-2 gap-3">
              {field('company', t('form.company'))}
              {field('contact_name', t('form.contactName'))}
              {field('contact_email', t('form.contactEmail'), { type: 'email' })}
              {field('contact_phone', t('form.contactPhone'), { type: 'tel' })}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">{t('form.addressTitle')}</h4>
            <p className="text-xs text-slate-500 mb-2">{t('form.addressHint')}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {field('address_line1', t('form.address1'), { className: 'sm:col-span-2' })}
              {field('address_line2', t('form.address2'), { className: 'sm:col-span-2' })}
              {field('postal_code', t('form.postalCode'))}
              {field('city', t('form.city'))}
              {field('country', t('form.country'))}
            </div>
          </div>
          <label className="block text-sm text-slate-700">
            {t('form.message')}
            <textarea value={form.message} onChange={set('message')} rows={3} maxLength={4000} placeholder={t('form.messagePlaceholder')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          {(errors.rent_start || errors.rent_end) && <p className="text-sm text-rose-600">{t('basket.datesHint')}</p>}
          {errors.lines && <p className="text-sm text-rose-600">{t('basket.empty')}</p>}
          {generic && <p className="text-sm text-rose-600">{generic}</p>}
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-200">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">{t('form.cancel')}</button>
          <button type="submit" disabled={sending} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50">
            {sending ? t('form.sending') : t('form.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}

function SentModal({ number, onClose }: { number: string; onClose: () => void }) {
  const { t } = useTranslation('orders');
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">{t('sent.title')}</h3>
        <p className="text-sm text-slate-600">{t('sent.body', { number })}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">{t('sent.close')}</button>
          <button type="button" onClick={() => navigate('/my/orders/requests')} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm">{t('sent.view')}</button>
        </div>
      </div>
    </div>
  );
}
