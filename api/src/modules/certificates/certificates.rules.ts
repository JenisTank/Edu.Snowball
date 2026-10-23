/**
 * Certificate serial rules — pure functions, no database access.
 * Serials are sequential per unit and never reused.
 */
export const ACADEMIC_YEAR_SHORT = '2627';

export function nextSerial(prefix: string, lastSerialNo: string | null | undefined): number {
  if (!lastSerialNo || !lastSerialNo.startsWith(prefix)) return 1;
  const n = parseInt(lastSerialNo.slice(prefix.length), 10);
  return Number.isFinite(n) ? n + 1 : 1;
}

export function certificateNo(unitCode: string, serial: number): string {
  return `BB-${unitCode}-CERT-${ACADEMIC_YEAR_SHORT}-${String(serial).padStart(4, '0')}`;
}
