#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# BumbleB Kidz ERP — run the whole stack in a dev sandbox
#
#   bash scripts/sandbox-preview.sh          # prepare + print how to start
#   bash scripts/sandbox-preview.sh --serve  # also start API + web (foreground)
#
# Why this exists
# ---------------
# Normally the stack is `docker compose up` (Postgres + Redis + API + web).
# Some dev sandboxes have no Docker and no outbound access to
# binaries.prisma.sh, so `prisma generate` cannot download a query engine and
# the API cannot start. This script reproduces the stack anyway:
#
#   * Postgres  — the `embedded-postgres` npm package ships real binaries
#                 (initdb/pg_ctl/postgres) in an npm tarball, so no root, no
#                 Docker and no CDN are needed.
#   * Redis     — optional. Without it the queue stays idle; the API, auth and
#                 every read/write path still work (the scheduler falls back to
#                 its in-process tick).
#   * Prisma    — a **throwaway copy** of `api/` is patched to use the
#                 node-postgres driver adapter + query compiler (Prisma 6,
#                 `engineType = "client"`), which needs no engine binary at all.
#                 The committed repository is never modified — production keeps
#                 the standard engine-based client.
#
# Layout: everything mutable lives in $WORK (default /tmp/bb-preview).
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${WORK:-/tmp/bb-preview}"
PG_PORT="${PG_PORT:-5432}"
API_PORT="${API_PORT:-3000}"
WEB_PORT="${WEB_PORT:-5173}"
DB_NAME="bumblebkidz_erp"
DB_USER="bumbleb"
DATABASE_URL="postgresql://${DB_USER}@127.0.0.1:${PG_PORT}/${DB_NAME}"

say() { printf '\n\033[1;33m▸ %s\033[0m\n' "$*"; }

# ── 1. Postgres binaries from npm (no Docker, no root) ──────────────────────
say "Fetching the embedded Postgres binaries"
mkdir -p "$WORK/pg"
if [ ! -d "$WORK/pg/node_modules/embedded-postgres" ]; then
  (cd "$WORK/pg" && npm init -y >/dev/null && npm install --no-audit --no-fund embedded-postgres pg >/dev/null)
fi
PGBIN="$WORK/pg/node_modules/@embedded-postgres/linux-x64/native/bin"
[ -x "$PGBIN/initdb" ] || {
  echo "✖ embedded-postgres did not unpack on this platform ($(uname -s)/$(uname -m))." >&2
  echo "  Install Postgres locally and set DATABASE_URL instead." >&2
  exit 1
}

if [ ! -d "$WORK/pgdata" ]; then
  say "Creating the cluster in $WORK/pgdata"
  "$PGBIN/initdb" -D "$WORK/pgdata" -U "$DB_USER" --auth=trust -E UTF8 >/dev/null
fi

if ! "$PGBIN/pg_ctl" -D "$WORK/pgdata" status >/dev/null 2>&1; then
  say "Starting Postgres on :$PG_PORT"
  "$PGBIN/pg_ctl" -D "$WORK/pgdata" -l "$WORK/pg.log" \
    -o "-p $PG_PORT -k /tmp -c listen_addresses=127.0.0.1" start >/dev/null
fi

# ── 2. Database + schema + demo data ────────────────────────────────────────
say "Applying the migration and the seed"
(cd "$WORK/pg" && node -e "
const { Client } = require('pg');
const fs = require('fs');
const url = '${DATABASE_URL}';
const sqlFile = '${ROOT}/api/prisma/migrations/20261021120000_init/migration.sql';
(async () => {
  const admin = new Client({ connectionString: url.replace('/${DB_NAME}', '/postgres') });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = \$1', ['${DB_NAME}']);
  if (!exists.rowCount) await admin.query('CREATE DATABASE ${DB_NAME}');
  await admin.end();
  const db = new Client({ connectionString: url });
  await db.connect();
  const has = await db.query(\"SELECT 1 FROM information_schema.tables WHERE table_schema='public' LIMIT 1\");
  if (!has.rowCount) { await db.query(fs.readFileSync(sqlFile, 'utf8')); console.log('  schema applied'); }
  else console.log('  schema already present');
  await db.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
")

# ── 3. Throwaway API with the driver adapter ────────────────────────────────
if [ ! -f "$WORK/api/.prepared" ]; then
  say "Preparing an engine-free copy of the API in $WORK/api"
  rm -rf "$WORK/api"
  mkdir -p "$WORK/api"
  (cd "$ROOT" && tar cf - --exclude=node_modules --exclude=dist api) | tar xf - -C "$WORK"
  (cd "$WORK/api" && npm install --no-audit --no-fund >/dev/null \
    && npm install --no-audit --no-fund --no-save prisma@6 @prisma/client@6 @prisma/adapter-pg@6 pg >/dev/null)

  python3 - "$WORK/api" <<'PY'
import re, sys, pathlib
api = pathlib.Path(sys.argv[1])

schema = api / 'prisma/schema.prisma'
s = schema.read_text()
s = re.sub(r'generator client \{.*?\n\}', '''generator client {
  provider        = "prisma-client-js"
  engineType      = "client"
  previewFeatures = ["driverAdapters", "queryCompiler"]
}''', s, count=1, flags=re.S)
schema.write_text(s)

(api / 'src/common/database/prisma.service.ts').write_text('''import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Sandbox preview build: no Prisma engine binaries are reachable here, so the
// client talks to Postgres through node-postgres (driver adapter + query
// compiler). The committed repository keeps the engine-based service.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({ adapter } as any);
  }

  async onModuleInit() {
    await this.$connect();
  }
}
''')

seed = api / 'prisma/seed.ts'
s = seed.read_text()
s = s.replace("""const prisma = new PrismaClient();""", """import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Sandbox preview build — see src/common/database/prisma.service.ts.
const seedPool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(seedPool) } as any);""", 1)
seed.write_text(s)
PY

  (cd "$WORK/api" \
    && PRISMA_SCHEMA_ENGINE_BINARY=/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/bin/true \
       npx prisma generate >/dev/null)
  touch "$WORK/api/.prepared"
fi

say "Seeding demo data"
(cd "$WORK/api" && DATABASE_URL="$DATABASE_URL" npx ts-node --transpile-only prisma/seed.ts)

# ── 4. Frontend dependencies ────────────────────────────────────────────────
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  say "Installing frontend dependencies"
  # The design-system package is a git dependency; some sandboxes terminate TLS
  # at a proxy, hence --strict-ssl=false.
  (cd "$ROOT/frontend" && npm install --no-audit --no-fund --strict-ssl=false)
fi

cat <<EOF

─────────────────────────────────────────────────────────────
  Sandbox stack is ready.

  API   http://localhost:${API_PORT}/api      (health: /api/health)
  Web   http://localhost:${WEB_PORT}/         (proxies /api to the API)

  Demo logins — password bumbleb123
    founder@bumblebkidz.com        Founder, all units
    ch.u1@bumblebkidz.com          Centre Head, Unit 1
    teacher.u1@bumblebkidz.com     Teacher, K1 · Unit 1
    reception@bumblebkidz.com      Receptionist, admission hub
  Parent portal: http://localhost:${WEB_PORT}/parent
─────────────────────────────────────────────────────────────
EOF

if [ "${1:-}" = "--serve" ]; then
  say "Starting the API and the web app (Ctrl-C to stop)"
  export DATABASE_URL JWT_SECRET="${JWT_SECRET:-sandbox-preview-secret-please-change-0123456789}"
  export PII_KEY="${PII_KEY:-sandbox-preview-pii-key-0123456789abcd}"
  export PORT="$API_PORT" NODE_ENV=development
  (cd "$WORK/api" && npx ts-node --transpile-only src/main.ts) &
  API_PID=$!
  trap 'kill $API_PID 2>/dev/null || true' EXIT
  (cd "$ROOT/frontend" && npx vite --host 0.0.0.0 --port "$WEB_PORT")
else
  echo "Start the two servers with:"
  echo "  cd $WORK/api && DATABASE_URL=$DATABASE_URL JWT_SECRET=… PII_KEY=… npx ts-node --transpile-only src/main.ts"
  echo "  cd $ROOT/frontend && npm run dev -- --host 0.0.0.0 --port $WEB_PORT"
fi
