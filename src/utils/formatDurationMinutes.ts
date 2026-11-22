/** Format a minute count as a compact bilingual duration. */
export function formatDurationMinutes(minutes: number, lang: 'ar' | 'en'): string {
  if (!Number.isFinite(minutes)) return lang === 'ar' ? '0 دقيقة' : '0m';
  const rounded = Math.trunc(Math.abs(minutes));
  const sign = minutes < 0 ? '−' : '';
  const hours = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  if (lang === 'en') return `${sign}${hours ? `${hours}h` : ''}${hours && remaining ? ' ' : ''}${remaining ? `${remaining}m` : hours ? '' : '0m'}`;
  const hourLabel = hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتان' : hours % 100 >= 3 && hours % 100 <= 10 ? 'ساعات' : hours ? 'ساعة' : '';
  const minuteLabel = remaining === 2 ? 'دقيقتان' : remaining >= 3 && remaining <= 10 ? 'دقائق' : 'دقيقة';
  const hoursText = hours ? `${sign}${hours} ${hourLabel}` : '';
  const minutesText = remaining ? `${remaining} ${minuteLabel}` : '';
  if (hoursText && minutesText) return `${hoursText} و ${minutesText}`;
  if (hoursText) return hoursText;
  return `${sign}${rounded} ${minuteLabel}`;
}
