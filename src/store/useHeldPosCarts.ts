import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { PaymentMethod } from '../lib/types';
import type { PosCartItem } from './usePosCart';

export interface HeldPosCart {
  id: string;
  cashierId: string;
  createdAt: string;
  items: PosCartItem[];
  customerName: string;
  customerPhone: string;
  paymentMethod: Extract<PaymentMethod, 'cash' | 'instapay'>;
  itemCount: number;
  total: number;
}

interface HeldPosCartState {
  carts: HeldPosCart[];
  holdCart: (cart: Omit<HeldPosCart, 'id' | 'createdAt'>) => void;
  removeHeldCart: (id: string) => void;
}

export const useHeldPosCarts = create<HeldPosCartState>()(persist((set) => ({
  carts: [],
  holdCart: (cart) => set((state) => ({ carts: [{ ...cart, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...state.carts] })),
  removeHeldCart: (id) => set((state) => ({ carts: state.carts.filter((cart) => cart.id !== id) })),
}), { name: 'pos-held-carts', storage: createJSONStorage(() => localStorage) }));
