# 🐝 BumbleB ERP — Handover / Status (as of 6 Oct 2026)

Read this first in any new work session. Source of truth for requirements:
`docs/ERP Specification.txt` · build order: `docs/BumbleB_ERP_Code_Plan.md`.

## ✅ DONE — Slices 0–7 core (all self-verified with E2E tests + screenshots)

| Slice | What's live |
|---|---|
| 0 | Monorepo (api NestJS+Prisma / frontend React+Vite+Tailwind), full Phase-1 Prisma schema, docker-compose, realistic demo seed (3 units, 42 students, AY 2026-27) |
| 1 | JWT auth, 8 roles, unit scoping (HO roles see cross-unit), Units & Batches, Settings, audit log |
| 2 | First Buzz CRM: leads, stages, area-based routing engine, activities |
| 3 | Admissions: register → Discovery Flight → CH approval → confirm (admission no. BB-U?-2627-NNNN) |
| 4 | Attendance engine: default-ABSENT roster, lock = start+30min, absence alerts +30m, admin-call +2h, 3-day escalation, CH override with reason |
| 5 | Fees: locked structures (40/30/30 plans), 10% sibling concession, payments, receipts (BB-U?-RCPT-2627-NNNN) + print, cancel, reminders T-5/T-0/T+3/T+7 |
| 6 | Parent portal PWA at `/parent` (same Vite app): login = phone + admission no, child switcher, today status, attendance calendar, fee ledger, receipt print, updates feed. Manifest + service worker + icons = installable |
| 7 | Certificates: 7 HO-locked templates, serials BB-U?-CERT-2627-NNNN, TC gated on cleared fees + No-Dues, print layout. Comms: single outbox, announcements fan-out per family, dispatch (sandbox mode until WA_BSP_KEY set) |

Design system (user-approved after many iterations — do NOT change without asking):
white background, cream/light-yellow cards `gradient(145deg,#F8EDCD,#EBDBAC)`,
dark-honey action buttons, dark readable text (#1F1B13, muted ≥ stone-500).
Classes in frontend/src/index.css: .card .btn-primary .btn-neo .input .chip .seg .pop .neo-inset.
All tables = ONE shared TanStack DataTable component. ERP must stay programme-generic
(will expand to full school up to 12th Std).

## ✅ DONE in this round (Slice 6/7 hardening)

1. **Payments — placeholder, production-shaped**: `PaymentOrder` model, `/api/payments`
   (config · order · verify · webhook · confirm · cancel). With no Razorpay keys the app
   runs in placeholder mode: the parent gets a UPI intent + QR, the office confirms the
   reference in Fees → Online, and the normal numbered receipt + ledger entry is created.
   Adding `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` flips it live with no code change.
2. **HO Template Management (B2)** — Communication → Templates: edit HO-locked wording,
   auto-extracted `{variables}`, live preview with sample data, DRAFT → SUBMITTED →
   APPROVED workflow, approved BSP template name per code. Delivery chain
   app push → WhatsApp → email; status reported per channel on dispatch.
   *BSP connection itself is deliberately NOT done (founder task).*
3. **Web push in the parent PWA** — VAPID keys, `push_subscriptions`, opt-in card in the
   parent portal with a test notification, `push`/`notificationclick` handlers in `sw.js`.
4. **Parent portal extras** — tabs Home / My Child / Fees / Messages / Documents.
   Documents vault (staff-controlled visibility), two-way parent ↔ Centre Head thread,
   Pay Now. Health/Infirmary/IEP/Child Support Log and Discovery Flight results are
   never returned by the parent API.
5. **I-card batch generation** — Certificates → Print I-cards: A4 sheet, 8 CR80 cards per
   page, filterable by batch/unit.
6. **DPDP hardening** — AES-256-GCM encryption at rest for blood group / allergies /
   medical notes, consent register, configurable retention windows with dry-run purge,
   per-child data export. Settings → Data Protection.
7. **Deployment** — `api/Dockerfile`, `frontend/Dockerfile` + `nginx.conf`,
   `docker-compose.prod.yml` (no host ports for db/redis, single loopback port, memory
   and log caps — safe alongside the other projects on the VPS), `.env.example`,
   `scripts/backup.sh` + `restore.sh`, `/api/health`, and **`docs/DEPLOYMENT.md`**.
8. **Seed** — demo rows for all 6 new tables (templates, settings, consents, threads,
   payment orders) plus encrypted medical fields. `api/prisma/seed.ts` is the single
   source of demo data; real Postgres data simply replaces it.

Verification: 28-step end-to-end API smoke test passes 28/28; `tsc --noEmit` clean on
both api and frontend; `npm run build` clean on the frontend.

## 🔲 PENDING

1. **Razorpay live keys** — blocked on merchant KYC (founder).
2. **WhatsApp BSP connect** — account + template approval (founder); the app flips to
   live the moment `WA_BSP_KEY`/`WA_BSP_URL` are set.
3. **Push to the VPS** — follow `docs/DEPLOYMENT.md`; needs the domain's DNS plus a
   vhost in the server's existing reverse proxy.
4. **Replace demo data with real data** — real fee structures, staff accounts, logo files.

## 🔮 Phase 2 backlog (schema already provisioned)
18-tab student lifecycle · HR & dual payroll · Academic module (Yearly Goals/Big Rocks/
Calendar/Log Plan) · Inventory · PTM · Evening Activity Centre (separate ledger) ·
Analytics · Franchise layer · AI.

## 👤 Founder's own checklist (only the founder can do)
Razorpay KYC · WhatsApp BSP account + template approval · domain + VPS ·
logo files · real fee structures per programme/unit · confirm reminder schedule with FA.

## 🛠 Dev quick facts
- Restore a fresh dev env: `bash scripts/dev-restore.sh` (installs PG+Redis, restores
  `backups/latest.sql` or seeds). Start: `cd api && npm run dev` (:3000),
  `cd frontend && npm run dev` (:5173, proxies /api).
- Staff demo logins (password `bumbleb123`): founder@ / ad@ / falguni@ / ch.u1@ / ch.u2@ /
  coord.u1@ / teacher.u1@ / reception@ bumblebkidz.com
- Parent demo: phone `+91 9100000000` + admission `BB-U1-2627-0001`
- Gotchas: seed parent phones contain a space — strip `[\s-]` on both sides when comparing;
  Prisma model User has `fullName` (not name); Unit has NO `city` field;
  api dev server has no file-watch (restart after edits);
  NestJS route order — literal paths (`icards/print`) must be declared before `:id/...`.
- Deployment: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`.
  Back up `.env`: losing `PII_ENCRYPTION_KEY` makes encrypted medical fields unreadable.
