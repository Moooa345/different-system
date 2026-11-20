import { create } from 'zustand';
import { toast } from 'sonner';
import { ar, en } from '../i18n/translations';
import { useLanguageStore } from './useLanguage';

export interface PosCartItem {
  variantId: string;
  productName: string;
  sku: string;
  color: string | null;
  size: string | null;
  unitPrice: number;
  maxStock: number;
  qty: number;
  imageUrl: string | null;
}

interface PosCartState {
  items: PosCartItem[];
  addItem: (item: PosCartItem) => void;
  updateQty: (variantId: string, qty: number) => void;
  removeItem: (variantId: string) => void;
  syncStock: (stockByVariant: Record<string, number>) => void;
  clearCart: () => void;
  restoreItems: (items: PosCartItem[]) => void;
  subtotal: () => number;
}

function warning(key: 'posCartLimit' | 'posStockChanged') {
  const lang = useLanguageStore.getState().lang;
  toast.warning(lang === 'ar' ? ar[key] : en[key]);
}

export const usePosCart = create<PosCartState>((set, get) => ({
  items: [],
  addItem: (item) => {
    const existing = get().items.find((current) => current.variantId === item.variantId);
    if (item.maxStock < 1) {
      warning('posStockChanged');
      if (existing) set((state) => ({ items: state.items.filter((current) => current.variantId !== item.variantId) }));
      return;
    }
    if (existing) {
      if (existing.qty >= item.maxStock) {
        warning('posCartLimit');
        set((state) => ({ items: state.items.map((current) => current.variantId === item.variantId ? { ...current, maxStock: item.maxStock, qty: Math.min(current.qty, item.maxStock) } : current) }));
        return;
      }
      set((state) => ({ items: state.items.map((current) => current.variantId === item.variantId
        ? { ...item, qty: Math.min(existing.qty + 1, item.maxStock) }
        : current) }));
      return;
    }
    set((state) => ({ items: [...state.items, { ...item, qty: 1 }] }));
  },
  updateQty: (variantId, qty) => {
    const item = get().items.find((current) => current.variantId === variantId);
    if (!item) return;
    if (item.maxStock < 1) {
      warning('posStockChanged');
      set((state) => ({ items: state.items.filter((current) => current.variantId !== variantId) }));
      return;
    }
    if (qty > item.maxStock) warning('posCartLimit');
    const requestedQty = Number.isFinite(qty) ? Math.trunc(qty) : 1;
    const clampedQty = Math.max(1, Math.min(requestedQty, item.maxStock));
    set((state) => ({ items: state.items.map((current) => current.variantId === variantId ? { ...current, qty: clampedQty } : current) }));
  },
  removeItem: (variantId) => set((state) => ({ items: state.items.filter((item) => item.variantId !== variantId) })),
  syncStock: (stockByVariant) => {
    let unavailable = false;
    let capped = false;
    const items = get().items.flatMap((item) => {
      const maxStock = stockByVariant[item.variantId] ?? 0;
      if (maxStock < 1) {
        unavailable = true;
        return [];
      }
      if (item.qty > maxStock) capped = true;
      return [{ ...item, maxStock, qty: Math.min(item.qty, maxStock) }];
    });
    if (unavailable) warning('posStockChanged');
    else if (capped) warning('posCartLimit');
    set({ items });
  },
  clearCart: () => set({ items: [] }),
  restoreItems: (items) => set({ items: items.map((item) => ({ ...item, qty: Math.max(1, Math.min(item.qty, item.maxStock)) })).filter((item) => item.maxStock > 0) }),
  subtotal: () => get().items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0),
}));
