import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { LoaderCircle, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';

type Template = { id: string; name_ar: string; name_en: string; start_time: string; end_time: string; grace_minutes: number; is_active: boolean };
type Shift = { id: string; cashier_name: string | null; cashier_id: string; scheduled_start_at: string; opened_at: string; closed_at: string | null; status: string; punctuality_status: string; punctuality_diff_minutes: number; opening_cash_egp: number; expected_cash_egp: number | null; actual_closing_cash_egp: number | null; cash_variance_egp: number | null };
type StaffAccount = { user_id: string; email: string | null; role: 'owner' | 'cashier'; display_name: string | null; is_active: boolean };

export function ShiftManagementPage() {
  const { t, lang, dir, formatCurrency } = useTranslation();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateDraft, setTemplateDraft] = useState<Template | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [email, setEmail] = useState('');
  const [staffName, setStaffName] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [{ data: templateRows, error: templateError }, { data: shiftRows, error: shiftError }, { data: staffRows, error: staffError }] = await Promise.all([
      supabase.from('shift_templates').select('*').order('start_time'),
      supabase.from('shifts').select('*').order('opened_at', { ascending: false }).limit(100),
      supabase.from('staff_accounts').select('*').order('created_at', { ascending: false }),
    ]);
    if (templateError || shiftError || staffError) { toast.error(t('shiftLoadError')); return; }
    setTemplates((templateRows ?? []) as Template[]);
    setShifts((shiftRows ?? []) as Shift[]);
    setStaff((staffRows ?? []) as StaffAccount[]);
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
  async function assignCashier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc('assign_staff_role', { p_email: email.trim(), p_role: 'cashier', p_display_name: staffName.trim() || null });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setEmail(''); setStaffName(''); toast.success(t('staffAssigned'));
  }
  async function updateStaff(account: StaffAccount, patch: Partial<Pick<StaffAccount, 'role' | 'is_active'>>) {
    if (patch.role && account.email) {
      const { error } = await supabase.rpc('assign_staff_role', { p_email: account.email, p_role: patch.role, p_display_name: account.display_name });
      if (error) { toast.error(t('shiftLoadError')); return; }
    } else {
      const { error } = await supabase.from('staff_accounts').update(patch).eq('user_id', account.user_id);
      if (error) { toast.error(t('shiftLoadError')); return; }
    }
    await load();
  }

  const punctualityLabel = (status: string) => status === 'early' ? t('shiftEarly') : status === 'late' ? t('shiftLate') : t('shiftOnTime');
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
    {staff.length > 0 && <section className="rounded-lg border border-stone-200 bg-white p-4 sm:p-6"><h2 className="text-lg font-bold text-stone-900">{t('staffManagement')}</h2><div className="mt-3 divide-y divide-stone-100">{staff.map((account) => <div key={account.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold text-stone-800">{account.display_name || account.email || account.user_id}</p><p dir="ltr" className="text-xs text-stone-500">{account.email}</p></div><div className="flex items-center gap-2"><select value={account.role} onChange={(event) => void updateStaff(account, { role: event.target.value as 'owner' | 'cashier' })} aria-label={t('staffRoleCashier')} className="h-10 rounded-md border border-stone-300 bg-white px-2 text-sm"><option value="cashier">{t('staffRoleCashier')}</option><option value="owner">{t('staffRoleOwner')}</option></select><button type="button" onClick={() => void updateStaff(account, { is_active: !account.is_active })} className={`h-10 rounded-md border px-3 text-xs font-bold ${account.is_active ? 'border-emerald-300 text-emerald-800' : 'border-stone-300 text-stone-500'}`}>{account.is_active ? t('active') : t('inactive')}</button></div></div>)}</div></section>}
    <section className="overflow-hidden rounded-lg border border-stone-200 bg-white"><div className="border-b border-stone-200 p-4"><h2 className="text-lg font-bold text-stone-900">{t('shiftAttendance')}</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-start text-sm"><thead className="bg-stone-50 text-xs text-stone-500"><tr>{[t('staffName'), t('shiftSchedule'), t('shiftPunctuality'), t('shiftOpeningCash'), t('shiftExpectedCash'), t('shiftClosingCash'), t('shiftVariance')].map((label) => <th key={label} className="px-4 py-3 text-start">{label}</th>)}</tr></thead><tbody className="divide-y divide-stone-100">{shifts.map((shift) => <tr key={shift.id}><td className="px-4 py-3">{shift.cashier_name || shift.cashier_id}</td><td className="px-4 py-3 tabular-nums">{new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(shift.scheduled_start_at))} · {new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(shift.opened_at))}</td><td className="px-4 py-3">{punctualityLabel(shift.punctuality_status)} ({new Intl.NumberFormat(lang).format(shift.punctuality_diff_minutes)} {lang === 'ar' ? 'دقيقة' : 'min'})</td><td className="px-4 py-3 tabular-nums">{formatCurrency(Number(shift.opening_cash_egp))}</td><td className="px-4 py-3 tabular-nums">{shift.expected_cash_egp == null ? '—' : formatCurrency(Number(shift.expected_cash_egp))}</td><td className="px-4 py-3 tabular-nums">{shift.actual_closing_cash_egp == null ? '—' : formatCurrency(Number(shift.actual_closing_cash_egp))}</td><td className="px-4 py-3 tabular-nums">{shift.cash_variance_egp == null ? '—' : formatCurrency(Number(shift.cash_variance_egp))}</td></tr>)}</tbody></table></div></section>
  </div>;
}
