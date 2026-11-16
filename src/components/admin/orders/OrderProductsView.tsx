import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, ImageOff, ImagePlus, Mail, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { ordersApi, OrdersApiError } from '../../../lib/ordersApi';
import { centsToInput, formatMoney, mediaUrl, parseEuros, pickText } from '../../../lib/ordersFormat';
import type { I18nText, OrderApp, OrderCategory, OrderLang, OrderProduct } from '../../../types/orders';
import { OrderMarkdown } from '../../orders/OrderMarkdown';
import { StockNotice } from './StockNotice';

// Admin > Commandes > Produits: catalogue, categories and notification emails.
// Memory: project_studio_commandes_equipment_orders.

const LANGS: OrderLang[] = ['fr', 'en', 'es'];
const APPS: { id: OrderApp; label: string }[] = [
  { id: 'playground', label: 'Playground' },
  { id: 'go', label: 'GO' },
  { id: 'spot', label: 'Spot' },
];
const emptyI18n = (): I18nText => ({ fr: null, en: null, es: null });
const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

export function OrderProductsView() {
  const [products, setProducts] = useState<OrderProduct[]>([]);
  const [categories, setCategories] = useState<OrderCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<OrderProduct | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await ordersApi.adminProducts();
      setProducts(r.products);
      setCategories(r.categories);
      setError(null);
    } catch (e) {
      setError(e instanceof OrdersApiError && e.message === 'orders_unavailable'
        ? 'Orders tables are missing: run backend/database/add_orders_equipment.sql.'
        : 'Could not load products.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const catName = (id: number | null) => (id == null ? '-' : pickText(categories.find((c) => c.id === id)?.name_i18n, 'fr') || '-');

  const sorted = useMemo(
    () => [...products].sort((a, b) => a.sort_order - b.sort_order || pickText(a.name_i18n, 'fr').localeCompare(pickText(b.name_i18n, 'fr'))),
    [products],
  );

  const toggleVisible = async (p: OrderProduct) => {
    const saved = await ordersApi.productSave({ ...p, visible: !p.visible });
    setProducts((list) => list.map((x) => (x.id === saved.id ? saved : x)));
  };

  const remove = async (p: OrderProduct) => {
    if (!window.confirm(`Delete "${pickText(p.name_i18n, 'fr')}"? Past requests keep their copy of the name and price.`)) return;
    await ordersApi.productDelete(p.id);
    setProducts((list) => list.filter((x) => x.id !== p.id));
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" /></div>;
  if (error) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-800">{error}</div>;

  return (
    <div className="space-y-6">
      <StockNotice />

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div>
            <h3 className="font-semibold text-slate-900">Products</h3>
            <p className="text-xs text-slate-500">Prices are in EUR excl. VAT. A licensee sees a product if one of its ticked apps is enabled for them (none ticked = everyone).</p>
          </div>
          <button type="button" onClick={() => setEditing('new')} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm">
            <Plus className="w-4 h-4" />New product
          </button>
        </div>
        {sorted.length === 0 ? (
          <p className="p-8 text-center text-slate-500 text-sm">No products yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium" />
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium text-right">Sale</th>
                  <th className="px-4 py-2 font-medium text-right">Rent / day</th>
                  <th className="px-4 py-2 font-medium">Apps</th>
                  <th className="px-4 py-2 font-medium text-right">Order</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((p) => (
                  <tr key={p.id} className={p.visible ? '' : 'opacity-50'}>
                    <td className="px-4 py-2">
                      <div className="w-12 h-12 rounded bg-slate-100 overflow-hidden flex items-center justify-center">
                        {p.images[0] ? <img src={mediaUrl(p.images[0].url)} alt="" className="w-full h-full object-cover" /> : <ImageOff className="w-4 h-4 text-slate-400" />}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <button type="button" onClick={() => setEditing(p)} className="font-medium text-slate-900 hover:underline text-left">{pickText(p.name_i18n, 'fr')}</button>
                      {p.sku && <span className="block text-xs text-slate-400">{p.sku}</span>}
                      <span className="block text-xs text-slate-400">
                        {LANGS.filter((l) => p.name_i18n[l]).map((l) => l.toUpperCase()).join(' · ')}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{catName(p.category_id)}</td>
                    <td className="px-4 py-2 text-right">{p.sale_enabled && p.sale_price_cents != null ? formatMoney(p.sale_price_cents, 'fr') : <span className="text-slate-300">-</span>}</td>
                    <td className="px-4 py-2 text-right">{p.rent_enabled && p.rent_price_cents_per_day != null ? formatMoney(p.rent_price_cents_per_day, 'fr') : <span className="text-slate-300">-</span>}</td>
                    <td className="px-4 py-2">
                      {p.apps.length === 0 ? <span className="text-xs text-slate-500">All</span> : (
                        <div className="flex flex-wrap gap-1">
                          {p.apps.map((a) => <span key={a} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{APPS.find((x) => x.id === a)?.label}</span>)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600">{p.sort_order}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2 text-slate-500">
                        <button type="button" title={p.visible ? 'Visible - click to hide' : 'Hidden - click to show'} onClick={() => void toggleVisible(p)} className="hover:text-slate-900">
                          {p.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button type="button" title="Edit" onClick={() => setEditing(p)} className="hover:text-slate-900"><Pencil className="w-4 h-4" /></button>
                        <button type="button" title="Delete" onClick={() => void remove(p)} className="hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <CategoriesCard categories={categories} onChange={setCategories} />
        <NotifyEmailsCard />
      </div>

      {editing && (
        <ProductEditor
          product={editing === 'new' ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setProducts((list) => (list.some((x) => x.id === saved.id) ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved]));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function LangTabs({ value, onChange, filled }: { value: OrderLang; onChange: (l: OrderLang) => void; filled: (l: OrderLang) => boolean }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
      {LANGS.map((l) => (
        <button key={l} type="button" onClick={() => onChange(l)}
          className={`px-3 py-1.5 text-xs font-medium ${value === l ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
          {l.toUpperCase()}{l === 'fr' ? ' *' : ''}{filled(l) ? '' : ' ·'}
        </button>
      ))}
    </div>
  );
}

function ProductEditor({ product, categories, onClose, onSaved }: {
  product: OrderProduct | null; categories: OrderCategory[]; onClose: () => void; onSaved: (p: OrderProduct) => void;
}) {
  const [lang, setLang] = useState<OrderLang>('fr');
  const [name, setName] = useState<I18nText>(product?.name_i18n ?? emptyI18n());
  const [saleDesc, setSaleDesc] = useState<I18nText>(product?.sale_description_i18n ?? emptyI18n());
  const [rentDesc, setRentDesc] = useState<I18nText>(product?.rent_description_i18n ?? emptyI18n());
  const [sku, setSku] = useState(product?.sku ?? '');
  const [categoryId, setCategoryId] = useState<string>(product?.category_id ? String(product.category_id) : '');
  const [sortOrder, setSortOrder] = useState(String(product?.sort_order ?? 0));
  const [saleEnabled, setSaleEnabled] = useState(product?.sale_enabled ?? true);
  const [salePrice, setSalePrice] = useState(centsToInput(product?.sale_price_cents));
  const [rentEnabled, setRentEnabled] = useState(product?.rent_enabled ?? false);
  const [rentPrice, setRentPrice] = useState(centsToInput(product?.rent_price_cents_per_day));
  const [apps, setApps] = useState<OrderApp[]>(product?.apps ?? []);
  const [visible, setVisible] = useState(product?.visible ?? true);
  const [images, setImages] = useState(product?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const setI18n = (setter: React.Dispatch<React.SetStateAction<I18nText>>) => (v: string) => setter((m) => ({ ...m, [lang]: v === '' ? null : v }));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setErr(null);
    try {
      for (const f of Array.from(files)) {
        const r = await ordersApi.productUpload(f);
        setImages((list) => [...list, r]);
      }
    } catch (e) {
      setErr(e instanceof OrdersApiError ? `Upload failed: ${e.message}` : 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const move = (i: number, d: -1 | 1) => setImages((list) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const save = async () => {
    setErr(null);
    const sp = parseEuros(salePrice);
    const rp = parseEuros(rentPrice);
    if (!name.fr?.trim()) return setErr('The French name is required.');
    if (!saleEnabled && !rentEnabled) return setErr('Enable "For sale" and/or "For rent".');
    if (saleEnabled && sp == null) return setErr('Enter a sale price.');
    if (rentEnabled && rp == null) return setErr('Enter a rental price per day.');
    setSaving(true);
    try {
      const saved = await ordersApi.productSave({
        ...(product ? { id: product.id } : {}),
        name_i18n: name, sale_description_i18n: saleDesc, rent_description_i18n: rentDesc,
        sku: sku.trim() || null, category_id: categoryId ? Number(categoryId) : null, sort_order: Number(sortOrder) || 0,
        sale_enabled: saleEnabled, sale_price_cents: sp, rent_enabled: rentEnabled, rent_price_cents_per_day: rp,
        apps, visible, images,
      });
      onSaved(saved);
    } catch (e) {
      setErr(e instanceof OrdersApiError ? `Save failed: ${e.message} ${Object.entries(e.errors).map(([k, v]) => `${k}: ${v}`).join(', ')}` : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const descBox = (label: string, value: I18nText, setter: React.Dispatch<React.SetStateAction<I18nText>>) => (
    <label className="block text-sm text-slate-700">
      {label} ({lang.toUpperCase()})
      {preview ? (
        <div className="mt-1 min-h-[7rem] rounded-lg border border-slate-200 bg-slate-50 p-3">
          <OrderMarkdown source={value[lang] ?? ''} />
        </div>
      ) : (
        <textarea value={value[lang] ?? ''} onChange={(e) => setI18n(setter)(e.target.value)} rows={5} maxLength={8000}
          placeholder={lang !== 'fr' && value.fr ? 'Empty = French text is shown' : 'Markdown: **bold**, - list, [link](https://…)'} className={`mt-1 ${inputCls} font-mono`} />
      )}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">{product ? 'Edit product' : 'New product'}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-6 overflow-y-auto">
          <div className="grid md:grid-cols-4 gap-3">
            <label className="text-sm text-slate-700">SKU / reference
              <input value={sku} onChange={(e) => setSku(e.target.value)} maxLength={60} className={`mt-1 ${inputCls}`} />
            </label>
            <label className="text-sm text-slate-700">Category
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`mt-1 ${inputCls}`}>
                <option value="">- None -</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{pickText(c.name_i18n, 'fr')}</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-700">Order (lower first)
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className={`mt-1 ${inputCls}`} />
            </label>
            <label className="text-sm text-slate-700 flex items-center gap-2 md:mt-6">
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />Visible to licensees
            </label>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Restrict to apps <span className="font-normal text-slate-500">(none ticked = every licensee)</span></p>
            <div className="flex gap-4">
              {APPS.map((a) => (
                <label key={a.id} className="text-sm text-slate-700 flex items-center gap-2">
                  <input type="checkbox" checked={apps.includes(a.id)} onChange={(e) => setApps((list) => (e.target.checked ? [...list, a.id] : list.filter((x) => x !== a.id)))} />
                  {a.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <LangTabs value={lang} onChange={setLang} filled={(l) => !!name[l]} />
              <label className="text-xs text-slate-600 flex items-center gap-1">
                <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />Preview descriptions
              </label>
            </div>
            <label className="block text-sm text-slate-700">Name ({lang.toUpperCase()}){lang === 'fr' ? ' *' : ''}
              <input value={name[lang] ?? ''} onChange={(e) => setI18n(setName)(e.target.value)} maxLength={190}
                placeholder={lang !== 'fr' && name.fr ? name.fr : ''} className={`mt-1 ${inputCls}`} />
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className={`rounded-lg border p-4 space-y-3 ${saleEnabled ? 'border-slate-300' : 'border-slate-200 bg-slate-50'}`}>
              <label className="flex items-center gap-2 font-medium text-slate-900">
                <input type="checkbox" checked={saleEnabled} onChange={(e) => setSaleEnabled(e.target.checked)} />
                For sale <span className="text-xs font-normal text-slate-500">(Matériel supplémentaire & back up)</span>
              </label>
              <label className="block text-sm text-slate-700">Price excl. VAT (€)
                <input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} inputMode="decimal" disabled={!saleEnabled} className={`mt-1 ${inputCls}`} />
              </label>
              {descBox('Sale description', saleDesc, setSaleDesc)}
            </div>
            <div className={`rounded-lg border p-4 space-y-3 ${rentEnabled ? 'border-slate-300' : 'border-slate-200 bg-slate-50'}`}>
              <label className="flex items-center gap-2 font-medium text-slate-900">
                <input type="checkbox" checked={rentEnabled} onChange={(e) => setRentEnabled(e.target.checked)} />
                For rent <span className="text-xs font-normal text-slate-500">(Location de matériel)</span>
              </label>
              <label className="block text-sm text-slate-700">Price per day excl. VAT (€)
                <input value={rentPrice} onChange={(e) => setRentPrice(e.target.value)} inputMode="decimal" disabled={!rentEnabled} className={`mt-1 ${inputCls}`} />
              </label>
              {descBox('Rental description', rentDesc, setRentDesc)}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-slate-700">Photos <span className="font-normal text-slate-500">(first = cover; PNG/JPEG/WebP, max 8 MB)</span></p>
              <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm disabled:opacity-50">
                <ImagePlus className="w-4 h-4" />{uploading ? 'Uploading…' : 'Add photos'}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => void upload(e.target.files)} />
            </div>
            {images.length === 0 ? (
              <p className="text-sm text-slate-500">No photo.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {images.map((im, i) => (
                  <div key={im.file} className={`relative w-28 rounded-lg border overflow-hidden ${i === 0 ? 'border-slate-900' : 'border-slate-200'}`}>
                    <img src={mediaUrl(im.url)} alt="" className="w-28 h-24 object-cover" />
                    <div className="flex items-center justify-between px-1 py-0.5 bg-white text-slate-500">
                      <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="disabled:opacity-30"><ArrowLeft className="w-4 h-4" /></button>
                      <button type="button" onClick={() => setImages((l) => l.filter((_, k) => k !== i))} className="hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                      <button type="button" disabled={i === images.length - 1} onClick={() => move(i, 1)} className="disabled:opacity-30"><ArrowRight className="w-4 h-4" /></button>
                    </div>
                    {i === 0 && <span className="absolute top-1 left-1 rounded bg-slate-900 text-white text-[10px] px-1">Cover</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-200">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Cancel</button>
          <button type="button" disabled={saving || uploading} onClick={() => void save()} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50">
            <Save className="w-4 h-4" />{saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoriesCard({ categories, onChange }: { categories: OrderCategory[]; onChange: (c: OrderCategory[]) => void }) {
  const [editing, setEditing] = useState<{ id?: number; name: I18nText; sort_order: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!editing) return;
    if (!editing.name.fr?.trim()) return setErr('The French name is required.');
    try {
      const saved = await ordersApi.categorySave({ id: editing.id, name_i18n: editing.name, sort_order: Number(editing.sort_order) || 0 });
      onChange(categories.some((c) => c.id === saved.id) ? categories.map((c) => (c.id === saved.id ? saved : c)) : [...categories, saved]);
      setEditing(null);
      setErr(null);
    } catch {
      setErr('Save failed.');
    }
  };

  const remove = async (c: OrderCategory) => {
    if (!window.confirm(`Delete category "${pickText(c.name_i18n, 'fr')}"? Its products move to "no category".`)) return;
    await ordersApi.categoryDelete(c.id);
    onChange(categories.filter((x) => x.id !== c.id));
  };

  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order || pickText(a.name_i18n, 'fr').localeCompare(pickText(b.name_i18n, 'fr')));

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        <div>
          <h3 className="font-semibold text-slate-900">Categories</h3>
          <p className="text-xs text-slate-500">Sections on both licensee pages. Empty sections are hidden.</p>
        </div>
        <button type="button" onClick={() => setEditing({ name: emptyI18n(), sort_order: '0' })} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm">
          <Plus className="w-4 h-4" />Add
        </button>
      </div>
      <ul className="divide-y divide-slate-100">
        {sorted.length === 0 && !editing && <li className="p-4 text-sm text-slate-500">No categories.</li>}
        {sorted.map((c) => (
          <li key={c.id} className="flex items-center justify-between px-4 py-2 text-sm">
            <span>
              <span className="text-slate-400 mr-2">{c.sort_order}</span>
              {pickText(c.name_i18n, 'fr')}
              <span className="text-xs text-slate-400 ml-2">{LANGS.filter((l) => c.name_i18n[l]).map((l) => l.toUpperCase()).join(' · ')}</span>
            </span>
            <span className="flex gap-2 text-slate-500">
              <button type="button" onClick={() => setEditing({ id: c.id, name: c.name_i18n, sort_order: String(c.sort_order) })} className="hover:text-slate-900"><Pencil className="w-4 h-4" /></button>
              <button type="button" onClick={() => void remove(c)} className="hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
            </span>
          </li>
        ))}
      </ul>
      {editing && (
        <div className="border-t border-slate-200 p-4 space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {LANGS.map((l) => (
              <input key={l} value={editing.name[l] ?? ''} placeholder={`Name ${l.toUpperCase()}${l === 'fr' ? ' *' : ''}`}
                onChange={(e) => setEditing({ ...editing, name: { ...editing.name, [l]: e.target.value || null } })} className={inputCls} />
            ))}
            <input type="number" value={editing.sort_order} title="Order" onChange={(e) => setEditing({ ...editing, sort_order: e.target.value })} className={inputCls} />
          </div>
          {err && <p className="text-sm text-rose-600">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setEditing(null); setErr(null); }} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">Cancel</button>
            <button type="button" onClick={() => void save()} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

function NotifyEmailsCard() {
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    ordersApi.settings().then((list) => setText(list.join('\n'))).catch(() => setErr('Could not load.'));
  }, []);

  const save = async () => {
    setState('saving');
    setErr(null);
    try {
      const list = await ordersApi.settingsSave(text.split(/[\s,;]+/).filter(Boolean));
      setText(list.join('\n'));
      setState('saved');
    } catch (e) {
      setState('error');
      setErr(e instanceof OrdersApiError && e.errors.notify_emails === 'required' ? 'At least one address is required.' : 'Invalid address in the list.');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="p-4 border-b border-slate-200">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Mail className="w-4 h-4" />Notification emails</h3>
        <p className="text-xs text-slate-500">Who receives an email for each new or cancelled request. One address per line.</p>
      </div>
      <div className="p-4 space-y-2">
        <textarea value={text} onChange={(e) => { setText(e.target.value); setState('idle'); }} rows={4} className={`${inputCls} font-mono`} />
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex items-center justify-end gap-3">
          {state === 'saved' && <span className="text-sm text-emerald-700">Saved</span>}
          <button type="button" disabled={state === 'saving'} onClick={() => void save()} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}
