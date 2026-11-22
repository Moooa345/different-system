export function formatMonthlySoldLabel(count: number, lang: 'ar' | 'en'): string | null {
  if (!Number.isFinite(count) || count < 5) return null;
  const tier = count >= 200 ? 200 : count >= 100 ? 100 : count >= 50 ? 50 : count >= 20 ? 20 : count >= 10 ? 10 : 5;
  if (lang === 'en') return `${tier}+ bought this month`;
  const noun = tier >= 20 ? 'قطعة' : 'قطع';
  return `أكثر من ${tier} ${noun} مباعة هذا الشهر`;
}
