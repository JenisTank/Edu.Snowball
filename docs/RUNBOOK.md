# Runbook — BumbleB Kidz ERP

Operational guide for running the platform in production. Written for whoever
holds the pager, not only for the original author.

Companion documents: [`PENDING_ITEMS.md`](./PENDING_ITEMS.md) (what is built vs
blocked) and [`CODE_STRUCTURE.md`](./CODE_STRUCTURE.md) (how the code is laid out).

---

## 1. What runs where

| Piece      | Technology                   | Container    | Port | Notes                                        |
| ---------- | ---------------------------- | ------------ | ---- | -------------------------------------------- |
| API        | NestJS 10 + Prisma           | `api`        | 3000 | `/api/*`, global JWT guard per route         |
| Staff SPA  | Vite + React (Snowball UI)   | `frontend`   | 80   | nginx; proxies `/api` to the API             |
| Parent PWA | Same bundle, `/parent` route | —            | —    | Installable; no separate deploy              |
| Database   | PostgreSQL 16                | `db`         | 5432 | Named volume `pgdata`                        |
| Queue      | Redis 7 + BullMQ             | `redis`      | 6379 | Named volume `redisdata`                     |
| Scheduler  | In-process (05:00 IST tick)  | inside `api` | —    | Must never run twice — keep API at 1 replica |

> **Single-replica rule.** The daily scheduler and the BullMQ worker live in the
> API process. Running two API replicas would double-send absence alerts. Scale
> the web tier only after moving `startWorker`/`startScheduler` into a separate
> process (see §9).

---

## 1b. Running without Docker (dev sandboxes, laptops)

`docker compose` is the normal path, but some environments have no Docker and no
outbound access to `binaries.prisma.sh` (so `prisma generate` cannot download a
query engine). `scripts/sandbox-preview.sh` stands the whole stack up anyway:

```bash
bash scripts/sandbox-preview.sh          # prepare Postgres + schema + demo data
bash scripts/sandbox-preview.sh --serve  # also run the API (:3000) and web (:5173)
```

How it works, and why it never touches the committed code:

- **Postgres** comes from the `embedded-postgres` npm package — real
  `initdb`/`pg_ctl`/`postgres` binaries inside an npm tarball, so no root and no
  Docker. Data lives in `/tmp/bb-preview/pgdata` (override with `WORK=`).
- **The API runs from a throwaway copy** (`$WORK/api`) whose Prisma client uses
  the node-postgres driver adapter plus the query compiler
  (`engineType = "client"`, Prisma 6). That needs no engine binary at all. The
  repository keeps the standard engine-based client, so production is unchanged.
- **Redis is optional.** Without it the BullMQ queue stays idle and the health
  probe reports `redis: down`; every read/write path, the scheduler's in-process
  fallback and the parent portal keep working. If you want the queue, run a local
  `redis-server` and set `REDIS_URL`.

Demo logins are seeded (`bumbleb123`): `founder@bumblebkidz.com`,
`ch.u1@bumblebkidz.com`, `teacher.u1@bumblebkidz.com`,
`reception@bumblebkidz.com`. The parent portal is `/parent` on the same build.

## 2. First deployment

```bash
git clone <repo> && cd Edu.Snowball
cp .env.example .env
```

Fill in `.env` before starting anything:

| Variable                                   | Required | Effect when missing                              |
| ------------------------------------------ | -------- | ------------------------------------------------ |
| `DB_PASSWORD`                              | yes      | Compose refuses to start                         |
| `JWT_SECRET`                               | yes      | Compose refuses to start (32+ random chars)      |
| `EVOLUTION_API_URL` / `_KEY` / `_INSTANCE` | no       | Comms outbox stays in sandbox mode               |
| `UPI_VPA` / `UPI_PAYEE_NAME`               | no       | Units without their own UPI id cannot take UPI   |
| `STORAGE_DRIVER` / `STORAGE_DIR`           | no       | Documents default to a local volume              |
| `STORAGE_S3_*`                             | no       | Only read when `STORAGE_DRIVER=s3`               |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`   | no       | Push disabled; portal keeps working              |
| `PII_KEY`                                  | no       | PAN/UAN/bank encryption skipped (logged at boot) |
| `SENTRY_DSN`                               | no       | Error reporting off                              |
| `APP_RELEASE`                              | no       | Release tag defaults to the package version      |

```bash
docker compose up -d --build
docker compose exec api npx prisma migrate deploy
docker compose exec api node dist/prisma/seed.js     # demo data — skip in production
curl -fsS http://localhost:3000/api/health | jq
```

The SPA is then on `http://<host>/`, the API on `http://<host>/api`.

### TLS / domain

Terminate TLS at a reverse proxy (Caddy, nginx, or the VPS load balancer) and
forward to `frontend:80`. Web push and secure cookies require HTTPS. The `bb_token` cookie is written with `SameSite=None; Secure`, so it only
works over TLS.

---

## 3. Health & monitoring

| Endpoint                | Use                                | Behaviour                       |
| ----------------------- | ---------------------------------- | ------------------------------- |
| `GET /api/health`       | dashboards, humans                 | Always 200; body lists `issues` |
| `GET /api/health/ready` | load balancer / Docker healthcheck | 503 when any dependency is down |

The body reports `database`, `redis`, queue depths (`waiting`, `active`,
`failed`, `delayed`), `version`, `uptimeSeconds` and `issues`. Rules live in
`api/src/modules/health/health.rules.ts` and are unit-tested.

**What to page on**

- `/api/health/ready` returning 503 for >2 minutes.
- `issues` containing `database unreachable` — every screen is down.
- `issues` containing a failed-job count ≥ 50 — messages are piling up.

Sentry receives every 5xx from `AllExceptionsFilter`. Request bodies and cookies
are stripped in `beforeSend`, so child and payment data cannot leak into an
error report.

---

## 3b. Changing the schema (offline-safe)

`prisma generate` downloads engine binaries, which fails on restricted networks.
Two workarounds used while developing this repo:

```bash
# 1. Generate a typed client without the query engine (enough for tsc + tests)
PRISMA_QUERY_ENGINE_LIBRARY=/bin/true \
PRISMA_SCHEMA_ENGINE_BINARY=/bin/true \
npx prisma generate --no-engine

# 2. Validate the schema without a database, using Prisma's own WASM parser
npx --yes @prisma/prisma-schema-wasm   # or call validate() from the package
```

The baseline migration in `prisma/migrations/` is produced by
`prisma/generate-init-migration.py`. CI enforces that the committed SQL equals a
fresh run of that script **and** that `prisma migrate diff` finds no drift
against `schema.prisma`, so never hand-edit the migration.

## 4. Backups and the restore drill

```bash
# nightly (cron, 02:30 IST)
30 2 * * * cd /srv/bumbleb-erp && bash scripts/backup.sh >> /var/log/bumbleb-backup.log 2>&1
```

`scripts/backup.sh` writes `backups/bumblebkidz_<date>_<time>.sql.gz` plus a
`.manifest` (sha256, size, table count), verifies the dump contains core tables,
and prunes anything older than `RETENTION_DAYS` (default 30). A failed dump exits
non-zero — wire that to your alerting.

**Copy dumps off the host.** A backup on the same disk as the database is not a
backup. `rclone`, `aws s3 cp` or an rsync target is expected once the VPS exists.

**Restore drill — run it monthly, and before any migration:**

```bash
bash scripts/restore.sh backups/bumblebkidz_2026-10-22_0230.sql.gz
```

By default this restores into `bumblebkidz_restore_check`, compares checksums and
prints row counts. Nothing touches production data. An in-place restore needs
both `--in-place` and the exact database name typed at the prompt.

---

## 5. Releases and rollback

```bash
git fetch && git checkout <tag>
docker compose up -d --build          # blue/green not needed at one replica
docker compose exec api npx prisma migrate deploy
curl -fsS localhost:3000/api/health/ready
```

- **Migrations are forward-only.** `prisma migrate deploy` never drops data on
  its own, but a rollback of a schema change is a new migration, not `down`.
  Restore from the pre-migration dump if a deploy must be undone.
- **Take a dump before every deploy** (`bash scripts/backup.sh`).
- **Image rollback**: `docker compose up -d --build` on the previous tag, then
  restart. Redis jobs survive restarts (`appendonly yes`).

---

## 6. Scheduled work

| Time (IST) | Job                       | What it does                                                 |
| ---------- | ------------------------- | ------------------------------------------------------------ |
| 05:00      | `daily-attendance-plan`   | Builds the per-batch lock/alert/call timeline for the day    |
| lock + 30m | `absence-scan`            | Absence alerts, approved-leave suppression, 3-day escalation |
| lock + 2h  | `admin-call-list`         | Call tasks for unmarked or absent children                   |
| 05:15      | `unmarked-register-alert` | Tells the Centre Head a register is still blank              |
| nightly    | `runRetentionTick`        | DPDP retention purge (messages, audit, anonymisation)        |

These are BullMQ repeatable jobs registered by `api/src/jobs/scheduler.ts`. If
the queue is down nothing runs — `/api/health` says so.

---

## 7. Incident playbook

| Symptom                                    | First checks                                                                    | Likely fix                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Every screen 500s                          | `/api/health` → `database`                                                      | `docker compose ps`, `docker compose logs db`                            |
| Login works, pages empty                   | `/api/health` → `redis`; queue `failed`                                         | `docker compose restart redis`; inspect failed jobs                      |
| No absence alerts sent                     | Redis up? `MessageLog` rows with status `QUEUED`? Evolution instance connected? | Reconnect the instance (scan its QR); run `POST /api/comms/dispatch/run` |
| UPI QR opens but money is not in the bank  | Unit VPA wrong in Settings → Units                                              | Fix the VPA; regenerate the QR (the old one pays the old id)             |
| Parent says "I paid" but desk sees nothing | Bank statement has no matching UTR                                              | Use `Not found` on the UPI tab; ask the parent for the reference         |
| Document upload fails                      | `STORAGE_DRIVER` and `STORAGE_DIR` writable?                                    | Fix the volume, or switch to `s3` with bucket credentials                |
| Restore needed                             | `bash scripts/restore.sh <dump>` (scratch first!)                               | Then `--in-place` after confirming                                       |

**Data-loss drill:** stop the API, take a fresh dump, restore into scratch,
compare row counts, then decide. Never point a scratch restore at the live
database name.

---

## 8. Security operations

- Rotate `JWT_SECRET` → every session is invalidated (acceptable, and the
  desired response to a leak).
- Rotate `EVOLUTION_API_KEY` in Evolution → Manager and in `.env` together; the
  old key stops sending immediately.
- `PII_KEY` rotation requires re-encrypting existing values — do it with a
  one-off script, not by swapping the key (old rows become unreadable).
- Backups contain personal data: encrypt the backup volume and restrict access.
- Failed logins are throttled and audited; review `audit_logs` for a spike.

---

## 9. Scaling beyond one box (not needed at go-live)

1. Extract `startWorker`/`startScheduler` into a `worker` service — the only
   change needed to run several API replicas.
2. Move dumps to object storage and add a weekly restore test in CI.
3. Add a read replica only if reporting queries start to hurt; Prisma needs a
   `replicaSets` config for that.

---

## 10. Go-live checklist

- [ ] `JWT_SECRET` and `DB_PASSWORD` are random, stored in a password manager.
- [ ] HTTPS terminated; `/api/health/ready` reachable from the monitor.
- [ ] `bash scripts/backup.sh` succeeds and the dump was copied off-host.
- [ ] `bash scripts/restore.sh <latest dump>` prints matching row counts.
- [ ] Sentry receives a deliberate test error (`/api/health/ready` unaffected).
- [ ] Each unit's UPI id entered in Settings → Units; a ₹1 QR tested end to end
      (parent scans → desk confirms → receipt printed).
- [ ] Evolution API instance connected; a real WhatsApp message delivered to a
      staff phone.
- [ ] Student document storage mounted (local volume or S3) and one upload +
      one admin delete tested.
- [ ] Fee structures for the academic year entered and locked by HO.
- [ ] Staff accounts created per role; demo data removed (`prisma db seed` skipped).
- [ ] Parent portal smoke test on a phone: login → attendance → fees → PTM.

Anything still waiting on the client (Evolution instance, UPI ids, domain, fee
structures, policy numbers) is listed in `PENDING_ITEMS.md` §7 and is stubbed
behind adapters, so it goes live without a code change.
