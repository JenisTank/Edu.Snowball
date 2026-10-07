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

## ✅ COMPLETED — Slice 6 parent hardening (7 Oct 2026)

- Web Push for absence alerts, fee reminders, announcements and Centre Head replies; opt-in/out UI and stale-subscription cleanup.
- Parent extras: safe My Child profile, issued-document vault, parent ↔ Centre Head messaging. Confidential Health/Infirmary/IEP/Child Support data remains excluded.

## ✅ COMPLETED — I-card pipeline (7 Oct 2026)

- Batch-scoped, unit-authorized A4 I-card sheets with photos/initial fallbacks and print layout.

## 🔲 PENDING — remaining build work (Slice 6/7 hardening)

1. **Razorpay live**: order → webhook → auto receipt → ledger update; "Pay Now" button
   in parent portal (placeholder note is already there). Blocked on merchant KYC.
2. **WhatsApp BSP connect**: real dispatch via AiSensy/Interakt/Gupshup once keys exist
   (`WA_BSP_KEY` in .env flips sandbox→live). Plus HO Template Management screen (B2)
   and fallback chain app-push → WhatsApp → email.
6. **DPDP hardening**: PII encryption at rest, consent-log wiring, retention config.
7. **Production deploy**: domain + VPS, production docker-compose dress-rehearsal,
   nightly DB backups, Sentry alerts, deploy guide.
8. **Replace demo data with real data**: real fee structures, staff accounts, logo files.

## ✅ Phase 2 operational modules completed (7 Oct 2026)
18-tab student lifecycle · Academic planning (Yearly Goals/Big Rocks/Calendar/Log Plan) ·
Inventory stock ledger · PTM scheduling/records · Evening Activity Centre separate ledger.

## 🚧 HR & dual payroll — in progress
1. ✅ HR Manager role, employee master, reporting hierarchy and effective-dated employment history.
2. ✅ Shift, holiday and salary-component masters.
3. ✅ Attendance import and exception resolution.
4. ✅ Yearly leave policy and leave workflow.
5. ✅ OT authorization and attendance matching.
6. ✅ Morning payroll engine.
7. ✅ Evening minute-rate payroll engine.
8. ✅ Statutory masters and deductions.
9. ✅ Maker-checker, locking and reversals.
10. ✅ Payslips, exports and reports.

## 🔮 Remaining Phase 2+ backlog
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
  api dev server has no file-watch (restart after edits).
