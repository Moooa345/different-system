import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export type StaffRole = 'owner' | 'cashier' | null;

interface StaffState {
  role: StaffRole;
  loading: boolean;
  userId: string | null;
  loadRole: (userId: string | null) => Promise<void>;
  clear: () => void;
}

export const useStaffStore = create<StaffState>((set, get) => ({
  role: null,
  loading: false,
  userId: null,
  loadRole: async (userId) => {
    if (!userId) { set({ role: null, userId: null, loading: false }); return; }
    if (get().userId === userId && (get().role || get().loading)) return;
    set({ role: null, userId, loading: true });
    const { data, error } = await supabase.rpc('get_my_staff_role');
    if (get().userId !== userId) return;
    set({ role: error ? null : data as StaffRole, userId, loading: false });
  },
  clear: () => set({ role: null, userId: null, loading: false }),
}));
