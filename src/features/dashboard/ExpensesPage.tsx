import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';

type ExpenseGroup = 'operational' | 'petty_damages';
type SubCategory = 'rent' | 'electricity' | 'taxes' | 'salaries' | 'other_operational' | 'damaged_goods' | 'renovations' | 'hospitality' | 'emergency' | 'other_petty';
type Expense = { id: string; category_group: ExpenseGroup; sub_category: SubCategory; title: string; amount: number; expense_date: string; notes: string | null; created_by: string | null; created_at: string };
const operational: SubCategory[] = ['rent', 'electricity', 'taxes', 'salaries', 'other_operational'];
const petty: SubCategory[] = ['damaged_goods', 'renovations', 'hospitality', 'emergency', 'other_petty'];
const subKey: Record<SubCategory, string> = { rent: 'expenseRent', electricity: 'expenseUtilities', taxes: 'expenseTaxes', salaries: 'expenseSalaries', other_operational: 'expenseOtherOperational', damaged_goods: 'expenseDamages', renovations: 'expenseRenovations', hospitality: 'expenseHospitality', emergency: 'expenseEmergency', other_petty: 'expenseOtherPetty' };

export function ExpensesPage() {
  const { t, lang, dir, formatCurrency } = useTranslation();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupFilter, setGroupFilter] = useState<'all' | ExpenseGroup>('all');
  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editing, setEditing] = useState<Expense | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [group, setGroup] = useState<ExpenseGroup>('operational');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false }).order('created_at', { ascending: false });
      if (error) {
        console.error('[ExpensesPage] Expense query failed:', error);
        toast.error(t('expensesLoadError'));
        setExpenses([]);
        return;
      }
      setExpenses((data ?? []) as Expense[]);
    } catch (error) {
      console.error('[ExpensesPage] Unexpected load failure:', error);
      toast.error(t('expensesLoadError'));
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => expenses.filter((expense) => expense.expense_date >= fromDate && expense.expense_date <= toDate && (groupFilter === 'all' || expense.category_group === groupFilter)), [expenses, fromDate, toDate, groupFilter]);
  const totals = useMemo(() => ({ operational: filtered.filter((e) => e.category_group === 'operational').reduce((s, e) => s + Number(e.amount), 0), petty: filtered.filter((e) => e.category_group === 'petty_damages').reduce((s, e) => s + Number(e.amount), 0) }), [filtered]);

  function openNew(nextGroup: ExpenseGroup) { setEditing(null); setGroup(nextGroup); setFormOpen(true); }
  function openEdit(expense: Expense) { setEditing(expense); setGroup(expense.category_group); setFormOpen(true); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { category_group: group, sub_category: String(form.get('sub_category')) as SubCategory, title: String(form.get('title')).trim(), amount: Number(form.get('amount')), expense_date: String(form.get('expense_date')), notes: String(form.get('notes') ?? '').trim() || null };
    if (!payload.title || !Number.isFinite(payload.amount) || payload.amount <= 0) return;
    setBusy(true);
    try {
      const result = editing ? await supabase.from('expenses').update(payload).eq('id', editing.id) : await supabase.from('expenses').insert(payload);
      if (result.error) { console.error('[ExpensesPage] Save failed:', result.error); toast.error(t('expenseSaveError')); return; }
      toast.success(editing ? t('expenseUpdated') : t('expenseAdded'));
      setFormOpen(false); setEditing(null); await load();
    } catch (error) {
      console.error('[ExpensesPage] Unexpected save failure:', error);
      toast.error(t('expenseSaveError'));
    } finally {
      setBusy(false);
    }
  }
  async function remove(expense: Expense) {
    if (!window.confirm(t('expenseDeleteConfirm'))) return;
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', expense.id);
      if (error) { console.error('[ExpensesPage] Delete failed:', error); toast.error(t('expenseSaveError')); return; }
      toast.success(t('expenseDeleted')); await load();
    } catch (error) {
      console.error('[ExpensesPage] Unexpected delete failure:', error);
      toast.error(t('expenseSaveError'));
    }
  }

  const categoryOptions = group === 'operational' ? operational : petty;
  return <div dir={dir} className="space-y-6 tabular-nums">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A7A3D]">Different Store</p><h1 className="mt-2 text-2xl font-bold text-stone-900">{t('expensesTitle')}</h1><p className="mt-1 text-sm text-stone-500">{t('expensesSubtitle')}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => openNew('operational')} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-stone-900 px-4 text-sm font-bold text-white"><Plus className="size-4" />{t('expenseAddOperational')}</button><button type="button" onClick={() => openNew('petty_damages')} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-700"><Plus className="size-4" />{t('expenseAddPetty')}</button></div></header>
    <div className="grid gap-3 sm:grid-cols-3">{[[t('expenseTotalOperational'), totals.operational, 'text-stone-900'], [t('expenseTotalPetty'), totals.petty, 'text-amber-800'], [t('expenseTotal'), totals.operational + totals.petty, 'text-[#9A7A3D]']].map(([label, amount, tone]) => <article key={String(label)} className="rounded-lg border border-stone-200 bg-white p-4"><p className="text-xs text-stone-500">{label}</p><p className={`mt-2 text-xl font-black tabular-nums ${tone}`}>{formatCurrency(Number(amount))}</p></article>)}</div>
    <section className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-white p-4"><label className="text-xs font-semibold text-stone-600">{t('expenseDateFrom')}<input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1.5 h-11 rounded-md border border-stone-300 bg-white px-3 text-sm" /></label><label className="text-xs font-semibold text-stone-600">{t('expenseDateTo')}<input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-1.5 h-11 rounded-md border border-stone-300 bg-white px-3 text-sm" /></label><div className="flex gap-2">{([{ id: 'all', key: 'all' }, { id: 'operational', key: 'expenseOperational' }, { id: 'petty_damages', key: 'expensePetty' }] as const).map((option) => <button key={option.id} type="button" onClick={() => setGroupFilter(option.id)} className={`min-h-11 rounded-md px-3 text-xs font-bold ${groupFilter === option.id ? 'bg-stone-900 text-white' : 'border border-stone-200 text-stone-600'}`}>{t(option.key)}</button>)}</div></section>
    <section className="overflow-hidden rounded-lg border border-stone-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-start text-sm"><thead className="bg-stone-50 text-xs text-stone-500"><tr>{[t('expenseDate'), t('expenseGroup'), t('expenseCategory'), t('expenseTitleField'), t('expenseAmount'), t('notes'), ''].map((label, i) => <th key={`${label}-${i}`} className="px-4 py-3 text-start">{label}</th>)}</tr></thead><tbody className="divide-y divide-stone-100">{filtered.map((expense) => <tr key={expense.id}><td className="px-4 py-3">{new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(`${expense.expense_date}T12:00:00`))}</td><td className="px-4 py-3">{t(expense.category_group === 'operational' ? 'expenseOperational' : 'expensePetty')}</td><td className="px-4 py-3">{t(subKey[expense.sub_category] as 'expenseRent')}</td><td className="px-4 py-3 font-semibold">{expense.title}</td><td className="px-4 py-3 font-bold tabular-nums">{formatCurrency(Number(expense.amount))}</td><td className="max-w-56 truncate px-4 py-3 text-stone-500">{expense.notes || '—'}</td><td className="px-4 py-3"><div className="flex gap-2"><button type="button" onClick={() => openEdit(expense)} className="rounded-md border border-stone-200 px-3 py-2 text-xs font-semibold">{t('edit')}</button><button type="button" onClick={() => void remove(expense)} aria-label={t('expenseDelete')} className="grid size-9 place-items-center rounded-md text-red-700 hover:bg-red-50"><Trash2 className="size-4" /></button></div></td></tr>)}</tbody></table>{loading ? <p className="p-6 text-center text-sm text-stone-500">{t('loadingInventory')}</p> : filtered.length === 0 && <p className="p-8 text-center text-sm text-stone-500">{t('expensesEmpty')}</p>}</div></section>
    {formOpen && <div className="fixed inset-0 z-[80] grid place-items-center bg-stone-950/45 p-4"><form onSubmit={(e) => void save(e)} className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg border border-stone-200 bg-white p-5 shadow-xl sm:p-6"><header className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-stone-900">{editing ? t('expenseEdit') : t(group === 'operational' ? 'expenseAddOperational' : 'expenseAddPetty')}</h2><p className="mt-1 text-xs text-stone-500">{t(group === 'operational' ? 'expenseOperational' : 'expensePetty')}</p></div><button type="button" onClick={() => setFormOpen(false)} aria-label={t('cancel')} className="grid size-10 place-items-center rounded-md hover:bg-stone-100"><X className="size-5" /></button></header>
      {!editing && <div className="flex gap-2">{(['operational', 'petty_damages'] as const).map((value) => <button key={value} type="button" onClick={() => setGroup(value)} className={`min-h-10 flex-1 rounded-md px-3 text-xs font-bold ${group === value ? 'bg-stone-900 text-white' : 'border border-stone-200 text-stone-600'}`}>{t(value === 'operational' ? 'expenseOperational' : 'expensePetty')}</button>)}</div>}
      <label className="block text-xs font-semibold text-stone-600">{t('expenseCategory')}<select name="sub_category" required defaultValue={editing?.sub_category ?? categoryOptions[0]} key={`${group}-${editing?.id ?? 'new'}`} className="mt-1.5 h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-start text-sm">{categoryOptions.map((value) => <option key={value} value={value}>{t(subKey[value] as 'expenseRent')}</option>)}</select></label>
      <label className="block text-xs font-semibold text-stone-600">{t('expenseTitleField')}<input name="title" required defaultValue={editing?.title ?? ''} className="mt-1.5 h-11 w-full rounded-md border border-stone-300 px-3 text-start text-sm" /></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-stone-600">{t('expenseAmount')}<input name="amount" required type="number" min="0.01" step="0.01" defaultValue={editing?.amount ?? ''} className="mt-1.5 h-11 w-full rounded-md border border-stone-300 px-3 text-start text-sm" /></label><label className="text-xs font-semibold text-stone-600">{t('expenseDate')}<input name="expense_date" required type="date" defaultValue={editing?.expense_date ?? new Date().toISOString().slice(0, 10)} className="mt-1.5 h-11 w-full rounded-md border border-stone-300 px-3 text-start text-sm" /></label></div>
      <label className="block text-xs font-semibold text-stone-600">{t('notes')}<textarea name="notes" rows={3} defaultValue={editing?.notes ?? ''} className="mt-1.5 w-full rounded-md border border-stone-300 px-3 py-2 text-start text-sm" /></label>
      <footer className="flex justify-end gap-2 border-t border-stone-100 pt-4"><button type="button" onClick={() => setFormOpen(false)} className="min-h-11 rounded-md border border-stone-300 px-4 text-sm font-semibold">{t('cancel')}</button><button disabled={busy} className="min-h-11 rounded-md bg-stone-900 px-5 text-sm font-bold text-white disabled:opacity-50">{busy ? t('saving') : t('save')}</button></footer>
    </form></div>}
  </div>;
}
