# BumbleB Kidz ERP — Code Plan
**Version 1.0 · October 2026 · Stack locked**
Target: Phase 1 live before June 2026 admission drive (Unit 1) — per master spec Session 2.1

---

## 1. Locked Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js v20 LTS |
| Backend | NestJS + Prisma ORM (REST API, JWT auth, multi-unit scoping) |
| Database | PostgreSQL 16 |
| Jobs & automation | Redis + BullMQ |
| Staff portal | React (Vite) + Tailwind CSS + shadcn/ui |
| Parent portal | React (Vite) + Tailwind CSS, built as installable PWA |
| Theme | BumbleB brand light theme — white/pastels, #C8922A, #4BAED0, Nunito + DM Sans |
| PDF generation | Puppeteer (HTML templates → A4 PDF) |
| Payments | Razorpay + UPI (manual cash/cheque fallback) |
| Messaging | WhatsApp Business API via BSP + Web Push (PWA) + email (receipts/certs) |
| Packaging | Docker / docker-compose (one command runs everything) |

## 2. Repository Structure

```
bumblebkidz-erp/
├── frontend/                  # Staff ERP portal (React + Vite + Tailwind + shadcn/ui)
│   └── src/
│       ├── pages/             # Login, Dashboard, Leads, Admissions, Students,
│       │                      # Attendance, Fees, HR, Inventory, Settings…
│       ├── components/        # ui/ (shadcn) + brand/ (BumbleB components)
│       └── lib/               # API client, auth, helpers
├── parent-app/                # Parent PWA (React + Vite + Tailwind)
│   └── src/pages/             # Home, My Child, Fees, Messages, Documents
├── api/                       # NestJS backend
│   ├── src/
│   │   ├── modules/           # auth/ units/ leads/ admission/ discovery-flight/
│   │   │                      # students/ attendance/ fees/ hr/ academic/
│   │   │                      # inventory/ communication/ certificates/ analytics/
│   │   ├── jobs/              # BullMQ processors (attendance-lock, fee-reminder,
│   │   │                      # whatsapp-send, pdf-generate, payroll-calc)
│   │   ├── pdf/               # Puppeteer service + HTML templates
│   │   ├── notifications/     # WhatsApp / push / email dispatch (provider-pluggable)
│   │   └── common/            # guards, unit-scoping interceptor, audit-log interceptor
│   └── prisma/
│       ├── schema.prisma      # full database schema
│       ├── seed.ts            # realistic demo data
│       └── migrations/
├── docker-compose.yml         # postgres + redis + api + frontend + parent-app
├── .env.example               # every secret documented
└── docs/                      # this plan, spec, SOPs, handover notes
```

## 3. Non-Negotiable System Rules (enforced from Slice 1)

1. **Multi-unit isolation** — every operational table carries `unit_id`; API auto-scopes
   queries to the logged-in user's unit. FOUNDER / ACADEMIC_DIR see cross-unit.
2. **6-role RBAC** — FOUNDER, ACADEMIC_DIR, CURRICULUM_LEAD, CENTRE_HEAD,
   COORDINATOR, TEACHER. One login per person. No shared accounts (DPDP).
3. **Audit log** — every create/update/delete recorded: who, what, when, old → new.
4. **Attendance default = ABSENT** — teacher actively marks Present (child-safety rule).
5. **Dynamic timing** — attendance lock = class_start + 30 min; absence message =
   lock + 30 min. Computed from batch/shift master. Nothing hardcoded.
6. **HO-locked masters** — fee structures, certificate templates, SKUs, programmes:
   HO creates/locks; units consume.
7. **Brand rules** — Nunito/DM Sans, pastel light theme, BumbleB rating scale
   (Brilliant/Buzzing/Blooming/Growing/Budding — never numeric grades), A4 docs,
   logo as-is, no Nestleap entities on parent-facing output.
8. **Dual fee ledgers** — preschool and evening ledgers never merge.

---

## 4. Build Plan — Phase 1 in 8 Slices

Each slice ends with a **working preview you click-test** and approve before the next.

### Slice 0 — Skeleton & Foundations
- Monorepo scaffold (frontend / parent-app / api), docker-compose, .env.example
- Full Prisma schema v1 (all Phase 1 tables + audit_log + consent_log)
- Seed data: 3 units, 5 programmes, batches with timings, 6 role users,
  ~40 demo students, sample leads/fees/attendance
- BumbleB theme foundation: Tailwind tokens (colours, fonts), base layout,
  sidebar navigation, branded login screen
- **You test:** log in as each role, see branded shell, switch units as Founder

### Slice 1 — Auth, Roles, Units & Settings
- JWT auth (15-min access / 7-day refresh), password reset, user management screen
- Role guard + unit-scoping middleware + audit-log interceptor (system-wide)
- Units & unit_settings screens (petty cash float HO-only, contacts, Calendly links)
- Programme & batch masters (timings drive attendance locks later)
- **You test:** create a Centre Head for U2, confirm they cannot see U1 data

### Slice 2 — First Buzz CRM (Leads) + Routing Engine
- First Buzz Form Version A (hub/remote) & Version B (walk-in, auto-unit)
- 9-stage pipeline board; lead activities timeline; lead scoring
- Area master (locality → suggested unit, HO-maintained lookup)
- Routing: area → availability → preference → receptionist confirm;
  override requires mandatory note; re-route restricted to CH/receptionist, history kept
- Receptionist / CH / Founder dashboard views (own-unit vs consolidated funnels)
- **You test:** enter an inquiry, watch it route, move it through the pipeline

### Slice 3 — Admission Flow + Discovery Flight
- Stage 2 registration form (enquiry-linked, instalment plan auto-suggested
  by joining window A/B/C)
- Discovery Flight: grade-wise templates, EP/GP/SP/NP/ND coding, auto-summary,
  recommendation, CH approval gate, strictly internal (never parent-visible)
- Confirmation: admission no. BB-U[n]-[Year]-[Serial], batch assignment,
  confirmation letter PDF, "Add to Class" activating attendance + fee ledger
  + parent portal account simultaneously
- Sibling detection (parent mobile/name match) → HO-rate concession auto-applied
- Seat tracker per batch
- **You test:** take one child from inquiry → enrolled; verify sibling discount fires

### Slice 4 — Attendance Engine
- Teacher marking screen (default absent, tap-to-present, mobile/tablet friendly)
- BullMQ: daily 5:00 AM scheduler creates per-batch lock jobs (start + 30 min);
  holiday-aware; lock → CH-only override with reason
- Absence flow: approved-leave check → notification queued (lock + 30 min) →
  no-response call task (lock + 2 h) → 3-day consecutive escalation to CH
- Leave applications (parent-submitted + admin-logged), teacher-not-submitted alert
- **You test:** mark a class, let it lock, watch absence notifications queue up

### Slice 5 — Fees Engine + Receipts
- HO fee structure master (locked per AY), plans A (3) / B (2) / C (full),
  joining-window logic, configurable due dates
- Collection screen per spec (left fee structure / right collection entry),
  discounts with approval, fine field, all payment modes
- Receipt: auto number, A4 branded PDF (Puppeteer), stored in child vault,
  queued to WhatsApp; cancellation/refund with CH approval + cancellation receipt
- Dual ledger (preschool / evening separated), No Dues Certificate
- Reminder jobs T-5 / T-0 / T+3 / T+7 (schedule HO-configurable — PC-1 pending)
- P0 reports: Daily Collection, Outstanding Fees, Fee Status per Student, Day Book
- **You test:** collect a fee, open the PDF receipt, check ledger + Day Book

### Slice 6 — Parent PWA
- Installable PWA: branded login (per-child accounts created at "Add to Class")
- Home (today's attendance, dues, messages) · My Child (parent-visible tabs only —
  Health/Infirmary/IEP/Child Support Log always hidden) · Fees (history + receipts,
  Razorpay "Pay Now" when keys ready) · Messages (CH-reply model) · Documents vault
- Web-push notifications (absence, fee reminders, announcements)
- **You test:** install on your phone, pay a test fee, receive a push

### Slice 7 — Integrations & Launch Hardening
- WhatsApp BSP connect + HO Template Management screen (B2) with fallback chain
  (app push → WhatsApp → email) and full comms logging
- Razorpay live: order → webhook → auto receipt → ledger update
- Certificate library: all 7 HO-locked templates (Fee Receipt, Admission Confirmation,
  TC, Graduation, Bonafide, No Dues, Fee Statement) + I-card batch generation
- DPDP hardening: PII encryption at rest, consent log, retention config
- Nightly DB backups, Sentry error alerts, production docker-compose + deploy guide
- **You test:** full dress rehearsal — one real family end-to-end on staging

### Phase 2+ (post-launch, already schema-provisioned)
18-tab student lifecycle → HR & dual payroll engines → Academic Module
(Yearly Goals / Big Rocks / Calendar / Log Plan) → Inventory → PTM →
Evening Activity Centre → Analytics dashboard → Franchise layer → AI integrations.

---

## 5. Your Checklist (only you can do these)

| # | Item | Needed by | Source |
|---|---|---|---|
| 1 | Razorpay merchant account (KYC takes days — start early) | Slice 5 | B3 |
| 2 | WhatsApp BSP account (AiSensy / Interakt / Gupshup) + approved templates | Slice 7 | PC-3 |
| 3 | Central hub admission phone number | Slice 2 | NOTE |
| 4 | Unit 1 & 3 contacts, emails, Calendly links | Slice 1 | NOTE |
| 5 | Domain name (e.g. erp.bumblebkidz.com) + VPS account | Slice 7 | — |
| 6 | OT1: overtime multiplier (1x / 1.25x / 1.5x) | before payroll (Phase 2) | OT1 |
| 7 | PC-1: confirm fee reminder schedule with FA | Slice 5 | PC-1 |
| 8 | BumbleB logo files (white-bg + dark variants, high-res) | Slice 0 | Brand |
| 9 | Real fee structures per programme per unit for AY 2026-27 | Slice 5 | — |

## 6. Working Rhythm

1. I build a slice → you get a live preview link in this chat
2. You click-test against the "You test" line and reply with feedback
   (plain words or screenshots — no technical language needed)
3. I fix/adjust → you approve → next slice
4. Everything stays in this workspace: code, docs, and this plan —
   fully handover-ready for a future hired developer (Docker + docs + seed data)
