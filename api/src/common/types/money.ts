/**
 * Money as Prisma hands it back.
 *
 * `@db.Decimal` columns arrive as `Prisma.Decimal`, which is neither a `number`
 * nor a `string` for TypeScript even though it behaves like both. Rule helpers
 * accept anything numeric-looking and coerce with `num()`; widening here is what
 * lets one rule serve the database row, a CSV import and a test fixture.
 */
export type Money = number | string | { toString(): string } | null | undefined;

/** Coerce any of the above to a number (null/NaN → 0). */
export const money = (v: Money): number => (v == null ? 0 : Number(v) || 0);
