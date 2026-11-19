import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { toast } from 'sonner';
import { ar, en } from '../i18n/translations';
import { useLanguageStore } from './useLanguage';

export interface StoreCartItem {
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

interface StoreCartState {
  items: StoreCartItem[];
  addItem: (item: StoreCartItem) => void;
  updateQty: (variantId: string, qty: number) => void;
  removeItem: (variantId: string) => void;
  syncStock: (stockByVariant: Record<string, number>) => void;
  updateVariantStock: (variantId: string, maxStock: number, isActive: boolean) => void;
  removeVariants: (variantIds: string[]) => void;
  clearCart: () => void;
  subtotal: () => number;
}

function warning(key: 'storeCartStockLimit' | 'storeStockUpdated' | 'storeProductUnavailable') {
  const lang = useLanguageStore.getState().lang;
  toast.warning(lang === 'ar' ? ar[key] : en[key]);
}

export const useStoreCart = create<StoreCartState>()(persist((set, get) => ({
  items: [],
  addItem: (item) => {
    const existing = get().items.find((current) => current.variantId === item.variantId);
    const requestedQty = Number.isInteger(item.qty) ? Math.max(1, item.qty) : 1;
    if (item.maxStock < 1) {
      warning('storeStockUpdated');
      if (existing) set((state) => ({ items: state.items.filter((current) => current.variantId !== item.variantId) }));
      return;
    }
    if (existing) {
      const nextQty = existing.qty + requestedQty;
      if (nextQty > item.maxStock) {
        warning('storeCartStockLimit');
        set((state) => ({ items: state.items.map((current) => current.variantId === item.variantId
          ? { ...item, maxStock: item.maxStock, qty: Math.min(nextQty, item.maxStock) }
          : current) }));
        return;
      }
      set((state) => ({ items: state.items.map((current) => current.variantId === item.variantId
        ? { ...item, qty: nextQty }
        : current) }));
      return;
    }
    if (requestedQty > item.maxStock) warning('storeCartStockLimit');
    set((state) => ({ items: [...state.items, { ...item, qty: Math.min(requestedQty, item.maxStock) }] }));
  },
  updateQty: (variantId, qty) => {
    const item = get().items.find((current) => current.variantId === variantId);
    if (!item) return;
    if (item.maxStock < 1) {
      warning('storeStockUpdated');
      set((state) => ({ items: state.items.filter((current) => current.variantId !== variantId) }));
      return;
    }
    if (qty > item.maxStock) warning('storeCartStockLimit');
    const requestedQty = Number.isFinite(qty) ? Math.trunc(qty) : 1;
    const safeQty = Math.max(1, Math.min(requestedQty, item.maxStock));
    set((state) => ({ items: state.items.map((current) => current.variantId === variantId ? { ...current, qty: safeQty } : current) }));
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
    if (unavailable) warning('storeStockUpdated');
    else if (capped) warning('storeCartStockLimit');
    set({ items });
  },
  updateVariantStock: (variantId, maxStock, isActive) => {
    const item = get().items.find((current) => current.variantId === variantId);
    if (!item) return;
    if (!isActive || maxStock < 1) {
      warning('storeProductUnavailable');
      set((state) => ({ items: state.items.filter((current) => current.variantId !== variantId) }));
      return;
    }
    if (item.qty > maxStock) warning('storeCartStockLimit');
    set((state) => ({ items: state.items.map((current) => current.variantId === variantId
      ? { ...current, maxStock, qty: Math.min(current.qty, maxStock) }
      : current) }));
  },
  removeVariants: (variantIds) => {
    const ids = new Set(variantIds);
    const items = get().items;
    if (!items.some((item) => ids.has(item.variantId))) return;
    warning('storeProductUnavailable');
    set((state) => ({ items: state.items.filter((item) => !ids.has(item.variantId)) }));
  },
  clearCart: () => set({ items: [] }),
  subtotal: () => get().items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0),
}), { name: 'storefront-cart', storage: createJSONStorage(() => localStorage) }));
