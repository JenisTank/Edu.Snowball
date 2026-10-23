# 🐝 BumbleB ERP — Handover (as of 23 Oct 2026)

Read this first. Sources of truth, in order: **this page** →
`docs/PENDING_ITEMS.md` (requirements traceability, item by item) →
`docs/CODE_STRUCTURE.md` (where code goes) → `docs/ERP Specification.txt`
(what the client asked for). Deploy, backups and incident steps:
`docs/RUNBOOK.md`.

Keep this page short and do not restate what `PENDING_ITEMS.md` owns — writing
the same fact twice is exactly why this file drifted two deliveries behind.

## Status at a glance

- **Everything is merged.** PR #2 → `main`, merge commit `75fae57` (23 Oct 2026).
- **CI is green, 4/4:** API typecheck + tests · Database (migrations apply
  cleanly, no drift) · Frontend build + i18n guard · Repo prettier.
- No third-party money or messaging account is needed to run **any** flow: UPI
  works from the centre's own VPA, WhatsApp goes through Evolution API when
  credentials exist and otherwise logs to the outbox.

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

## What shipped (do not rebuild or "improve" without asking)

- **Slices 0–7 core** — monorepo, auth + unit scoping, First Buzz CRM, admissions
  - Discovery Flight, attendance engine, fees + receipts, parent PWA, certificates
  - comms outbox.
- **Sprints S1–S9** — attendance plan + unmarked-register alerts + student leave ·
  14 fee reports + CSV/Tally export + add-ons + No-Dues/Fee-Statement/Admission
  letter · comms adapters with fallback, templates, reply SLA, delivery retries ·
  DPDP (PII encryption, consent register, retention purge, export and erasure) ·
  PRF→PO→GRN procurement, vendor master, petty cash, student issue billed to fees ·
  18-tab lifecycle with per-tab validation + grade promotion + K2 readiness ·
  evening external participants, PTM slots/booking/roll-up, capacity and staff
  analytics · health/ready probes, Sentry, backup + restore drill, runbook ·
  waitlist, employee self-service (My Space).
- **The client's sixteen answers (23 Oct)** — UPI QR collection replaced Razorpay
  (intent → parent claims the UTR → desk confirms → receipt); Evolution API
  replaced the BSP; security deposits + reception visitor book at `/frontdesk`;
  per-student document storage (local volume or S3, admin-only delete with a
  reason, row kept as the audit trail); reorder alerts at the item's own level;
  switchable Professional Tax; unit phone/UPI settings; the official logo used
  exactly as supplied. Calendly and Razorpay were **removed** on the client's
  instruction — do not reintroduce them.
- **Live sandbox test (23 Oct)** — running the real stack found five defects the
  unit tests could not see, all now fixed: HO account 500 on
  `GET /fees/upi/config`; UPI claim accepting a fake reference; visitor check-in
  500 on an empty uuid for HO; the missing unit picker on the front-desk page;
  and `dev-restore.sh` restoring a 17-table dump from before this schema.

Commits, per-sprint scope and the full 16-answer table live in
`docs/PENDING_ITEMS.md` ("Delivered since the audit", "Client answers"), not here.

## What is still open — all of it

**The client supplies (4)** — code is ready and waiting:

| #   | Item                                  | Switches on                               |
| --- | ------------------------------------- | ----------------------------------------- |
| 1   | Each unit's UPI id + payee name       | Live UPI collection (a ₹1 QR proves it)   |
| 2   | Evolution API URL, key, instance name | Every live WhatsApp send                  |
| 3   | Real fee structures for AY 2026-27    | Go-live fee data (dummies run every flow) |
| 4   | OT multiplier                         | Premium on authorised hours (currently 0) |

**Held by the client (4)** — decided later, do not build: domain / VPS / TLS
(the S8 deploy artefacts are ready and waiting) · Todd Care evening · grade-wise
Discovery Flight templates · ACA-LP-1 / CAL-4 / SEED-1,2 / OUT-1 content.

Domain/VPS appears **only** in the held list — it is a deferred decision, not
outstanding data, so the supplies list is four, not five.

**Documentation only (1):** the 29-SOP library, owned by the founder.

**Known limitation (not a logic bug):** PDFs render `₹` as `INR`. pdf-lib
standard fonts are WinAnsi-only; fixing it needs the brand TTFs embedded.

Phases 3 (franchisor) and 4 (AI) are deferred by the client; modules 16 and 17
inside Phase 3 are nonetheless built.

## Hard rules (do not change without asking)

- **Design system and brand rules are frozen.** White background, cream cards
  `linear-gradient(145deg,#F8EDCD,#EBDBAC)`, dark-honey actions, dark readable
  text. Classes live in `frontend/src/index.css`: `.card`, `.btn-primary`,
  `.btn-neo`, `.input`, `.chip`, `.seg`, `.pop`, `.neo-inset`; one shared TanStack
  `DataTable` for every table. The logo asset is used exactly as supplied — never
  recoloured, cropped or redrawn.
- **Every `@Body()` must be a `*Dto`.** `api/test/body-dto.spec.ts` fails CI
  otherwise. Global `ValidationPipe({ whitelist: true })`.
- **No personal names anywhere** — docs, seed, UI copy, tests. Use role/profile
  names (Founder, Academic Lead, Curriculum Lead, CA / Legal, ERP Developer).
  Demo fixtures use surname `Sample` and `parent.NN@example.com`.
- ERP must stay programme-generic (it will grow to a full school up to 12th Std).
- Given a numbered list of requirements, walk through every point with the user
  before writing code.

## Dev quick facts

- **Fresh environment:** `bash scripts/dev-restore.sh` installs PG + Redis, runs
  `prisma migrate deploy`, seeds demo data, installs node deps. It **always**
  migrates — it no longer restores a dump, because the old `backups/latest.sql`
  was a 17-table snapshot from before this schema and restoring it silently left
  53 tables missing. `backups/` is git-ignored; use `scripts/restore.sh` by hand
  if you really want a dump.
- **No Docker / offline sandbox:** `bash scripts/sandbox-preview.sh` builds
  Postgres from npm binaries, copies the API patched to be engine-free, and
  seeds (`--serve` also runs both apps). See `docs/RUNBOOK.md` §1b. State lives
  in `/tmp` and does **not** persist between sessions.
- **Run:** `cd api && npm run dev` (:3000) · `cd frontend && npm run dev`
  (:5173, proxies `/api`). Root shortcuts: `npm run api`, `npm run web`.
- **Staff logins** (password `bumbleb123`, `@bumblebkidz.com`): `founder@` ·
  `ad@` · `curriculum@` · `ch.u1@` · `ch.u2@` · `coord.u1@` · `teacher.u1@` ·
  `reception@`.
- **Parent demo:** `POST /api/parent/login` (singular `parent`) with phone
  `+91 9100000000` and admission `BB-U1-2627-0001`.
- **Redis is often absent** (no root in this sandbox): `/api/health` reports
  `degraded` and the worker logs `ECONNREFUSED ::1:6379`. Expected — the queue
  falls back gracefully; do not chase it.

## Gotchas that have already cost time

- **Head Office accounts have no `unitId`.** `findUnique({ where: { unitId } })`
  with `''` throws `invalid input syntax for type uuid: ""` and 500s. Guard it
  (`unitId ? … : null`) and let HO pass an explicit `unitId` in the DTO — this
  bit both `GET /fees/upi/config` and `POST /frontdesk/guests`.
- `pkill -f "src/main.ts"` kills the calling shell's process tree, and a plain
  `nohup … &` dies with the tool call. Use a tracked background process or
  `setsid nohup`.
- Seed parent phones contain a space — strip `[\s-]` on both sides when matching.
- Prisma `User` has `fullName` (not `name`); `Unit` has no `city` field.
- The API dev server does not watch files — restart after edits.
- `scripts/check-i18n.mjs` needs a Gujarati entry for **every** `t('…')` key and
  `L('…')` label; pages where `t` collides use `tr` as the alias.
- Validation detail: `isValidVpa` wants 2+ characters before `@` and a
  letters-only domain after it; `isValidPayerRef` rejects hyphens (8–24
  alphanumerics); `safeFileName` strips non-ASCII.
- `.git` state can be odd in restored sandboxes: HEAD may sit on an older commit
  while the working tree holds current code. Run `git log --oneline -1` and diff
  against `origin/main` before assuming the tree is dirty work — and never
  `git checkout .` / `reset --hard` / `clean` to "fix" it.

## Before you commit

```bash
cd api && npx tsc --noEmit        # clean
npx jest                          # 285 passing, 31 suites
npx prettier --check .            # from the repo root
cd frontend && npm run i18n:check # every t()/L() needs a Gujarati entry
npx vite build
```
