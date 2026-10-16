export function fmt(x: number, decimals = 0): string {
  return x.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Formato para explicaciones en español (coma decimal no: mantenemos punto para coincidir con el test). */
export function fmtAuto(x: number, maxDecimals = 2): string {
  return x.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
}

export function fmtTime(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Interpreta lo que escribe el usuario: admite comas de miles, espacios y "%". */
export function parseUserNumber(raw: string): number | null {
  if (raw == null) return null;
  let s = raw.trim().replace(/\s/g, '').replace(/%$/, '');
  if (!s) return null;
  // "1,234.5" -> miles con coma; "12,5" -> coma decimal
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
