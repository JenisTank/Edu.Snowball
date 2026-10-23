# 🐝 BumbleB ERP — Handover (as of 23 Oct 2026)

Read this first. It is deliberately short: it says where the project stands and
sends you elsewhere for detail. Keeping the same facts in two places is why this
page drifted a whole two deliveries behind last time.

| You need                        | Read                                    |
| ------------------------------- | --------------------------------------- |
| Requirements (source of truth)  | `docs/ERP Specification.txt`            |
| Build order                     | `docs/BumbleB_ERP_Code_Plan.md`         |
| Code layout and API conventions | `docs/CODE_STRUCTURE.md`                |
| **What is still open**          | **`docs/PENDING_ITEMS.md`** — only list |
| Deploy, backups, incidents      | `docs/RUNBOOK.md`                       |

## Where things stand

All work is merged: **PR #2 → `main`, merge commit `75fae57` (23 Oct 2026)**.
CI is green 4/4 — `API` (typecheck + tests), `Database` (migrations apply, no
drift), `Frontend` (build + i18n guard), `Repo — prettier`.

| Measure     | Count                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| HTTP routes | 279 route decorators across 28 modules                                   |
| Data model  | 70 Prisma models · 11 enums                                              |
| Tests       | 285 passing in 31 suites (no database needed)                            |
| UI          | 21 pages (staff portal + parent PWA)                                     |
| Migration   | one baseline `20261021120000_init`: 70 tables · 81 FKs · 730 columns     |
| Bilingual   | 252 i18n keys · 119 labels, every one with a Gujarati entry (CI-guarded) |

The migration is generated from `schema.prisma` by
`api/prisma/generate-init-migration.py`; CI fails if the committed SQL differs
from a fresh run or if `prisma migrate diff` reports drift.

## What shipped (high level)

- **Slices 0–7 core** — monorepo, auth + unit scoping, First Buzz CRM,
  admissions + Discovery Flight, attendance engine, fees + receipts, parent PWA,
  certificates + comms outbox.
- **Slices S1–S9** — attendance plans and student leave, 14 fee reports + Tally
  export, comms adapters/fallback, DPDP, procurement, lifecycle tabs, evening
  participants + PTM booking, UPI QR collection (S7b), health/ready + Sentry +
  backup scripts + RUNBOOK, waitlist and employee self-service.
- **23 Oct client answers** — all 16 items answered; eleven turned a "blocked"
  into working code.

Commits, scope and the full 16-answer table live in `docs/PENDING_ITEMS.md`
("Delivered since the audit" and "Client answers"), not here.

**Built — do not rebuild or "improve" without asking:** UPI QR collection
(intent → claim → desk confirm → receipt; no gateway, no KYC) · Evolution API
transport, with Meta Cloud API kept as a second transport · security deposits +
reception visitor book at `/frontdesk` · per-student document storage (local
volume or S3, admin-only delete with a reason, row kept as an audit trail) ·
reorder alerts at the item's own stock level · switchable Professional Tax per
unit · unit phone + UPI settings · sandbox preview runner. Razorpay and Calendly
were **removed** on the client's instruction.

## What is actually open

Four items of client data — nothing else blocks go-live:

| #   | Client supplies                       | Switches on                                  |
| --- | ------------------------------------- | -------------------------------------------- |
| 1   | Each unit's UPI id + payee name       | Live UPI collection (a ₹1 QR proves it)      |
| 2   | Evolution API URL, key, instance name | Every live WhatsApp send                     |
| 3   | Real fee structures for AY 2026-27    | Go-live fee data (dummies run every flow)    |
| 4   | OT multiplier                         | Premium on authorised overtime (currently 0) |

**Held by the client — do not build:** domain / VPS / TLS (the deploy artefacts
from S8 are ready and waiting), Todd Care evening, grade-wise Discovery Flight
templates, ACA-LP-1 / CAL-4 / SEED-1,2 / OUT-1 content.

**Documentation only:** the 29-SOP library, owned by the founder.

**Known limitation (not a bug):** PDFs render ₹ as "INR" because pdf-lib's
standard fonts are WinAnsi-only. Fix is to embed the brand TTFs.

Phases 3 (franchisor) and 4 (AI) are deferred by the client; modules 16 and 17
inside Phase 3 are nonetheless built.

## Dev quick facts

- **No Docker, no root?** `bash scripts/sandbox-preview.sh` stands up Postgres
  from npm binaries plus schema and demo data (`--serve` also runs both apps).
  See `docs/RUNBOOK.md` §1b. State lives in `/tmp` and does not survive a reset.
- **`bash scripts/dev-restore.sh`** installs Postgres + Redis, then **always**
  runs `prisma migrate deploy` + the demo seed. It does **not** restore a dump:
  the old `backups/latest.sql` was a 17-table snapshot from before this schema
  (restoring it left 53 tables missing), so it was deleted. `backups/` is
  git-ignored; a real dump is restored by hand with `scripts/restore.sh`.
- Start: `cd api && npm run dev` (:3000) · `cd frontend && npm run dev`
  (:5173, proxies `/api`).
- **Staff logins** (password `bumbleb123`, `@bumblebkidz.com`): `founder@`, `ad@`,
  `curriculum@`, `ch.u1@`, `ch.u2@`, `coord.u1@`, `teacher.u1@`, `reception@`.
- **Parent demo:** phone `+91 9100000000` + admission `BB-U1-2627-0001`.
- Redis is unavailable in some sandboxes: `/api/health` reports `degraded` and
  the queue worker logs `ECONNREFUSED ::1:6379`. Expected — the queue falls back
  gracefully. Do not chase it.

## Bug class to remember

Head Office accounts have **no `unitId`**. A Prisma lookup shaped
`findUnique({ where: { unitId } })` with `''` throws
`invalid input syntax for type uuid: ""` and 500s. Guard it
(`unitId ? … : null`) and let the HO account pass an explicit `unitId` in the
DTO. Both `GET /fees/upi/config` and `POST /frontdesk/guests` hit this; both now
behave, and the front-desk page carries the unit picker that goes with it.

## Other gotchas

Seed parent phones contain a space — strip `[\s-]` on both sides when comparing.
Prisma `User` has `fullName` (not `name`); `Unit` has no `city` field. The api
dev server has no file-watch — restart after edits.

## House rules (standing)

- Every `@Body()` must be a `*Dto` — `api/test/body-dto.spec.ts` guards it.
- No personal names anywhere (docs, seed, UI copy, tests): use role/profile names
  (Founder, Academic Lead, CA/Legal, ERP Developer). Fixtures use surname
  "Sample" and `parent.NN@example.com`.
- Design system and brand rules are do-not-change-without-asking; the logo asset
  is used exactly as supplied, never recoloured or cropped.
- Given a numbered list of requirements, walk through every point with the user
  before writing code.

## Before committing

```bash
cd api && npx tsc --noEmit        # clean
npx jest                          # 285 passing, 31 suites
npx prettier --check .            # from the repo root
cd frontend && node scripts/check-i18n.mjs   # every t()/L() needs a Gujarati entry
npx vite build
```
