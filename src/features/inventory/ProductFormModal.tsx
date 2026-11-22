import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { ImagePlus, LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Product, ProductVariant } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';

interface VariantDraft {
  id?: string;
  sku: string;
  color: string;
  size: string;
  unit_cost_price: string;
  unit_sell_price: string;
  stock_qty: number;
  image_url: string;
  adjustment: string;
}
interface ProductFormModalProps {
  product: Product | null;
  variants: ProductVariant[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '-').replace(/^-|-$/g, '') || 'product';
const normalizeTags = (values: string[]) => [...new Map(values.map((value) => value.trim()).filter(Boolean).map((value) => [value.toLocaleLowerCase(), value])).values()];
const tagPresets = ['tagCrossbody', 'tagChunky', 'tagLeather', 'tagMultiPocket', 'tagPlatform', 'tagCasual', 'tagClassic', 'tagDaily'] as const;
const uniqueUrls = (urls: string[]) => [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
function newVariant(productName: string): VariantDraft {
  return { sku: `${slug(productName).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`, color: '', size: '', unit_cost_price: '', unit_sell_price: '', stock_qty: 0, image_url: '', adjustment: '0' };
}

export function ProductFormModal({ product, variants, onClose, onSaved }: ProductFormModalProps) {
  const { t, dir, lang, formatCurrency } = useTranslation();
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [category, setCategory] = useState<'sneakers' | 'bags'>(product?.category === 'bags' ? 'bags' : 'sneakers');
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [bestSeller, setBestSeller] = useState(product?.is_best_seller ?? false);
  const [compareAtPrice, setCompareAtPrice] = useState(product?.compare_at_price == null ? '' : String(product.compare_at_price));
  const [active, setActive] = useState(product?.is_active ?? true);
  const [tags, setTags] = useState<string[]>(normalizeTags(product?.style_tags ?? []));
  const [tagInput, setTagInput] = useState('');
  const [primaryImage, setPrimaryImage] = useState(product?.image_url ?? product?.image_urls[0] ?? '');
  const [galleryImages, setGalleryImages] = useState<string[]>(product?.gallery_urls?.length ? product.gallery_urls : product?.image_urls.slice(1) ?? []);
  const [galleryUrlInput, setGalleryUrlInput] = useState('');
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [drafts, setDrafts] = useState<VariantDraft[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDrafts(variants.map((variant) => ({
      id: variant.id, sku: variant.sku, color: variant.color ?? '', size: variant.size ?? '',
      unit_cost_price: String(variant.unit_cost_price), unit_sell_price: String(variant.unit_sell_price),
      stock_qty: variant.stock_qty, image_url: variant.image_url ?? '', adjustment: '0',
    })));
    setTags(normalizeTags(product?.style_tags ?? []));
    setBrand(product?.brand ?? '');
    setBestSeller(product?.is_best_seller ?? false);
    setCompareAtPrice(product?.compare_at_price == null ? '' : String(product.compare_at_price));
    const primary = product?.image_url ?? product?.image_urls[0] ?? '';
    setPrimaryImage(primary);
    setGalleryImages(uniqueUrls(product?.gallery_urls?.length ? product.gallery_urls : (product?.image_urls ?? []).filter((url) => url !== primary)).filter((url) => url !== primary));
  }, [variants, product]);

  function addTags(values: string[]) {
    setTags((current) => normalizeTags([...current, ...values]));
  }

  function updateDraft(index: number, key: keyof VariantDraft, value: string | number) {
    setDrafts((current) => current.map((draft, i) => i === index ? { ...draft, [key]: value } : draft));
  }

  async function uploadImage(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error(t('invalidImage')); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error(t('imageTooLarge')); return; }
    const path = `${crypto.randomUUID()}-${slug(file.name)}`;
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error(t('imageUploadError')); return; }
    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    updateDraft(index, 'image_url', data.publicUrl);
  }

  function addProductImages(urls: string[]) {
    const combined = uniqueUrls([primaryImage, ...galleryImages, ...urls]);
    const primary = primaryImage || combined[0] || '';
    setPrimaryImage(primary);
    setGalleryImages(combined.filter((url) => url !== primary));
  }

  async function uploadProductImages(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (!files.length) return;
    const valid = files.filter((file) => {
      if (!file.type.startsWith('image/')) { toast.error(t('invalidImage')); return false; }
      if (file.size > 5 * 1024 * 1024) { toast.error(t('imageTooLarge')); return false; }
      return true;
    });
    if (!valid.length) return;
    setGalleryUploading(true);
    try {
      const results = await Promise.allSettled(valid.map(async (file) => {
        const path = `${crypto.randomUUID()}-${slug(file.name)}`;
        const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true, contentType: file.type });
        if (error) throw error;
        return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
      }));
      const urls = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      if (urls.length !== valid.length) toast.error(t('imageUploadError'));
      addProductImages(urls);
    } finally {
      setGalleryUploading(false);
    }
  }

  function addProductImageUrl() {
    const url = galleryUrlInput.trim();
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Invalid protocol');
    } catch {
      toast.error(t('productImageUrlInvalid'));
      return;
    }
    addProductImages([url]);
    setGalleryUrlInput('');
  }

  function setPrimaryProductImage(url: string) {
    if (url === primaryImage) return;
    setGalleryImages(uniqueUrls([primaryImage, ...galleryImages].filter((image) => image !== url)));
    setPrimaryImage(url);
  }

  function removeProductImage(url: string) {
    if (url !== primaryImage) {
      setGalleryImages((current) => current.filter((image) => image !== url));
      return;
    }
    const nextPrimary = galleryImages[0] ?? '';
    setPrimaryImage(nextPrimary);
    setGalleryImages(galleryImages.slice(1));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (galleryUploading) return;
    if (drafts.length === 0) { toast.error(t('addVariantRequired')); return; }
    if (compareAtPrice.trim() && (!Number.isFinite(Number(compareAtPrice)) || Number(compareAtPrice) < 0)) { toast.error(t('comparePriceInvalid')); return; }
    if (drafts.some((variant) => !variant.sku.trim() || !Number.isFinite(Number(variant.unit_sell_price)) || !Number.isFinite(Number(variant.unit_cost_price)) || Number(variant.unit_sell_price) < 0 || Number(variant.unit_cost_price) < 0 || !Number.isInteger(Number(variant.stock_qty)) || Number(variant.stock_qty) < 0 || (variant.id && (!Number.isInteger(Number(variant.adjustment)) || Number(variant.stock_qty) + Number(variant.adjustment) < 0)))) {
      toast.error(t('productValidation')); return;
    }
    setBusy(true);
    let productId = product?.id;
    const finalPrimary = primaryImage.trim() || null;
    const finalGallery = uniqueUrls(galleryImages).filter((url) => url !== finalPrimary);
    const productValues = { name: name.trim(), description: description.trim() || null, category, brand: brand.trim() || null, is_best_seller: bestSeller, compare_at_price: compareAtPrice.trim() ? Number(compareAtPrice) : null, is_active: active, style_tags: normalizeTags(tags), image_url: finalPrimary, gallery_urls: finalGallery, image_urls: uniqueUrls([finalPrimary ?? '', ...finalGallery]) };
    const productResult = productId
      ? await supabase.from('products').update(productValues).eq('id', productId).select('id').single()
      : await supabase.from('products').insert(productValues).select('id').single();
    if (productResult.error) {
      setBusy(false); toast.error(t('productSaveError')); return;
    }
    productId = productResult.data.id;

    const existingIds = drafts.flatMap((draft) => draft.id ? [draft.id] : []);
    const removed = variants.filter((variant) => !existingIds.includes(variant.id));
    if (removed.length) {
      const { error } = await supabase.from('product_variants').delete().in('id', removed.map((variant) => variant.id));
      if (error) { setBusy(false); toast.error(t('variantsDeleteError')); return; }
    }

    for (const draft of drafts) {
      const values = {
        product_id: productId, sku: draft.sku.trim(), color: draft.color.trim() || null, size: draft.size.trim() || null,
        image_url: draft.image_url || null, unit_cost_price: Number(draft.unit_cost_price), unit_sell_price: Number(draft.unit_sell_price),
      };
      const result = draft.id
        ? await supabase.from('product_variants').update(values).eq('id', draft.id)
        : await supabase.from('product_variants').insert({ ...values, stock_qty: Number(draft.stock_qty) });
      if (result.error) { setBusy(false); toast.error(t('variantSaveError')); return; }
      if (draft.id && Number(draft.adjustment) !== 0) {
        const { error } = await supabase.rpc('adjust_variant_stock_atomic', {
          p_variant_id: draft.id, p_delta: Number(draft.adjustment), p_reason: 'manual_restock',
        });
        if (error) { setBusy(false); toast.error(error.message.toLowerCase().includes('insufficient stock') ? t('stockBelowZero') : t('adjustmentSaveError')); return; }
      }
    }
    setBusy(false);
    toast.success(product ? t('productUpdated') : t('productCreated'));
    await onSaved();
    onClose();
  }

  return <div dir={dir} className="fixed inset-0 z-[60] grid place-items-center bg-stone-950/50 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy && !galleryUploading) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="product-form-title" className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4 sm:px-7">
        <h2 id="product-form-title" className="text-xl font-bold text-stone-900">{product ? t('editProduct') : t('newProduct')}</h2>
        <button type="button" onClick={onClose} disabled={busy || galleryUploading} aria-label={t('closeMenu')} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"><X /></button>
      </header>
      <form onSubmit={save} className="space-y-7 p-5 sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-start text-sm font-semibold text-stone-700">{t('productName')}<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 text-start outline-none focus:border-rose-500" /></label>
          <label className="text-start text-sm font-semibold text-stone-700">{t('category')}<select value={category} onChange={(event) => setCategory(event.target.value as 'sneakers' | 'bags')} className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-start outline-none focus:border-rose-500"><option value="sneakers">{t('sneakers')}</option><option value="bags">{t('bags')}</option></select></label>
          <label className="text-start text-sm font-semibold text-stone-700">{t('productBrand')}<input list="product-brand-presets" value={brand} onChange={(event) => setBrand(event.target.value)} placeholder={t('productBrandPlaceholder')} className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-start outline-none focus:border-rose-500" /><datalist id="product-brand-presets">{['Gucci', 'LV', 'Dior', 'Miu Miu', 'YSL'].map((preset) => <option key={preset} value={preset} />)}</datalist></label>
          <label className="text-start text-sm font-semibold text-stone-700">{t('compareAtPrice')} ({t('currencyEgp')})<input type="number" min="0" step="0.01" value={compareAtPrice} onChange={(event) => setCompareAtPrice(event.target.value)} placeholder={t('compareAtPriceHint')} className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-start outline-none focus:border-rose-500" /><span className="mt-1 block text-xs font-normal text-stone-500">{t('compareAtPriceHint')}</span></label>
          <label className="text-start text-sm font-semibold text-stone-700 sm:col-span-2">{t('description')}<textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 text-start outline-none focus:border-rose-500" /></label>
          <label className="flex cursor-pointer items-center gap-3 text-start text-sm font-semibold text-stone-700"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="size-4 accent-rose-600" />{t('productActive')}</label>
          <div className="flex items-center justify-between gap-3 text-start text-sm font-semibold text-stone-700"><span>{t('bestSellerToggle')}</span><button type="button" role="switch" aria-checked={bestSeller} onClick={() => setBestSeller((current) => !current)} className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${bestSeller ? 'bg-amber-600' : 'bg-stone-300'}`}><span className={`size-5 rounded-full bg-white shadow-sm transition-transform ${bestSeller ? dir === 'rtl' ? '-translate-x-5' : 'translate-x-5' : 'translate-x-0'}`} /></button></div>
        </div>

        <section className="space-y-4 rounded-2xl border border-stone-200 bg-stone-50/70 p-4 sm:p-5">
          <div><h3 className="font-bold text-stone-900">{t('productImages')}</h3><p className="mt-1 text-xs text-stone-500">{t('productImagesHint')}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800">{galleryUploading ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}{galleryUploading ? t('uploadingImages') : t('uploadGalleryImages')}<input type="file" multiple accept="image/*" onChange={(event) => void uploadProductImages(event)} disabled={galleryUploading} className="sr-only" /></label>
            <div className="flex min-w-64 flex-1 gap-2"><input type="url" value={galleryUrlInput} onChange={(event) => setGalleryUrlInput(event.target.value)} placeholder={t('imageUrlPlaceholder')} className="h-10 min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 text-start text-xs" /><button type="button" onClick={addProductImageUrl} className="inline-flex items-center gap-1 rounded-xl border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700"><Plus className="size-4" />{t('addImageUrl')}</button></div>
          </div>
          {galleryUploading && <p className="text-xs text-stone-500">{t('uploadingImages')}</p>}
          {uniqueUrls([primaryImage, ...galleryImages]).length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{uniqueUrls([primaryImage, ...galleryImages]).map((url) => <article key={url} className="relative overflow-hidden rounded-xl border border-stone-200 bg-white">
            <img src={url} alt={t('imagePreview')} className="aspect-square w-full object-cover" />
            {url === primaryImage && <span className="absolute start-2 top-2 rounded-full bg-stone-900 px-2 py-1 text-[10px] font-bold text-white">{t('primaryImage')}</span>}
            <button type="button" onClick={() => removeProductImage(url)} aria-label={t('removeImage')} className="absolute end-2 top-2 grid size-7 place-items-center rounded-full bg-white/90 text-red-600 shadow"><X className="size-4" /></button>
            {url !== primaryImage && <button type="button" onClick={() => setPrimaryProductImage(url)} className="w-full border-t border-stone-100 px-2 py-2 text-[11px] font-bold text-rose-700 hover:bg-rose-50">{t('setPrimaryImage')}</button>}
          </article>)}</div>}
        </section>

        <section className="space-y-3">
          <div><h3 className="text-sm font-bold text-stone-800">{t('styleTags')}</h3><p className="mt-1 text-xs text-stone-500">{t('styleTagsHint')}</p></div>
          <input value={tagInput} onChange={(event) => {
            const chunks = event.target.value.split(',');
            if (chunks.length > 1) { addTags(chunks.slice(0, -1)); setTagInput(chunks.at(-1) ?? ''); }
            else setTagInput(event.target.value);
          }} onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addTags([tagInput]); setTagInput(''); }
          }} placeholder={t('styleTagPlaceholder')} className="w-full rounded-xl border border-stone-300 px-4 py-3 text-start text-sm outline-none focus:border-rose-500" />
          {!!tags.length && <div className="flex flex-wrap gap-2">{tags.map((tag) => <button key={tag} type="button" onClick={() => setTags((current) => current.filter((item) => item !== tag))} className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800">{tag}<span aria-hidden="true" className="text-base leading-none">×</span></button>)}</div>}
          <div><p className="mb-2 text-xs font-semibold text-stone-500">{t('styleTagPresets')} · {category === 'bags' ? t('bags') : t('sneakers')}</p><div className="flex flex-wrap gap-2">{tagPresets.filter((key) => category === 'bags' ? ['tagCrossbody', 'tagLeather', 'tagMultiPocket', 'tagCasual', 'tagClassic', 'tagDaily'].includes(key) : ['tagChunky', 'tagPlatform', 'tagCasual', 'tagClassic', 'tagDaily'].includes(key)).map((key) => <button type="button" key={key} onClick={() => addTags([t(key)])} className="rounded-full border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:border-rose-300 hover:bg-rose-50">{t(key)}</button>)}</div></div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-stone-900">{t('variantsAndStock')}</h3><p className="mt-1 text-xs text-stone-500">{t('variantsHint')}</p></div><button type="button" onClick={() => setDrafts((current) => [...current, newVariant(name)])} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50"><Plus className="size-4" />{t('addVariant')}</button></div>
          {drafts.length === 0 && <div className="rounded-2xl border border-dashed border-stone-300 py-8 text-center text-sm text-stone-500">{t('noVariants')}</div>}
          {drafts.map((draft, index) => <article key={draft.id ?? `new-${index}`} className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between"><span className="text-sm font-bold text-stone-700">{t('variant')} {new Intl.NumberFormat(lang).format(index + 1)}</span><button type="button" onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))} className="rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label={t('removeVariant')}><Trash2 className="size-4" /></button></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-start text-xs font-semibold text-stone-600">{t('sku')}<input required value={draft.sku} onChange={(event) => updateDraft(index, 'sku', event.target.value)} placeholder={t('skuExample')} dir="ltr" className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-start text-sm" /></label>
              <label className="text-start text-xs font-semibold text-stone-600">{t('color')} <span className="font-normal text-stone-400">({t('oneColor')} {t('emptyValueHint')})</span><input value={draft.color} onChange={(event) => updateDraft(index, 'color', event.target.value)} placeholder={t('colorExample')} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-start text-sm" /></label>
              <label className="text-start text-xs font-semibold text-stone-600">{t('size')} <span className="font-normal text-stone-400">({t('pdpNoSize')} {t('emptyValueHint')})</span><input value={draft.size} onChange={(event) => updateDraft(index, 'size', event.target.value)} placeholder={t('sizeExample')} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-start text-sm" /></label>
              <label className="text-start text-xs font-semibold text-stone-600">{t('costPrice')} ({t('currencyEgp')})<input required type="number" min="0" step="0.01" value={draft.unit_cost_price} onChange={(event) => updateDraft(index, 'unit_cost_price', event.target.value)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-start text-sm" /><span className="mt-1 block font-normal text-stone-400">{formatCurrency(Number(draft.unit_cost_price) || 0)}</span></label>
              <label className="text-start text-xs font-semibold text-stone-600">{t('sellPrice')} ({t('currencyEgp')})<input required type="number" min="0" step="0.01" value={draft.unit_sell_price} onChange={(event) => updateDraft(index, 'unit_sell_price', event.target.value)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-start text-sm" /><span className="mt-1 block font-normal text-stone-400">{formatCurrency(Number(draft.unit_sell_price) || 0)}</span></label>
              {draft.id ? <div className="text-start text-xs font-semibold text-stone-600"><label>{t('stockAdjustment')}<div className="mt-1.5 flex items-center gap-2"><button type="button" disabled={draft.stock_qty === 0 || draft.stock_qty + Number(draft.adjustment || 0) <= 0} aria-label={t('adjustmentDecrease')} onClick={() => { const next = Number(draft.adjustment || 0) - 1; if (draft.stock_qty + next < 0) { toast.error(t('stockBelowZero')); return; } updateDraft(index, 'adjustment', String(next)); }} className="grid size-9 shrink-0 place-items-center rounded-lg border border-stone-300 bg-white text-lg font-bold disabled:cursor-not-allowed disabled:opacity-40">−</button><input type="number" min={-draft.stock_qty} step="1" value={draft.adjustment} onChange={(event) => { const raw = event.target.value; const next = Number(raw); if (!Number.isInteger(next) || draft.stock_qty + next < 0) { toast.error(t('stockBelowZero')); return; } updateDraft(index, 'adjustment', raw); }} className="min-w-0 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-start text-sm" /><button type="button" aria-label={t('adjustmentIncrease')} onClick={() => updateDraft(index, 'adjustment', String(Number(draft.adjustment || 0) + 1))} className="grid size-9 shrink-0 place-items-center rounded-lg border border-stone-300 bg-white text-lg font-bold">+</button></div></label><span className="mt-1 block font-normal text-stone-400">{t('currentStock')}: {new Intl.NumberFormat(lang).format(draft.stock_qty)} · {t('stock')}: {new Intl.NumberFormat(lang).format(draft.stock_qty + Number(draft.adjustment || 0))}</span></div> : <label className="text-start text-xs font-semibold text-stone-600">{t('initialStock')}<input required type="number" min={0} step={1} value={draft.stock_qty} onChange={(event) => { const next = Number(event.target.value); if (next < 0) { toast.error(t('stockInvalid')); return; } updateDraft(index, 'stock_qty', next); }} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-start text-sm" /></label>}
              <div className="text-start sm:col-span-2 lg:col-span-3"><span className="text-xs font-semibold text-stone-600">{t('image')}</span><div className="mt-1.5 flex items-center gap-3">{draft.image_url ? <img src={draft.image_url} alt={t('imagePreview')} className="size-14 rounded-lg border border-stone-200 object-cover" /> : <div className="grid size-14 place-items-center rounded-lg bg-stone-200 text-stone-500"><ImagePlus className="size-5" /></div>}<label className="cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50">{t('uploadImage')}<input type="file" accept="image/*" onChange={(event) => void uploadImage(index, event)} className="sr-only" /></label><span className="text-xs text-stone-400">{t('imageLimit')}</span></div></div>
            </div>
          </article>)}
        </section>
        <footer className="flex justify-end gap-3 border-t border-stone-200 pt-5"><button type="button" disabled={busy || galleryUploading} onClick={onClose} className="rounded-xl border border-stone-300 px-5 py-3 text-sm font-bold text-stone-700">{t('cancel')}</button><button disabled={busy || galleryUploading} className="rounded-xl bg-stone-900 px-6 py-3 text-sm font-bold text-white hover:bg-stone-800 disabled:opacity-60">{busy ? t('saving') : t('saveProduct')}</button></footer>
      </form>
    </section>
  </div>;
}
