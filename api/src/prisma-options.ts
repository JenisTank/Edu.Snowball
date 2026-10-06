// Shared Prisma client construction options.
//
// Optional driver-adapter mode: set BB_PG_ADAPTER=1 to run Prisma through the
// `pg` driver adapter instead of the downloaded query-engine binary (useful on
// machines/CI that cannot reach binaries.prisma.sh). Unset = stock behaviour.
export function prismaOptions(): any {
  if (process.env.BB_PG_ADAPTER !== '1') return {};
  try {
    // require() keeps these optional — they are not production dependencies.
    const { PrismaPg } = require('@prisma/adapter-pg');
    return { adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) };
  } catch {
    console.warn('⚠️ BB_PG_ADAPTER=1 but @prisma/adapter-pg is not installed — using the default engine');
    return {};
  }
}
