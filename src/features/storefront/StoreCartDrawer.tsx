import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n/useTranslation';
import { useStoreCart } from '../../store/useStoreCart';
import { formatVariantLabel } from '../../utils/formatVariantLabel';
import { FREE_SHIPPING_THRESHOLD } from '../../config/constants';

export function StoreCartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { t, dir, lang, formatCurrency } = useTranslation();
  const items = useStoreCart((state) => state.items);
  const updateQty = useStoreCart((state) => state.updateQty);
  const removeItem = useStoreCart((state) => state.removeItem);
  const subtotal = useStoreCart((state) => state.subtotal());
  if (!open) return null;
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const progress = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);

  return <div dir={dir} className="fixed inset-0 z-50" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <button className="absolute inset-0 bg-stone-950/45" onClick={onClose} aria-label={t('storeCloseCart')} />
    <aside role="dialog" aria-modal="true" aria-labelledby="store-cart-title" className={`store-cart-panel absolute inset-y-0 ${dir === 'rtl' ? 'start-0' : 'end-0'} flex w-full max-w-md flex-col border-s border-stone-200 bg-white shadow-2xl`}>
      <header className="flex shrink-0 items-center justify-between border-b border-stone-200 px-5 py-4"><h2 id="store-cart-title" className="flex items-center gap-2 text-lg font-bold text-stone-900"><ShoppingBag className="size-5 text-rose-600" />{t('storeCart')}</h2><button onClick={onClose} aria-label={t('storeCloseCart')} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"><X /></button></header>
      {items.length === 0 ? <div className="grid flex-1 place-items-center p-8 text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-full border border-stone-200 bg-stone-50 text-stone-500"><ShoppingBag className="size-7" /></span><h3 className="mt-5 font-bold text-stone-800">{t('storeEmptyCart')}</h3><p className="mt-1 max-w-xs text-sm leading-6 text-stone-500">{t('storeEmptyCartHint')}</p><button type="button" onClick={onClose} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-bold text-white">{t('storeCartBrowse')}</button></div></div> : <>
        <div className="shrink-0 border-b border-stone-100 px-5 py-4"><p className="mb-2 text-xs font-semibold text-stone-600">{remaining > 0 ? t('storeFreeShippingProgress').replace('{amount}', formatCurrency(remaining)) : t('storeFreeShippingUnlocked')}</p><div className="h-1.5 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-rose-600 transition-all duration-500" style={{ width: `${progress}%` }} /></div></div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {items.map((item) => <article key={item.variantId} className="flex gap-3 border-b border-stone-100 pb-3 last:border-0">
            {item.imageUrl ? <img src={item.imageUrl} alt={item.productName} className="aspect-[4/5] w-20 shrink-0 rounded-md bg-stone-100 object-cover" /> : <div className="grid aspect-[4/5] w-20 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-400"><ShoppingBag className="size-6" /></div>}
            <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="line-clamp-2 text-sm font-bold text-stone-800">{item.productName}</h3><p className="mt-1 truncate text-xs text-stone-500">{formatVariantLabel(item.color, item.size, t)}</p></div><button onClick={() => removeItem(item.variantId)} aria-label={`${t('storeRemoveItem')}: ${item.productName}`} className="rounded-md p-1.5 text-stone-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button></div>
              <div className="mt-3 flex items-end justify-between gap-2"><div><p className="text-[11px] text-stone-500">{formatCurrency(item.unitPrice)} · {t('unitPrice')}</p><div className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-stone-200 bg-stone-50 p-0.5"><button disabled={item.qty <= 1} onClick={() => updateQty(item.variantId, item.qty - 1)} aria-label={t('adjustmentDecrease')} className="grid size-8 place-items-center rounded text-stone-600 hover:bg-white disabled:opacity-40"><Minus className="size-3.5" /></button><span aria-label={t('storeQuantity')} className="min-w-7 text-center text-xs font-bold">{new Intl.NumberFormat(lang).format(item.qty)}</span><button disabled={item.qty >= item.maxStock} onClick={() => updateQty(item.variantId, item.qty + 1)} aria-label={t('adjustmentIncrease')} className="grid size-8 place-items-center rounded text-stone-600 hover:bg-white disabled:opacity-40"><Plus className="size-3.5" /></button></div></div><span className="shrink-0 text-sm font-bold text-stone-900">{formatCurrency(item.unitPrice * item.qty)}</span></div>
            </div>
          </article>)}
        </div>
        <footer className="mt-auto shrink-0 space-y-3 border-t border-stone-200 bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"><div className="flex items-center justify-between font-bold text-stone-900"><span>{t('storeSubtotal')}</span><span>{formatCurrency(subtotal)}</span></div><p className="text-xs leading-5 text-stone-500">{t('storeShippingAtCheckout')}</p><button onClick={() => { onClose(); navigate('/checkout'); }} className="min-h-12 w-full rounded-lg bg-stone-900 px-4 py-3 text-sm font-bold text-white hover:bg-stone-800">{t('storeProceedCheckout')}</button><button type="button" onClick={onClose} className="w-full py-1 text-center text-xs font-semibold text-stone-500 underline underline-offset-4">{t('storeContinueShopping')}</button></footer>
      </>}
    </aside>
  </div>;
}
