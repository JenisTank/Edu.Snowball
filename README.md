# 🐝 BumbleB Kidz ERP

Custom multi-unit preschool ERP for the BumbleB Kidz chain (Rajkot).
27 modules · 3 layers · 4 phases — per master specification Session 2.1.

## Stack

| Layer         | Technology                                                                   |
| ------------- | ---------------------------------------------------------------------------- |
| API           | NestJS (Node.js 20) + Prisma + PostgreSQL 16                                 |
| Jobs          | Redis + BullMQ (attendance locks, WhatsApp triggers, fee reminders, payroll) |
| Staff portal  | React (Vite) + Tailwind CSS + TanStack Table/Query + `@snowball/ui`          |
| Parent portal | React PWA at `/parent` (installable — manifest + service worker)             |
| Packaging     | Docker / docker-compose (nginx serves the SPA and proxies `/api`)            |

## Repository layout

```
.
├── api/                 NestJS API
│   ├── prisma/          schema.prisma + demo seed
│   └── src/
│       ├── common/      auth guard, unit scoping, audit log, Prisma module, filters
│       ├── config/      typed environment contract (env.ts)
│       ├── jobs/        BullMQ queue + worker
│       └── modules/     one folder per feature (controller + module)
├── frontend/            Staff portal + parent PWA (one deploy, one domain)
│   ├── public/          manifest, service worker, icons
│   └── src/             pages/, components/, lib/
├── docs/                specification, code plan, architecture, code structure
├── backups/             database dumps from scripts/backup.sh (never committed)
├── scripts/             dev-restore.sh
├── docker-compose.yml   postgres + redis + api + frontend
└── .env.example         every environment variable, documented
```

See [`docs/CODE_STRUCTURE.md`](docs/CODE_STRUCTURE.md) for the API conventions
(where a new endpoint goes, how unit scoping and the audit log are applied).

> **No Docker, or an offline sandbox?** `bash scripts/sandbox-preview.sh --serve`
> brings up Postgres, the API and the web app with seeded demo data, using npm
> binaries instead of containers. See `docs/RUNBOOK.md` §1b.

## Quick start (development)

```bash
# 0. Tooling (prettier for the whole repo)
npm install

# 1. Postgres + Redis + DB + demo seed, one shot:
bash scripts/dev-restore.sh

# 2. API
cd api && cp ../.env.example .env      # edit JWT_SECRET / DATABASE_URL if needed
npm install && npx prisma generate
npm run dev                            # → http://localhost:3000/api

# 3. Staff portal
cd ../frontend && npm install && npm run dev   # → http://localhost:5173
```

Useful commands from the repo root: `npm run api`, `npm run web`, `npm run test`,
`npm run typecheck`, `npm run format`, `npm run db:migrate`, `npm run db:seed`.

Database changes go through **Prisma migrations** (`api/prisma/migrations`), never
`db push` — the baseline `20261021120000_init` is the full schema, and CI fails if
the migrations drift from `schema.prisma`.

Health probe: `GET /api/health` → `{ status, database, uptimeSeconds }`.

## Production

```bash
cp .env.example .env    # set strong DB_PASSWORD + JWT_SECRET
docker compose up -d --build
docker compose exec api npx prisma migrate deploy   # first run only
```

The frontend container serves the SPA on port 80 and proxies `/api` to the API
container, so the browser only ever talks to one origin.

Operations (deploy, rollback, backups, restore drill, monitoring, incident
playbook) are documented in [`docs/RUNBOOK.md`](docs/RUNBOOK.md). The API exposes
`/api/health` (always 200, human-readable) and `/api/health/ready` (503 when the
database or Redis is down) for Docker and uptime monitors.

```bash
bash scripts/backup.sh                     # gzip dump + sha256 manifest, 30-day retention
bash scripts/restore.sh <dump.sql.gz>      # restores into a scratch DB and prints row counts
```

## Continuous integration

`.github/workflows/ci.yml` runs four jobs on every pull request:

| Job      | What it proves                                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| API      | `prisma generate` succeeds, `tsc --noEmit` is clean, 196 tests pass, prettier                                                                   |
| Database | migration applies to Postgres 16, is byte-identical to the generator output, and `prisma migrate diff` reports no drift against `schema.prisma` |
| Frontend | production build succeeds                                                                                                                       |
| Repo     | `prettier --check .` across the whole tree                                                                                                      |

## Demo logins (seed data — password `bumbleb123`)

| Role               | Email                      |
| ------------------ | -------------------------- |
| Founder            | founder@bumblebkidz.com    |
| Academic Director  | ad@bumblebkidz.com         |
| Curriculum Lead    | curriculum@bumblebkidz.com |
| Centre Head U1     | ch.u1@bumblebkidz.com      |
| Centre Head U2     | ch.u2@bumblebkidz.com      |
| Coordinator U1     | coord.u1@bumblebkidz.com   |
| Teacher U1         | teacher.u1@bumblebkidz.com |
| Receptionist (Hub) | reception@bumblebkidz.com  |

**Parent portal demo** (open `/parent` on a phone or narrow window):
phone `+91 9100000000` + admission no `BB-U1-2627-0001`.

## Module map (live)

| Area                | Where                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| CRM (First Buzz)    | `/leads` — stages, routing, activities                                                                      |
| Admissions          | `/admissions` — register → discovery → approval → confirm                                                   |
| Attendance engine   | `/attendance` — default-ABSENT roster, lock +30 min, absence alerts, 3-day escalation                       |
| Fees & receipts     | `/fees` — locked structures, instalments, sibling concession, receipts + print, reminders T-5/T-0/T+3/T+7   |
| Parent portal (PWA) | `/parent` — child dashboard, attendance calendar, fee ledger, receipt download, updates feed                |
| Certificates        | `/certificates` — 7 HO-locked templates, serial numbers, TC gated on cleared fees + No-Dues                 |
| Communication       | `/comms` — single outbox for WhatsApp messages; sandbox mode until `WA_BSP_KEY` is set                      |
| HR & dual payroll   | `/hr` — employee master, attendance import, leave, OT, morning + evening payroll, statutory                 |
| Analytics           | `/analytics` — capacity, staff, revenue and cross-module founder dashboard                                  |
| PTM                 | `/ptm` — timetable slots, phone booking on a family's behalf, roll-up, teacher notes; parents self-book     |
| Evening centre      | `/evening` — activities, external (non-student) children, session rosters and attendance                    |
| Inventory           | `/inventory` — stock, reorder alerts, PRF → PO → GRN, vendors, petty cash, student issue billed, 10 reports |
| Front desk          | `/frontdesk` — visitor book (who is inside) and security-deposit register                                   |
| Lifecycle           | `/lifecycle` — per-tab records with validation, grade promotion, K2 readiness report                        |
| Compliance (DPDP)   | consent register, field encryption, retention purge, parent data export + erasure                           |
| Online fees         | UPI QR per amount (no gateway): parent scans, reports the UTR, desk confirms → receipt                      |
| My Space            | `/me` — staff self-service: profile, payslips, leave application, own attendance                            |

## Key system rules (enforced from Slice 0)

- Every operational table carries `unit_id`; API auto-scopes to the user's unit.
  HO roles (Founder, AD, Curriculum Lead, Receptionist, HR Manager) see cross-unit.
- Attendance **default = ABSENT** (child safety); lock = class start + 30 min, dynamic.
- One login per person — shared accounts are a DPDP violation.
- Brand: Nunito + DM Sans, golden brown #C8922A, sky blue #4BAED0, pastels only.
- BumbleB rating scale (Brilliant/Buzzing/Blooming/Growing/Budding) — never numeric grades.
- Dual fee ledgers — preschool and evening never merge.

## Docs

- [`docs/ERP Specification.txt`](docs/ERP%20Specification.txt) — master requirements
- [`docs/BumbleB_ERP_Code_Plan.md`](docs/BumbleB_ERP_Code_Plan.md) — build order and slices
- [`docs/BumbleB_ERP_Architecture.md`](docs/BumbleB_ERP_Architecture.md) — module architecture
- [`docs/CODE_STRUCTURE.md`](docs/CODE_STRUCTURE.md) — how the code is organised
- [`docs/PENDING_ITEMS.md`](docs/PENDING_ITEMS.md) — requirements traceability: what is built, partial or open
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — production deployment, backups, monitoring, incident playbook
- [`HANDOVER.md`](HANDOVER.md) — what is done, what is pending

### Parent PWA web push

Generate VAPID keys once per deployment (`npx web-push generate-vapid-keys`) and set
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and optionally `VAPID_SUBJECT` (a `mailto:` URI).
Push stays disabled (and everything else keeps working) when keys are absent.
After schema changes run `cd api && npx prisma migrate dev` (local) or
`npx prisma migrate deploy` (server), then `npx prisma generate`.
