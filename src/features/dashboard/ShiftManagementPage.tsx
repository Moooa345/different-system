import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { LoaderCircle, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';
import { formatDurationMinutes } from '../../utils/formatDurationMinutes';
import { useAuthStore } from '../../store/authStore';

type Template = { id: string; name_ar: string; name_en: string; start_time: string; end_time: string; grace_minutes: number; is_active: boolean };
type Shift = { id: string; cashier_name: string | null; cashier_id: string; scheduled_start_at: string; scheduled_end_at: string | null; opened_at: string; closed_at: string | null; status: string; punctuality_status: 'early' | 'on_time' | 'late'; punctuality_diff_minutes: number; checkout_status: 'overtime' | 'on_time' | 'early_leave' | null; checkout_diff_minutes: number | null; opening_cash_egp: number; expected_cash_egp: number | null; actual_closing_cash_egp: number | null; cash_variance_egp: number | null };
type StaffAccount = { user_id: string; email: string | null; role: 'owner' | 'cashier'; display_name: string | null; is_active: boolean };
type Accountability = { cashier_id: string; cashier_name: string; total_late_minutes: number; total_overtime_minutes: number };

export function ShiftManagementPage() {
  const { t, lang, dir, formatCurrency } = useTranslation();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateDraft, setTemplateDraft] = useState<Template | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [accountability, setAccountability] = useState<Accountability[]>([]);
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [email, setEmail] = useState('');
  const [staffName, setStaffName] = useState('');
  const [busy, setBusy] = useState(false);
  const [deletingStaffId, setDeletingStaffId] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [{ data: templateRows, error: templateError }, { data: shiftRows, error: shiftError }, { data: staffRows, error: staffError }, { data: totalsRows, error: totalsError }] = await Promise.all([
      supabase.from('shift_templates').select('*').order('start_time'),
      supabase.from('shifts').select('*').order('opened_at', { ascending: false }).limit(100),
      supabase.from('staff_accounts').select('*').order('created_at', { ascending: false }),
      supabase.rpc('get_shift_accountability_summary'),
    ]);
    if (templateError || shiftError || staffError) { toast.error(t('shiftLoadError')); return; }
    setTemplates((templateRows ?? []) as Template[]);
    setShifts((shiftRows ?? []) as Shift[]);
    setStaff((staffRows ?? []) as StaffAccount[]);
    setAccountability((totalsError ? [] : totalsRows ?? []) as Accountability[]);
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  async function saveTemplate() {
    if (!templateDraft) return;
    setBusy(true);
    const { error } = await supabase.from('shift_templates').update({ name_ar: templateDraft.name_ar, name_en: templateDraft.name_en, start_time: templateDraft.start_time, end_time: templateDraft.end_time, grace_minutes: templateDraft.grace_minutes, is_active: templateDraft.is_active }).eq('id', templateDraft.id);
    setBusy(false);
    if (error) { toast.error(t('shiftTemplateError')); return; }
    toast.success(t('shiftTemplateSaved'));
    setTemplateDraft(null);
    await load();
  }
  async function addTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    const { error } = await supabase.from('shift_templates').insert({ name_ar: String(form.get('name_ar')), name_en: String(form.get('name_en')), start_time: String(form.get('start_time')), end_time: String(form.get('end_time')), grace_minutes: Number(form.get('grace_minutes')) || 5, is_active: true });
    setBusy(false);
    if (error) { toast.error(t('shiftTemplateError')); return; }
    formElement.reset();
    await load();
  }
  function staffErrorMessage(message: string) {
    const normalized = message.toLowerCase();
    if (normalized.includes('last active owner')) return t('staffLastOwnerBlocked');
    if (normalized.includes('own') && (normalized.includes('owner') || normalized.includes('staff account'))) return t('staffSelfChangeBlocked');
    if (normalized.includes('sales or shift history')) return t('staffDeleteHasHistory');
    return t('shiftLoadError');
  }
  async function assignCashier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc('assign_staff_role', { p_email: email.trim(), p_role: 'cashier', p_display_name: staffName.trim() || null });
    setBusy(false);
    if (error) { toast.error(staffErrorMessage(error.message)); return; }
    setEmail(''); setStaffName(''); toast.success(t('staffAssigned')); await load();
  }
  async function updateStaff(account: StaffAccount, patch: Partial<Pick<StaffAccount, 'role' | 'is_active'>>) {
    const activeOwnerCount = staff.filter((entry) => entry.role === 'owner' && entry.is_active).length;
    if (account.user_id === currentUserId && account.role === 'owner' && patch.role === 'cashier') {
      toast.error(t('staffSelfChangeBlocked'));
      return;
    }
    if (account.user_id === currentUserId && account.is_active && patch.is_active === false) {
      toast.error(t('staffSelfChangeBlocked'));
      return;
    }
    if (account.role === 'owner' && account.is_active && activeOwnerCount <= 1 && (patch.role === 'cashier' || patch.is_active === false)) {
      toast.error(t('staffLastOwnerBlocked'));
      return;
    }
    if (patch.role) {
      if (!account.email) { toast.error(t('shiftLoadError')); return; }
      const { error } = await supabase.rpc('assign_staff_role', { p_email: account.email, p_role: patch.role, p_display_name: account.display_name });
      if (error) { toast.error(staffErrorMessage(error.message)); return; }
    } else {
      const { error } = await supabase.rpc('set_staff_account_active', { p_user_id: account.user_id, p_is_active: patch.is_active ?? account.is_active });
      if (error) { toast.error(staffErrorMessage(error.message)); return; }
    }
    await load();
  }
  async function deleteStaff(account: StaffAccount) {
    const activeOwnerCount = staff.filter((entry) => entry.role === 'owner' && entry.is_active).length;
    if (account.user_id === currentUserId) { toast.error(t('staffSelfChangeBlocked')); return; }
    if (account.role === 'owner' && account.is_active && activeOwnerCount <= 1) { toast.error(t('staffLastOwnerBlocked')); return; }
    if (!window.confirm(t('staffDeleteConfirm'))) return;

    setDeletingStaffId(account.user_id);
    const [{ count: shiftCount, error: shiftError }, { count: orderCount, error: orderError }] = await Promise.all([
      supabase.from('shifts').select('id', { count: 'exact', head: true }).eq('cashier_id', account.user_id),
      supabase.from('orders').select('id', { count: 'exact', head: true }).or(`cashier_id.eq.${account.user_id},created_by.eq.${account.user_id}`),
    ]);
    if (shiftError || orderError) {
      setDeletingStaffId(null);
      toast.error(t('shiftLoadError'));
      return;
    }
    if ((shiftCount ?? 0) > 0 || (orderCount ?? 0) > 0) {
      setDeletingStaffId(null);
      toast.error(t('staffDeleteHasHistory'));
      return;
    }

    const { error } = await supabase.rpc('delete_staff_account_safe', { p_user_id: account.user_id });
    setDeletingStaffId(null);
    if (error) { toast.error(staffErrorMessage(error.message)); return; }
    toast.success(t('staffDeleted'));
    await load();
  }

  const punctualityBadge = (shift: Shift) => {
    if (shift.punctuality_status === 'late') return { label: t('shiftLateBy').replace('{duration}', formatDurationMinutes(shift.punctuality_diff_minutes, lang)), tone: 'bg-amber-50 text-amber-800' };
    if (shift.punctuality_status === 'early') return { label: t('shiftEarlyBy').replace('{duration}', formatDurationMinutes(Math.abs(shift.punctuality_diff_minutes), lang)), tone: 'bg-stone-100 text-stone-700' };
    return { label: t('shiftOnTime'), tone: 'bg-emerald-50 text-emerald-800' };
  };
  const checkoutBadge = (shift: Shift) => {
    if (!shift.closed_at || !shift.checkout_status || shift.checkout_diff_minutes == null) return shift.status === 'open' ? { label: t('shiftOpenStatus'), tone: 'bg-stone-100 text-stone-700' } : { label: t('shiftCheckoutUnknown'), tone: 'bg-stone-100 text-stone-600' };
    if (shift.checkout_status === 'overtime') return { label: t('shiftCheckoutOvertime').replace('{duration}', formatDurationMinutes(Math.max(0, shift.checkout_diff_minutes), lang)), tone: 'bg-emerald-50 text-emerald-800 ring-1 ring-[#B89650]/40' };
    if (shift.checkout_status === 'early_leave') return { label: t('shiftCheckoutEarlyLeave').replace('{duration}', formatDurationMinutes(Math.abs(shift.checkout_diff_minutes), lang)), tone: 'bg-amber-50 text-amber-800' };
    return { label: t('shiftCheckoutOnTime'), tone: 'bg-stone-100 text-stone-700' };
  };
  const cashierAccounts = staff.filter((account) => account.role === 'cashier');
  return <div dir={dir} className="space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9A7A3D]">{t('staffRoleOwner')}</p><h1 className="mt-2 text-2xl font-bold text-stone-900">{t('shifts')}</h1><p className="mt-1 text-sm text-stone-500">{t('shiftAttendance')}</p></header>
    <section className="rounded-lg border border-stone-200 bg-white p-4 sm:p-6"><h2 className="text-lg font-bold text-stone-900">{t('shiftTemplate')}</h2>
      <div className="mt-4 space-y-3">{templates.map((template) => templateDraft?.id === template.id ? <div key={template.id} className="grid gap-3 rounded-md border border-[#B89650]/50 bg-stone-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold text-stone-600">{t('shiftNameAr')}<input value={templateDraft.name_ar} onChange={(event) => setTemplateDraft({ ...templateDraft, name_ar: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm" /></label>
        <label className="text-xs font-semibold text-stone-600">{t('shiftNameEn')}<input dir="ltr" value={templateDraft.name_en} onChange={(event) => setTemplateDraft({ ...templateDraft, name_en: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-start text-sm" /></label>
        <label className="text-xs font-semibold text-stone-600">{t('shiftStartTime')}<input type="time" value={templateDraft.start_time.slice(0, 5)} onChange={(event) => setTemplateDraft({ ...templateDraft, start_time: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-2 text-sm" /></label>
        <label className="text-xs font-semibold text-stone-600">{t('shiftEndTime')}<input type="time" value={templateDraft.end_time.slice(0, 5)} onChange={(event) => setTemplateDraft({ ...templateDraft, end_time: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-2 text-sm" /></label>
        <label className="text-xs font-semibold text-stone-600">{t('shiftGrace')}<input type="number" min="0" value={templateDraft.grace_minutes} onChange={(event) => setTemplateDraft({ ...templateDraft, grace_minutes: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-2 text-sm" /></label>
        <label className="flex items-center gap-2 text-xs font-semibold text-stone-600"><input type="checkbox" checked={templateDraft.is_active} onChange={(event) => setTemplateDraft({ ...templateDraft, is_active: event.target.checked })} />{t('active')}</label>
        <div className="flex items-end gap-2 lg:col-span-2"><button type="button" disabled={busy} onClick={() => void saveTemplate()} className="h-10 rounded-md bg-stone-900 px-4 text-sm font-bold text-white">{busy ? t('saving') : t('shiftTemplateSave')}</button><button type="button" onClick={() => setTemplateDraft(null)} className="h-10 rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-700">{t('shiftTemplateCancel')}</button></div>
      </div> : <div key={template.id} className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-stone-200 p-4"><div><p className="font-bold text-stone-900">{lang === 'ar' ? template.name_ar : template.name_en} <span className="text-xs font-medium text-stone-500">· {template.start_time.slice(0, 5)}–{template.end_time.slice(0, 5)}</span></p><p className="mt-1 text-xs text-stone-500">{template.name_ar} / {template.name_en} · {t('shiftGrace')}: {new Intl.NumberFormat(lang).format(template.grace_minutes)} · {template.is_active ? t('active') : t('inactive')}</p></div><button type="button" onClick={() => setTemplateDraft({ ...template })} className="h-10 rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50">{t('shiftTemplateEdit')}</button></div>)}</div>
      <form onSubmit={(event) => void addTemplate(event)} className="mt-4 grid gap-3 rounded-md bg-stone-50 p-3 sm:grid-cols-2 lg:grid-cols-6"><input required name="name_ar" placeholder={t('shiftTemplate')} className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm" /><input required name="name_en" placeholder={t('shiftTemplate')} className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm" /><input required name="start_time" type="time" className="h-10 rounded-md border border-stone-300 bg-white px-2 text-sm" /><input required name="end_time" type="time" className="h-10 rounded-md border border-stone-300 bg-white px-2 text-sm" /><input name="grace_minutes" type="number" min="0" defaultValue="5" className="h-10 rounded-md border border-stone-300 bg-white px-2 text-sm" /><button disabled={busy} className="flex h-10 items-center justify-center gap-2 rounded-md bg-stone-900 px-3 text-sm font-bold text-white">{busy && <LoaderCircle className="size-4 animate-spin" />}{t('shiftAddTemplate')}</button></form>
    </section>
    <form onSubmit={(event) => void assignCashier(event)} className="rounded-lg border border-stone-200 bg-white p-4 sm:p-6"><h2 className="text-lg font-bold text-stone-900">{t('staffManagement')}</h2><p className="mt-1 text-sm text-stone-500">{t('staffRoleCashier')} · {t('staffEmail')}</p><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('staffEmail')} className="h-11 rounded-md border border-stone-300 px-3 text-sm" /><input value={staffName} onChange={(event) => setStaffName(event.target.value)} placeholder={t('staffName')} className="h-11 rounded-md border border-stone-300 px-3 text-sm" /><button disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-md bg-stone-900 px-4 text-sm font-bold text-white"><UserPlus className="size-4" />{t('assignCashier')}</button></div></form>
    {cashierAccounts.length > 0 && <section className="rounded-lg border border-stone-200 bg-white p-4 sm:p-6"><h2 className="text-lg font-bold text-stone-900">{t('staffManagement')}</h2><div className="mt-3 divide-y divide-stone-100">{cashierAccounts.map((account) => {
      const activeOwnerCount = staff.filter((entry) => entry.role === 'owner' && entry.is_active).length;
      const isCurrentOwner = account.user_id === currentUserId && account.role === 'owner';
      const isLastActiveOwner = account.role === 'owner' && account.is_active && activeOwnerCount <= 1;
      const roleDisabledReason = isCurrentOwner ? t('staffSelfChangeBlocked') : isLastActiveOwner ? t('staffLastOwnerBlocked') : undefined;
      const activeDisabledReason = account.is_active && isCurrentOwner ? t('staffSelfChangeBlocked') : isLastActiveOwner ? t('staffLastOwnerBlocked') : undefined;
      const deleteDisabledReason = isCurrentOwner ? t('staffSelfChangeBlocked') : isLastActiveOwner ? t('staffLastOwnerBlocked') : undefined;
      return <div key={account.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold text-stone-800">{account.display_name || account.email || account.user_id}</p><p dir="ltr" className="text-xs text-stone-500">{account.email}</p></div><div className="flex items-center gap-2"><span title={roleDisabledReason} className="inline-flex"><select value={account.role} onChange={(event) => void updateStaff(account, { role: event.target.value as 'owner' | 'cashier' })} aria-label={t('staffRoleCashier')} title={roleDisabledReason} disabled={Boolean(roleDisabledReason)} className="h-10 rounded-md border border-stone-300 bg-white px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"><option value="cashier">{t('staffRoleCashier')}</option><option value="owner">{t('staffRoleOwner')}</option></select></span><span title={activeDisabledReason} className="inline-flex"><button type="button" onClick={() => void updateStaff(account, { is_active: !account.is_active })} title={activeDisabledReason} disabled={Boolean(activeDisabledReason)} className={`h-10 rounded-md border px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 ${account.is_active ? 'border-emerald-300 text-emerald-800' : 'border-stone-300 text-stone-500'}`}>{account.is_active ? t('active') : t('inactive')}</button></span><span title={deleteDisabledReason} className="inline-flex"><button type="button" onClick={() => void deleteStaff(account)} disabled={Boolean(deleteDisabledReason) || deletingStaffId === account.user_id} title={deleteDisabledReason ?? t('staffDelete')} aria-label={`${t('staffDelete')}: ${account.display_name || account.email || account.user_id}`} className="inline-flex h-10 items-center gap-1 rounded-md border border-red-200 px-3 text-xs font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">{deletingStaffId === account.user_id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{t('staffDelete')}</button></span></div></div>;
    })}</div></section>}
    <section className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <div className="border-b border-stone-200 p-4"><h2 className="text-lg font-bold text-stone-900">{t('shiftAccountability')}</h2></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-start text-sm"><thead className="bg-stone-50 text-xs text-stone-500"><tr>{[t('staffName'), t('shiftTotalLate'), t('shiftTotalOvertime')].map((label) => <th key={label} className="px-4 py-3 text-start">{label}</th>)}</tr></thead><tbody className="divide-y divide-stone-100">{accountability.map((row) => <tr key={row.cashier_id}><td className="px-4 py-3 font-semibold text-stone-800">{row.cashier_name}</td><td className="px-4 py-3 font-bold tabular-nums text-amber-800">{formatDurationMinutes(Number(row.total_late_minutes), lang)}</td><td className="px-4 py-3 font-bold tabular-nums text-emerald-800">{formatDurationMinutes(Number(row.total_overtime_minutes), lang)}</td></tr>)}</tbody></table>{accountability.length === 0 && <p className="p-5 text-sm text-stone-500">{t('shiftNoAccountability')}</p>}</div>
    </section>
    <section className="overflow-hidden rounded-lg border border-stone-200 bg-white"><div className="border-b border-stone-200 p-4"><h2 className="text-lg font-bold text-stone-900">{t('shiftAttendance')}</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-start text-sm"><thead className="bg-stone-50 text-xs text-stone-500"><tr>{[t('staffName'), t('shiftScheduledCheckIn'), t('shiftPunctuality'), t('shiftCheckOutTime'), t('shiftOpeningCash'), t('shiftExpectedCash'), t('shiftClosingCash'), t('shiftVariance')].map((label) => <th key={label} className="px-4 py-3 text-start">{label}</th>)}</tr></thead><tbody className="divide-y divide-stone-100">{shifts.map((shift) => {
        const punctuality = punctualityBadge(shift);
        const checkout = checkoutBadge(shift);
        const formatDateTime = (value: string) => new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
        return <tr key={shift.id}>
          <td className="px-4 py-3">{shift.cashier_name || shift.cashier_id}</td>
          <td className="px-4 py-3 tabular-nums"><p className="text-xs text-stone-500">{t('shiftScheduledCheckIn')}: {formatDateTime(shift.scheduled_start_at)}</p><p className="mt-1">{t('shiftActualCheckIn')}: {formatDateTime(shift.opened_at)}</p></td>
          <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${punctuality.tone}`}>{punctuality.label}</span></td>
          <td className="px-4 py-3 tabular-nums"><p>{shift.closed_at ? formatDateTime(shift.closed_at) : '—'}</p>{shift.scheduled_end_at && <p className="mt-1 text-xs text-stone-500">{t('shiftSchedule')}: {formatDateTime(shift.scheduled_end_at)}</p>}<span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${checkout.tone}`}>{checkout.label}</span></td>
          <td className="px-4 py-3 tabular-nums">{formatCurrency(Number(shift.opening_cash_egp))}</td>
          <td className="px-4 py-3 tabular-nums">{shift.expected_cash_egp == null ? '—' : formatCurrency(Number(shift.expected_cash_egp))}</td>
          <td className="px-4 py-3 tabular-nums">{shift.actual_closing_cash_egp == null ? '—' : formatCurrency(Number(shift.actual_closing_cash_egp))}</td>
          <td className="px-4 py-3 tabular-nums">{shift.cash_variance_egp == null ? '—' : formatCurrency(Number(shift.cash_variance_egp))}</td>
        </tr>;
      })}</tbody></table></div></section>
  </div>;
}
