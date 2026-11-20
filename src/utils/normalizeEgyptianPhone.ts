export function normalizeEgyptianPhone(phone: string): string | null {
  const compact = phone.replace(/[\s()\-]/g, '');
  const local = compact.startsWith('+20') ? `0${compact.slice(3)}` : compact.startsWith('0020') ? `0${compact.slice(4)}` : compact;
  return /^01[0125]\d{8}$/.test(local) ? local : null;
}
