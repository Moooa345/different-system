import { ShoppingBag, Store } from 'lucide-react';
import { useTranslation } from '../../i18n/useTranslation';
import { LanguageSwitcher } from '../../components/layout/LanguageSwitcher';
import { ThemeToggle } from '../../components/layout/ThemeToggle';

type CategoryFilter = 'all' | 'shoes' | 'bags';

interface StorefrontHeaderProps {
  cartCount: number;
  onOpenCart: () => void;
  category: CategoryFilter;
  onCategoryChange: (category: CategoryFilter) => void;
  showNavigation?: boolean;
  showCart?: boolean;
}

export function StorefrontHeader({ cartCount, onOpenCart, category, onCategoryChange, showNavigation = true, showCart = true }: StorefrontHeaderProps) {
  const { t, dir, lang } = useTranslation();
  const categories = [
    { value: 'all', label: t('all') },
    { value: 'shoes', label: t('posShoes') },
    { value: 'bags', label: t('posBags') },
  ] as const;

  return <header dir={dir} className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
    <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
      <a href="/" className="flex shrink-0 items-center gap-2 text-base font-black text-stone-900 sm:text-lg"><span className="grid size-9 place-items-center rounded-xl bg-rose-100 text-rose-700"><Store className="size-5" /></span><span>{t('brand')}</span></a>
      {showNavigation && <nav aria-label={t('storeCategoryNav')} className="ms-auto hidden items-center gap-1 md:flex">
        {categories.map((item) => <button key={item.value} onClick={() => onCategoryChange(item.value)} className={`rounded-full px-3 py-2 text-sm font-semibold transition ${category === item.value ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}>{item.label}</button>)}
      </nav>}
      <div className="ms-auto flex items-center gap-2 md:ms-2"><LanguageSwitcher /><ThemeToggle compact /></div>
      {showCart && <button onClick={onOpenCart} aria-label={`${t('storeCart')} (${new Intl.NumberFormat(lang).format(cartCount)})`} className="relative grid size-11 shrink-0 place-items-center rounded-xl border border-stone-200 text-stone-700 transition hover:bg-stone-50">
        <ShoppingBag className="size-5" />
        {cartCount > 0 && <span className="absolute -end-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{new Intl.NumberFormat(lang).format(cartCount)}</span>}
      </button>}
    </div>
    {showNavigation && <nav aria-label={t('storeCategoryNav')} className="flex gap-2 overflow-x-auto px-4 pb-3 md:hidden">
      {categories.map((item) => <button key={item.value} onClick={() => onCategoryChange(item.value)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${category === item.value ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>{item.label}</button>)}
    </nav>}
  </header>;
}
