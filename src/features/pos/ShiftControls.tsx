import { useCallback, useEffect, useState } from 'react';
import { Banknote, Clock3, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';
import { useStaffStore } from '../../store/staffStore';

type Template = { id: string; name_ar: string; name_en: string; start_time: string; end_time: string; grace_minutes: number };
type Summary = { shift_id: string; opened_at: string; opening_cash_egp: number; orders_count: number; cash_sales_egp: number; digital_sales_egp: number; total_sales_egp: number };
type ClosingSummary = { expected_cash_egp: number; actual_closing_cash_egp: number; cash_variance_egp: number };

export function ShiftControls() {
  const { t, lang, formatCurrency } = useTranslation();
  const role = useStaffStore((state) => state.role);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [closingSummary, setClosingSummary] = useState<ClosingSummary | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [openingCash, setOpeningCash] = useState('0');
  const [closingCash, setClosingCash] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [{ data: summaryData, error: summaryError }, { data: templateRows }] = await Promise.all([
      supabase.rpc('get_current_shift_summary'),
      supabase.from('shift_templates').select('id,name_ar,name_en,start_time,end_time,grace_minutes').eq('is_active', true).order('start_time'),
    ]);
    if (summaryError) { toast.error(t('shiftLoadError')); return; }
    setSummary(summaryData as Summary | null);
    const nextTemplates = (templateRows ?? []) as Template[];
    setTemplates(nextTemplates);
    setTemplateId((current) => current || nextTemplates[0]?.id || '');
  }, [t]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function startShift() {
    if (!templateId || Number(openingCash) < 0) return;
    setBusy(true);
    const { error } = await supabase.rpc('open_cashier_shift', { p_template_id: templateId, p_opening_cash: Number(openingCash) });
    setBusy(false);
    if (error) { toast.error(error.message.includes('open shift') ? t('shiftAlreadyOpen') : t('shiftLoadError')); return; }
    toast.success(t('shiftOpened'));
    setClosingSummary(null);
    window.dispatchEvent(new Event('different-store-shift-updated'));
    await refresh();
  }

  async function closeShift() {
    if (!summary || closingCash === '' || Number(closingCash) < 0) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('close_cashier_shift', { p_shift_id: summary.shift_id, p_actual_closing_cash: Number(closingCash), p_notes: null });
    setBusy(false);
    if (error) { toast.error(t('shiftLoadError')); return; }
    toast.success(t('shiftClosed'));
    setClosingSummary(data as ClosingSummary);
    window.dispatchEvent(new Event('different-store-shift-updated'));
    setSummary(null);
    setClosingCash('');
  }

  if (!role) return null;
  return <section className="mb-5 rounded-lg border border-stone-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><Clock3 className="size-5 text-[#B89650]" /><h2 className="font-bold text-stone-900">{summary ? t('shiftStaffSummary') : t('shifts')}</h2></div>
      {summary && <span className="text-xs text-stone-500">{new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(summary.opened_at))}</span>}
    </div>
    {summary ? <>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[[t('shiftOrders'), new Intl.NumberFormat(lang).format(summary.orders_count)], [t('shiftSales'), formatCurrency(Number(summary.total_sales_egp))], [t('shiftCashSales'), formatCurrency(Number(summary.cash_sales_egp))], [t('shiftDigitalSales'), formatCurrency(Number(summary.digital_sales_egp))], [t('shiftExpectedCash'), formatCurrency(Number(summary.opening_cash_egp) + Number(summary.cash_sales_egp))]].map(([label, value]) => <div key={label} className="rounded-md bg-stone-50 p-3"><p className="text-xs text-stone-500">{label}</p><p className="mt-1 font-bold tabular-nums text-stone-900">{value}</p></div>)}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-44 flex-1 text-xs font-semibold text-stone-600">{t('shiftClosingCash')}<input type="number" min="0" step="0.01" value={closingCash} onChange={(event) => setClosingCash(event.target.value)} className="mt-1.5 h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-start text-sm tabular-nums" /></label><button type="button" disabled={busy || closingCash === ''} onClick={() => void closeShift()} className="flex h-11 items-center justify-center gap-2 rounded-md bg-stone-900 px-4 text-sm font-bold text-white disabled:opacity-50">{busy && <LoaderCircle className="size-4 animate-spin" />}{t('shiftEnd')}</button></div>
    </> : <>
      {closingSummary && <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">{[[t('shiftExpectedCash'), formatCurrency(closingSummary.expected_cash_egp)], [t('shiftClosingCash'), formatCurrency(closingSummary.actual_closing_cash_egp)], [t('shiftVariance'), formatCurrency(closingSummary.cash_variance_egp)]].map(([label, value]) => <div key={label} className="rounded-md bg-stone-50 p-3"><p className="text-xs text-stone-500">{label}</p><p className="mt-1 font-bold tabular-nums text-stone-900">{value}</p></div>)}</div>}
      <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="min-w-44 flex-1 text-xs font-semibold text-stone-600">{t('shiftTemplate')}<select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="mt-1.5 h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-start text-sm"><option value="">{t('shiftTemplate')}</option>{templates.map((template) => <option key={template.id} value={template.id}>{lang === 'ar' ? template.name_ar : template.name_en} · {template.start_time.slice(0, 5)}–{template.end_time.slice(0, 5)}</option>)}</select></label>
      <label className="min-w-40 flex-1 text-xs font-semibold text-stone-600"><span className="inline-flex items-center gap-1"><Banknote className="size-3.5" />{t('shiftOpeningCash')}</span><input type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} className="mt-1.5 h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-start text-sm tabular-nums" /></label>
      <button type="button" disabled={busy || !templateId || Number(openingCash) < 0} onClick={() => void startShift()} className="flex h-11 items-center justify-center gap-2 rounded-md bg-stone-900 px-4 text-sm font-bold text-white disabled:opacity-50">{busy && <LoaderCircle className="size-4 animate-spin" />}{t('shiftStart')}</button>
      </div>
    </>}
    {role === 'cashier' && !summary && <p role="status" className="mt-3 text-sm font-medium text-amber-800">{t('shiftRequired')}</p>}
  </section>;
}
