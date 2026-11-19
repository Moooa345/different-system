import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n/useTranslation';
import { useStoreCart } from '../../store/useStoreCart';
import { formatVariantLabel } from '../../utils/formatVariantLabel';

export function StoreCartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { t, dir, lang, formatCurrency } = useTranslation();
  const items = useStoreCart((state) => state.items);
  const updateQty = useStoreCart((state) => state.updateQty);
  const removeItem = useStoreCart((state) => state.removeItem);
  const subtotal = useStoreCart((state) => state.subtotal());
  if (!open) return null;

  return <div dir={dir} className="fixed inset-0 z-50" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <button className="absolute inset-0 bg-stone-950/45" onClick={onClose} aria-label={t('storeCloseCart')} />
    <aside role="dialog" aria-modal="true" aria-labelledby="store-cart-title" className={`store-cart-panel absolute inset-y-0 ${dir === 'rtl' ? 'start-0' : 'end-0'} flex w-full max-w-md flex-col bg-white shadow-2xl`}>
      <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><h2 id="store-cart-title" className="flex items-center gap-2 text-lg font-bold text-stone-900"><ShoppingBag className="size-5 text-rose-600" />{t('storeCart')}</h2><button onClick={onClose} aria-label={t('storeCloseCart')} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"><X /></button></header>
      {items.length === 0 ? <div className="grid flex-1 place-items-center p-8 text-center"><div><ShoppingBag className="mx-auto size-10 text-stone-300" /><h3 className="mt-4 font-bold text-stone-700">{t('storeEmptyCart')}</h3><p className="mt-1 text-sm text-stone-500">{t('storeEmptyCartHint')}</p></div></div> : <>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {items.map((item) => <article key={item.variantId} className="flex gap-3 rounded-2xl border border-stone-200 p-3">
            {item.imageUrl ? <img src={item.imageUrl} alt={item.productName} className="size-16 shrink-0 rounded-xl bg-stone-100 object-cover" /> : <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-400"><ShoppingBag className="size-6" /></div>}
            <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-bold text-stone-800">{item.productName}</h3><p className="mt-1 truncate text-xs text-stone-500">{formatVariantLabel(item.color, item.size, t)}</p></div><button onClick={() => removeItem(item.variantId)} aria-label={t('storeRemoveItem')} className="rounded-md p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button></div>
              <div className="mt-2 flex items-center justify-between"><div className="inline-flex items-center gap-1 rounded-lg bg-stone-100 p-1"><button disabled={item.qty <= 1} onClick={() => updateQty(item.variantId, item.qty - 1)} aria-label={t('adjustmentDecrease')} className="grid size-8 place-items-center rounded-md text-stone-600 hover:bg-white disabled:opacity-40"><Minus className="size-4" /></button><span aria-label={t('storeQuantity')} className="min-w-6 text-center text-xs font-bold">{new Intl.NumberFormat(lang).format(item.qty)}</span><button disabled={item.qty >= item.maxStock} onClick={() => updateQty(item.variantId, item.qty + 1)} aria-label={t('adjustmentIncrease')} className="grid size-8 place-items-center rounded-md text-stone-600 hover:bg-white disabled:opacity-40"><Plus className="size-4" /></button></div><span className="text-sm font-bold text-stone-800">{formatCurrency(item.unitPrice * item.qty)}</span></div>
            </div>
          </article>)}
        </div>
        <footer className="space-y-4 border-t border-stone-200 p-5"><div className="flex items-center justify-between font-bold text-stone-800"><span>{t('storeSubtotal')}</span><span>{formatCurrency(subtotal)}</span></div><button onClick={() => { onClose(); navigate('/checkout'); }} className="min-h-12 w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white hover:bg-stone-800">{t('storeProceedCheckout')}</button></footer>
      </>}
    </aside>
  </div>;
}
