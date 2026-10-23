import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Rupees for the screen. One helper, so no page invents its own format. */
export const inr = (n: number | string | null | undefined) =>
  '₹' + Number(n || 0).toLocaleString('en-IN');
