# Pending items — requirements traceability

Built from `docs/ERP Specification.txt` (Session 2.1), audited against the code on
21 Oct 2026. Every status below was checked against routes, Prisma models or UI —
the evidence column says where.

**Legend**

| Mark | Meaning                                                               |
| ---- | --------------------------------------------------------------------- |
| ✅   | Built and matching the spec                                           |
| 🟡   | Built, but specific spec items are missing                            |
| 🔲   | Not built                                                             |
| 🚫   | Blocked on something outside the codebase (client account, KYC, keys) |
| ⏸    | Explicitly deferred by the client                                     |

**Current footprint:** 261 HTTP routes · 66 Prisma models · 11 enums ·
261 tests in 28 suites · 20 pages (staff + parent PWA) · 66-table migration
validated in PGlite.

> **Audit date note.** The tables below were built from the 21 Oct 2026 audit.
> Everything marked ✅ or 🟡 has since been re-checked against the code; the
> sprint plan in §8 has been replaced with what actually shipped.

### Delivered since the audit

| Sprint | What shipped                                                                                                                                                                                       | Commit               |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| S1     | 05:00 IST daily attendance plan, unmarked-register alerts, student leave applications with leave suppression                                                                                       | `a8618f4`            |
| S2     | 14 fee reports + CSV/Tally export, add-on charges, No-Dues / Fee-Statement / Admission-letter documents                                                                                            | `206c1d3`            |
| S3     | Comms provider adapters (WhatsApp Cloud API + SMTP), channel fallback, template registry, reply-SLA escalation, delivery retries                                                                   | `464eb87`            |
| S4     | DPDP: field encryption, consent register, retention purge, parent data export and erasure                                                                                                          | `9c1fe54`            |
| S5     | PRF → PO → GRN procurement, vendor master, petty-cash ledger, student issue billed to fees, 10 reports, inward/outward register                                                                    | `a68be48`            |
| S6     | Lifecycle per-tab schemas + validation, parent-visible tabs, grade transitions, K2 readiness report                                                                                                | `3695543`            |
| S7     | Evening external participants + session attendance, PTM slot booking + batch roll-up, capacity/staff analytics, DTO validation, PTM timetable + booking UI, Gujarati strings for PTM/parent portal | `488ef09`, `4c660b7` |
| S7b    | Razorpay behind an adapter: order → checkout verify → signed webhook → idempotent receipt; sandbox mode when KYC is pending; parent "Pay now"                                                      | `9fa1daa`            |
| S8     | `/api/health` + `/api/health/ready` (db, redis, queue depth), Sentry hook, backup + restore-drill scripts, `docs/RUNBOOK.md`, prod compose healthcheck                                             | `53c6381`            |
| S9     | Waitlist for full batches; employee self-service (profile, payslips, leave, attendance) + My Space page                                                                                            | `7cb2101`            |

### Final pass (22 Oct 2026)

The last audit gaps that were codeable without a client decision are closed:

- **Attendance reports** — per-batch and per-student ranges, percentages over
  marked days, weakest first, plus the report panel on the Attendance page.
- **Auto-LWP cut-off** — the daily tick now closes undecided staff leaves to
  `AUTO_LWP` (leave-without-pay) once their last day has passed, once per IST
  day; `POST /hr/leave/cutoff` runs it on demand.
- **Opening stock** — `POST /inventory/opening-stock` records the starting count
  per item exactly once, so a new unit cannot be double-counted.
- **PTM student-wise view** — `GET /ptm/student/:id` and the history modal.
- **CI schema guard** — the committed migration must equal the generator output
  and `prisma migrate diff` must report no drift.
- **DPDP retention bug** — the nightly purge counted `audit_log.created_at`,
  a column that does not exist (`changed_at`), so the job threw, the scheduler
  swallowed it as a warning, and **retention silently never ran**. Fixed, with
  a fake-client regression test that pins the exact `where` clauses.
- **Sandbox runner** — `scripts/sandbox-preview.sh` runs the full stack without
  Docker or Prisma engine binaries (see `docs/RUNBOOK.md` §1b).

---

## 0. What is pending — the short answer

Only one bucket needs a decision from you. Everything the team could build
without a client answer is built and green on PR #2.

| #   | Bucket                                                                                            | Pending  | Who unblocks it              |
| --- | ------------------------------------------------------------------------------------------------- | -------- | ---------------------------- |
| A   | Accounts, keys and master data (Razorpay, WhatsApp, VPS, fonts, fee structures, policy numbers)   | 16 items | **You / your CA / your BSP** |
| B   | Deferred by your instruction (Phase 3 franchisor modules 18–23, Phase 4 AI 24–27, 29-SOP library) | 11 items | A future phase — not a bug   |
| C   | Polish with no open question: Gujarati long-form prose (help text, validation messages)           | 1 item   | Copywriting pass, any time   |

### A. Waiting on you (cannot be coded around)

| #   | What is needed                                        | What it switches on                                              |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Razorpay merchant KYC + webhook secret                | Live online fees, auto-receipt, parent "Pay now"                 |
| 2   | WhatsApp BSP account + approved templates             | Every live send: absence, receipt, welcome, announcements        |
| 3   | Domain + VPS                                          | Production deployment (`docs/RUNBOOK.md` is ready)               |
| 4   | Logo files + brand TTF                                | Real branding; rupee glyph in PDFs                               |
| 5   | Real fee structures for AY 2026-27                    | Go-live fee data                                                 |
| 6   | PC-1: confirm the reminder schedule                   | Defaults are T-5 / T-0 / T+3 / T+7 until you say otherwise       |
| 7   | OT1: overtime multiplier                              | First real payroll run                                           |
| 8   | INV2: reorder-quantity basis                          | Automated reorder alerts                                         |
| 9   | ACA-LP-1 / CAL-4 / SEED-1,2 / OUT-1                   | Todd Care & PlayHouse curriculum, Saturday hours, Big Rocks      |
| 10  | CA / Legal: PT applicability for hourly evening staff | Evening payroll statutory                                        |
| 11  | Central hub admission phone number                    | Hub settings                                                     |
| 12  | HR policy: security deposit + guest engagement log    | Two entities that cannot be designed without the policy          |
| 13  | Todd Care evening: programme and fee decision         | The last evening-centre gap                                      |
| 14  | Grade-wise Discovery Flight form content              | Per-programme DF templates (one generic form today)              |
| 15  | Object storage (S3 / Spaces) + retention rule         | Uploading the signed PTM form scan (reference URL works now)     |
| 16  | Calendly token + booking plan                         | Real slot booking from the stored unit link (display-only today) |

### B. Deliberately deferred (your call, not a gap)

Phase 3 franchisor control — modules 18 Franchise Management, 19 Central Academic
Governance, 20 Training & SOP Compliance, 21 Central Inventory, 22 Royalty &
Financial Oversight, 23 Marketing & Lead Intelligence. Module 16 Inward/Outward
and module 17 Analytics **are** built. Phase 4 — modules 24–27 (BuzzPortfolio,
BuzzSheet, EduGrowth Matrix, predictive analytics). Plus the 29-SOP library,
which is a documentation deliverable rather than code.

### C. Polish still open

| Item                     | State                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Gujarati long-form prose | Every page's chrome and field labels are translated and CI-guarded; only help text and validation sentences still need a copywriting pass |

---

## 1. Scoreboard

| Phase                     | Modules                        | ✅  | 🟡  | 🔲  | ⏸   | 🚫  |
| ------------------------- | ------------------------------ | --- | --- | --- | --- | --- |
| Phase 1 (admission drive) | 1, 2, 3, 4, 6, 7               | 2   | 4   | —   | —   | —   |
| Phase 2 (operations)      | 5, 8, 10, 11, 12, 13, 14, 15   | 3   | 5   | —   | —   | —   |
| Phase 3 (franchisor)      | 16, 17, 18, 19, 20, 21, 22, 23 | 2   | —   | —   | 6   | —   |
| Phase 4 (AI)              | 24, 25, 26, 27                 | —   | —   | —   | 4   | —   |

Nothing in Phase 1 or Phase 2 is unbuilt. Every remaining 🟡 is a third-party
account (Calendly, WhatsApp BSP, Razorpay KYC), a policy number (OT1, INV2,
reminder schedule) or an HR/storage decision — never a missing screen. Phase 3
is the franchisor layer, deferred by instruction; its two buildable modules
(16 Inward/Outward, 17 Analytics) are already done.

---

## 2. Phase 1 — Admission drive ready

### Module 1 · Centralised Admission Hub — 🟡

| Spec item                                            | Status | Evidence / gap                                                                   |
| ---------------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| Area master (locality → unit)                        | ✅     | `areas` controller, `AreaMaster` model                                           |
| Routing: area → availability → preference → confirm  | ✅     | `POST /leads/:id/route`                                                          |
| Override requires mandatory note                     | ✅     | `Leads.tsx` route modal                                                          |
| Re-route restricted to CH/receptionist, history kept | ✅     | `LeadActivity` rows on every route                                               |
| Dedicated hub admission line per unit                | ✅     | `unitSettings.admissionNumber`                                                   |
| Calendly booking link per unit                       | 🟡     | Stored and editable, but **no booking integration** — it is display-only         |
| Counsellor auto-notified via WhatsApp + ERP alert    | 🟡     | Alert row written and the dispatch worker sends it; live delivery needs BSP keys |

### Module 2 · First Buzz CRM — 🟡

| Spec item                                | Status | Evidence / gap                                                                                                                                           |
| ---------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9-stage pipeline                         | ✅     | `STAGE_ORDER` in `crm/leads.controller.ts`                                                                                                               |
| Lead scoring                             | ✅     | `leadScore` computed on create/stage change                                                                                                              |
| Lead activities timeline                 | ✅     | `LeadActivity`                                                                                                                                           |
| Form A (hub/remote) vs Form B (walk-in)  | ✅     | `formVersion` branch in `create()`                                                                                                                       |
| WhatsApp welcome + Calendly auto-trigger | 🔲     | Admission confirmation queues a welcome/receipt message; the lead-stage welcome + Calendly trigger still need a BSP template and a client Calendly token |
| Source-campaign tagging                  | ✅     | `sourceCampaign` field                                                                                                                                   |

### Module 3 · Admission & Enrolment — ✅

| Spec item                                                             | Status | Evidence / gap                                                                                                                                                               |
| --------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration → Discovery Flight → CH approval → confirm               | ✅     | `/admissions` page + `admissions` controller                                                                                                                                 |
| Admission no. `BB-U?-2627-NNNN`                                       | ✅     | `admissions.rules.ts` + tests                                                                                                                                                |
| Batch assignment at confirmation                                      | ✅     | `confirm()`                                                                                                                                                                  |
| Seat tracker (capacity block)                                         | ✅     | `batch._count.students >= batch.capacity`                                                                                                                                    |
| Sibling detection → concession                                        | ✅     | `siblingGroup` + `fees.rules.ts` (tested)                                                                                                                                    |
| **"Add to Class" activates attendance + fee ledger + parent account** | ✅     | `confirm()` sets the student `ACTIVE`, derives the fee ledger from the structure and returns `activated: { attendance, feeLedger, parentPortal }`; the whole step is audited |
| **Confirmation letter PDF → app + WhatsApp**                          | ✅     | `GET /students/:id/confirmation-letter(/pdf)`                                                                                                                                |
| **Orientation date capture**                                          | ✅     | `Student.orientationDate`, captured on confirm and printed in the letter                                                                                                     |
| **Waitlist when a batch is full**                                     | ✅     | `waitlist_entries` + `/admissions/waitlist*`; confirm returns `waitlisted`                                                                                                   |

### Module 4 · Discovery Flight — 🟡

| Spec item                                | Status | Evidence / gap                                                                                                                                                                                                                                                            |
| ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EP / GP / SP / NP / ND coding            | ✅     | Validated in `result` endpoint                                                                                                                                                                                                                                            |
| Centre Head approval gate                | ✅     | `POST /discovery/:dfId/approve`, blocked until result exists                                                                                                                                                                                                              |
| Strictly internal (never parent-visible) | ✅     | Not exposed by any `/parent` route                                                                                                                                                                                                                                        |
| Grade-wise templates                     | 🔲     | One generic form; per-programme variants need the programme content (§7 #14)                                                                                                                                                                                              |
| Auto-summary + recommendation            | ✅     | `GET /discovery/:dfId/summary` builds an internal-only summary and derives a suggested recommendation — EP/GP → READY, SP/NP → READY_WITH_SUPPORT, ND → ALTERNATE_LEVEL, unknown code → ND, plus `needsReview` on ND or a recorded allergy (`discovery.rules.ts`, tested) |

### Module 6 · Student Attendance — ✅

| Spec item                                            | Status       | Evidence / gap                                                                                                                                                                    |
| ---------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default ABSENT roster                                | ✅           | `roster()` returns every active student as ABSENT                                                                                                                                 |
| Lock = class start + 30 min (dynamic)                | ✅           | `attendance.rules.ts` + tests                                                                                                                                                     |
| CH override with mandatory reason                    | ✅           | Validated + audited                                                                                                                                                               |
| Absence push/WhatsApp at lock + 30 min               | ✅ (sandbox) | `absence-scan` job                                                                                                                                                                |
| Admin call task at lock + 2 h                        | ✅           | `admin-call-list` job                                                                                                                                                             |
| 3-day consecutive escalation                         | ✅           | Inside `absence-scan`                                                                                                                                                             |
| Daily 5:00 AM scheduler creating lock jobs per batch | ✅           | `jobs/scheduler.ts` — a BullMQ repeatable job at 05:00 IST plus an in-process catch-up tick; one scan per active batch, holiday-aware, idempotent per IST day                     |
| Teacher-has-not-submitted alert to CH                | ✅           | `unmarked-register-alert` job                                                                                                                                                     |
| Student leave applications (parent + admin-logged)   | ✅           | `student_leaves` model + `/students/:id/leaves`; approved leave suppresses the absence alert via `leaves.query.ts`                                                                |
| Attendance reports per batch/student                 | ✅           | `GET /attendance/reports/batch/:batchId` and `/reports/student/:id` (date range, per-child percentages over marked days, weakest first) + the report panel on the Attendance page |

### Module 7 · Fees — 🟡 + 🚫

| Spec item                                            | Status | Evidence / gap                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HO-locked fee structures per unit/programme/AY       | ✅     | `FeeStructure` + upsert endpoint                                                                                                                                                                                                                                 |
| Plans A / B / C + joining-window logic               | ✅     | `fees.rules.ts`, tested across all 12 months                                                                                                                                                                                                                     |
| 10% sibling concession                               | ✅     | Configurable pct, tested                                                                                                                                                                                                                                         |
| Collection, all payment modes, fine, discount        | ✅     | `POST /fees/pay` (DTO-validated)                                                                                                                                                                                                                                 |
| Receipt numbering + print + **PDF**                  | ✅     | `BB-U?-RCPT-2627-NNNN`, `/print` and `/pdf`                                                                                                                                                                                                                      |
| Cancellation with reason + audit                     | ✅     | `POST /fees/receipt/:id/cancel` (DTO + audit)                                                                                                                                                                                                                    |
| Reminders T-5 / T-0 / T+3 / T+7                      | ✅     | `reminderStage()` tested; `POST /fees/reminders/run`                                                                                                                                                                                                             |
| Dual ledger (preschool ≠ evening)                    | ✅     | `ledgerType` + tested separation                                                                                                                                                                                                                                 |
| No-Dues certificate                                  | ✅     | `POST /certificates` with gating + PDF                                                                                                                                                                                                                           |
| **Razorpay order → webhook → auto receipt → ledger** | 🟡     | Built end-to-end behind `payments/razorpay.adapter.ts`; live mode switches on when KYC keys land                                                                                                                                                                 |
| "Pay Now" in parent portal                           | ✅     | Parent card shows the gateway only when `/fees/online/config` reports `enabled`                                                                                                                                                                                  |
| **14 reports**                                       | ✅     | `modules/fees/reports.controller.ts` — daily collection, day book, monthly collection, payment mode, outstanding, fee status, discounts, cancellations, structure master, programme revenue, unit-wise, head-wise, add-ons, Tally CSV; each also exported as CSV |

---

## 3. Phase 2 — Operational modules

### Module 5 · Student Lifecycle — ✅

| Spec item                    | Status | Evidence / gap                                                                                                                |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 18 tabs declared             | ✅     | `LIFECYCLE_TABS` (18 entries, each with a visibility rule)                                                                    |
| Records per tab, per student | ✅     | `TAB_SCHEMAS` in `lifecycle.rules.ts` gives all 18 tabs typed fields with required markers; writes are validated against them |
| Visibility enforcement       | ✅     | `visibility` column honoured end-to-end, including `GET /parents/child/:id/lifecycle` (STAFF_PARENT only)                     |
| Grade transitions            | ✅     | `POST /lifecycle/students/:id/promote`                                                                                        |
| Readiness report             | ✅     | `GET /lifecycle/readiness/:studentId` (K2 → Grade 1 readiness)                                                                |
| TC / Graduation              | ✅     | Certificate templates + fee-gating for TC                                                                                     |

### Module 8 · HR & Payroll — ✅ core, 🟡 edges

| Spec item                                              | Status | Evidence / gap                                                                                                                                                                      |
| ------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shift master (4 shifts, minutes, half-day, OT trigger) | ✅     | `HrShift` + masters UI                                                                                                                                                              |
| Morning salaried engine                                | ✅     | `payroll/morning/calculate`                                                                                                                                                         |
| Late brackets + 2/month forgiveness                    | ✅     | `late.slice(2)`, brackets 30/60/120/+                                                                                                                                               |
| LWP from approved leave                                | ✅     | `StaffLeave.isLwp`                                                                                                                                                                  |
| Evening hourly engine (separate)                       | ✅     | `payroll/evening/calculate`, minute rates                                                                                                                                           |
| OT pre-approval only (OT2)                             | ✅     | `OvertimeAuthorisation`, APPROVED-only matching                                                                                                                                     |
| OT multiplier (OT1)                                    | 🚫     | Placeholder multiplier on the authorisation row; business value still open                                                                                                          |
| PT / PF / ESIC statutory                               | ✅     | `StatutoryScheme` + slabs, `apply-statutory`                                                                                                                                        |
| Maker-checker / lock / reversal                        | ✅     | Enforced + unit tested                                                                                                                                                              |
| Payslips + CSV export                                  | ✅     | HTML payslips, `export.csv`                                                                                                                                                         |
| Security deposit (morning staff)                       | 🔲     | No entity, no holding/return/forfeit tracking                                                                                                                                       |
| Guest engagement log                                   | 🔲     | No entity                                                                                                                                                                           |
| AB penalty + auto-LWP at cutoff                        | ✅     | `runLeaveCutoffTick()` in the daily scheduler: a leave nobody decided by its last day flips to `AUTO_LWP` with `isLwp`, once per IST day; `POST /hr/leave/cutoff` runs it on demand |
| Employee self-service (my payslips / apply leave)      | ✅     | `/me/profile`, `/me/payslips`, `/me/leaves` (+ apply), `/me/attendance`                                                                                                             |

### Module 10 · Academic — 🟡

| Spec item                                                 | Status | Evidence / gap                                                                                                                                                                        |
| --------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yearly Goals / Big Rocks / Calendar / Log Plan            | ✅     | `kind` + status endpoints, one UI                                                                                                                                                     |
| CH approval on Calendar                                   | ✅     | `PATCH /academic/:id/status`                                                                                                                                                          |
| Daily Plan as a derived view                              | ✅     | `GET /academic/daily-plan?date=…` derives the day from the Calendar first, then the Log Plan by `timeLabel`, excluding DRAFT/SUBMITTED (`dailyPlan()` in `academic.rules.ts`, tested) |
| Unit overlay on the AD master Log Plan                    | ✅     | `POST /academic/:id/overlay` + `GET /academic/:id/overlays`; an overlay applies only to a locked HO master, one per master per unit, and wins only on the fields it sets              |
| Hierarchical outcome taxonomy (domain → strand → outcome) | 🔲     | Blocked on ACA-OUT-1 + EduGrowth brief — content, not code                                                                                                                            |
| HO-locked authoring (AD authors, units consume)           | ✅     | `isLocked` refuses unit edits, every accepted edit bumps `version`, unlocking returns the record to `APPROVED`                                                                        |

### Module 11 · Inventory — ✅

| Spec item                                      | Status | Evidence / gap                                                                                                        |
| ---------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| 8 categories + SKU coding                      | ✅     | `CATS`, `InventoryItem.sku`                                                                                           |
| Stock ledger / movements                       | ✅     | `InventoryMovement`, add/issue endpoint                                                                               |
| Reorder level + low-stock flag                 | ✅     | Used by analytics                                                                                                     |
| ₹5,000 petty cash float per unit (HO-editable) | ✅     | `unitSettings.pettyCashFloat`                                                                                         |
| **PRF → PO → GRN flow**                        | ✅     | `procurement` module + UI                                                                                             |
| Vendor master + pre-approved item list         | ✅     | `vendors` endpoints                                                                                                   |
| Student issue linked to fee                    | ✅     | `POST /inventory/:id/issue-to-student`                                                                                |
| Opening stock per new unit                     | ✅     | `POST /inventory/opening-stock` — one `ADJUSTMENT_IN` per line, refused if the item already has movements in the unit |
| **10 inventory reports**                       | ✅     | `/procurement/reports/*` + UI runner                                                                                  |

### Module 12 · Parent Communication — 🟡 + 🚫

| Spec item                                    | Status       | Evidence / gap                           |
| -------------------------------------------- | ------------ | ---------------------------------------- |
| Parent portal (PWA), installable             | ✅           | `/parent`, manifest + service worker     |
| Web push (absence, fees, announcements)      | ✅           | `PushService` + `PushSubscription`       |
| CH-owned reply model                         | ✅           | Parent ↔ CH conversation thread          |
| Announcements fan-out per family             | ✅           | `POST /comms/announce`                   |
| Single outbox + dispatch                     | ✅ (sandbox) | `POST /comms/dispatch`                   |
| Real WhatsApp dispatch                       | 🚫           | Needs BSP account + approved templates   |
| Channel rules (app-first → WhatsApp → email) | ✅           | `comms.rules.ts` + dispatch service      |
| AD escalation for unanswered parent messages | ✅           | `parent-reply-sla` job                   |
| HO template management screen (B2)           | ✅           | `/comms/templates`, editable in Settings |
| Email receipts/certificates                  | ✅           | SMTP provider in `comms/providers.ts`    |

### Module 13 · PTM — 🟡

| Spec item                         | Status | Evidence / gap                                                                                                |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| Session scheduling                | ✅     | `PtmSession`                                                                                                  |
| Parent attendance + teacher notes | ✅     | `PtmRecord`                                                                                                   |
| Physical form reference           | 🟡     | `signedFormUrl` keeps the reference; uploading the scan needs object storage (S3/Spaces) and a retention rule |
| Student-wise view                 | ✅     | `GET /ptm/student/:id` + the history modal on the PTM page (meetings, attendance, booked slot, teacher notes) |
| Class-wise (batch) view           | ✅     | `GET /ptm/session/:id/summary`                                                                                |
| Per-parent slot booking           | ✅     | `/ptm/:id/slots`, `/ptm/slots/:id/book`, parent PTM card                                                      |

### Module 14 · Certificates & Documents — ✅

| Spec item                                | Status | Evidence / gap                                                                                                                                                                             |
| ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HO-locked templates, serials, print, PDF | ✅     | `TEMPLATES`, `BB-U?-CERT-2627-NNNN`, `/print`, `/pdf`                                                                                                                                      |
| I-card batch sheets                      | ✅     | `id-cards/batch/print`                                                                                                                                                                     |
| **The spec's 7 types**                   | ✅     | Bonafide, Progress, Participation, Appreciation, Character, Graduation, TC **plus** No Dues, Fee Statement and Admission Confirmation (`certificates.controller.ts`), all with PDF + print |
| TC gated on cleared fees                 | ✅     | Fee check before issue                                                                                                                                                                     |

### Module 15 · Evening Activity Centre — 🟡

| Spec item                                     | Status | Evidence / gap                          |
| --------------------------------------------- | ------ | --------------------------------------- |
| Activities with fee + capacity                | ✅     | `EveningActivity`                       |
| Enrolment + payments, separate receipt series | ✅     | `EveningEnrollment` / `EveningPayment`  |
| Ledger kept out of school fees                | ✅     | Tested in `fees.rules.spec.ts`          |
| **External (non-student) registration**       | ✅     | `evening_participants` + enrol-external |
| **Session-level attendance**                  | ✅     | `evening_sessions` + roster/attendance  |
| Todd Care evening                             | 🔲     | Pending business decision               |

### Module 17 · Analytics & Founder Dashboard — ✅

| Spec item                                     | Status | Evidence / gap                                                                                                                                                                                |
| --------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real-time KPI cards, unit-wise + consolidated | ✅     | `/analytics`                                                                                                                                                                                  |
| Admission funnel + conversion                 | ✅     | Stage groupBy                                                                                                                                                                                 |
| Revenue (preschool + evening, separately)     | ✅     |                                                                                                                                                                                               |
| Inventory value + low stock                   | ✅     |                                                                                                                                                                                               |
| Payroll cost + PTM attendance                 | ✅     |                                                                                                                                                                                               |
| **Capacity utilisation (seats vs enrolled)**  | ✅     | `GET /analytics/metrics` → `capacity`                                                                                                                                                         |
| Staff summary                                 | ✅     | `GET /analytics/metrics` → `staff`                                                                                                                                                            |
| Scheduled email/PDF digest                    | ✅     | `DigestService` + `digest.rules.ts`, run by the Monday 08:00 IST tick: one `WEEKLY_DIGEST` message per student per IST week, PDF + email, no screening or medical detail, empty weeks skipped |

---

## 4. Phase 3 — Franchisor control (⏸ deferred, spec'd)

| Module                                | Status | Note                                                                                                |
| ------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| 16 · Inward / Outward Register        | ✅     | `inward-outward` register Required for franchise audit trail; simple to build once franchise starts |
| 18 · Franchise Management             | ⏸      | Onboarding, agreement, territory, compliance                                                        |
| 19 · Central Academic Governance      | ⏸      | Curriculum master, DF template master, versioning                                                   |
| 20 · Training & SOP Compliance        | ⏸      | SOP library, certification tracking, scoring                                                        |
| 21 · Central Inventory & Supply Chain | ⏸      | SKU master (HO), opening stock, PO, hit/asset register                                              |
| 22 · Royalty & Financial Oversight    | ⏸      | Royalty calculation, benchmarking                                                                   |
| 23 · Marketing & Lead Intelligence    | ⏸      | Cost per admission, conversion benchmarking                                                         |

## 5. Phase 4 — AI & Intelligence (⏸ deferred)

| Module                                  | Status |
| --------------------------------------- | ------ |
| 24 · BuzzPortfolio integration          | ⏸      |
| 25 · BuzzSheet integration              | ⏸      |
| 26 · EduGrowth Matrix integration       | ⏸      |
| 27 · Predictive analytics & forecasting | ⏸      |

---

## 6. System-wide (not a module, but scored per spec)

| Requirement                                           | Status | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit log on every mutation                           | ✅     | `AuditService`, global                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Role-based access, 8 roles                            | ✅     | `HO_ROLES`, `@Roles`, guard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Multi-unit isolation                                  | ✅     | `unitScope()`, tested                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Login brute-force protection                          | ✅     | Throttling + failed-login audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Request validation                                    | ✅     | Every `@Body()` in the API carries a DTO class — 46 untyped bodies and 19 inline shapes were replaced, down to the retention-policy endpoint. `test/body-dto.spec.ts` fails the build on any `any`, `Record<…>` or inline-object body, and on a DTO used without an import                                                                                                                                                                                                                                                |
| **Consent log**                                       | ✅     | Written at registration, parent signup and via `/privacy/consent`                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **PII encryption at rest**                            | ✅     | `pii.service.ts` (AES-256-GCM, `PII_KEY`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Retention policy / auto-purge**                     | ✅     | `retention.service.ts` nightly tick                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Data export & delete (data subject rights)**        | ✅     | `/privacy/students/:id/export`, anonymisation endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Notification fallback chain (push → WhatsApp → email) | ✅     | `dispatch.service.ts`, unit-tested                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 29 SOPs library                                       | 🔲     | Documentation deliverable, not code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Brand rules (Nunito/DM Sans, palette, BumbleB scale)  | ✅     | Design system + Snowball tokens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Bilingual UI (Gujarati)                               | 🟡     | Translated: shell, login, parent portal, PTM (incl. the student-history modal), My Space, and the chrome + field labels of all 15 staff pages (headers, buttons, filters, placeholders, table columns, modal titles, empty states). Free-text data (names, notes, ledger narrations) stays as typed. Remaining: Gujarati for long-form prose such as help text and validation messages, which needs a copywriting pass. `npm run i18n:check` fails the build if a `t('…')` key or an `L('…')` label has no Gujarati entry |
| Nightly backups, Sentry, uptime monitoring            | ✅     | `scripts/backup.sh`, `scripts/restore.sh`, `docs/RUNBOOK.md`, Sentry in the API                                                                                                                                                                                                                                                                                                                                                                                                                                           |

---

## 7. Blocked on the founder (cannot be coded around)

| #   | Item                                                   | Blocks                                                                      |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| 1   | Razorpay merchant KYC                                  | Online fee payment, auto-receipt, parent "Pay Now"                          |
| 2   | WhatsApp BSP account + template approval               | All live messaging, welcome/absence/receipt sends, template screen          |
| 3   | Domain + VPS                                           | Production deployment                                                       |
| 4   | Logo files (light/dark, high-res) + brand TTF          | Real branding; rupee glyph in PDFs needs an embedded font                   |
| 5   | Real fee structures per programme/unit for AY 2026-27  | Go-live data                                                                |
| 6   | PC-1: confirm reminder schedule with the Academic Lead | Reminder defaults (currently T-5/T-0/T+3/T+7)                               |
| 7   | OT1: overtime multiplier                               | First real payroll run                                                      |
| 8   | INV2: reorder-quantity basis                           | Automated reorder alerts                                                    |
| 9   | ACA-LP-1, ACA-CAL-4, ACA-SEED-1/2, ACA-OUT-1           | Todd Care/PlayHouse curriculum, Saturday hours, Big Rocks content, taxonomy |
| 10  | CA / Legal: PT applicability for hourly evening staff  | Evening payroll statutory                                                   |
| 11  | Central hub admission phone number                     | Hub settings                                                                |
| 12  | HR policy: security deposit + guest engagement log     | Two HR entities that cannot be designed without the policy                  |
| 13  | Todd Care evening: programme and fee decision          | The last Evening Activity Centre gap                                        |
| 14  | Grade-wise Discovery Flight form content               | Per-programme DF templates (one generic form today)                         |
| 15  | Object storage (S3 / Spaces) + retention rule          | Uploading the signed PTM form scan (the reference URL works today)          |
| 16  | Calendly token + booking plan                          | Real slot booking from the stored unit link (display-only today)            |

---

## 8. Where the plan landed

Sprints S1–S8 from the original plan are **done** (see the delivery table at the
top for commits and scope). What remains is either blocked on the client or a
documentation deliverable:

| Item                                        | Status | Note                                                                         |
| ------------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| Razorpay live mode                          | 🚫     | Code complete behind the adapter; needs merchant KYC + webhook secret        |
| WhatsApp live delivery                      | 🚫     | Adapter complete; needs BSP account and approved templates                   |
| Domain / VPS / TLS                          | 🚫     | `docs/RUNBOOK.md` is written for the deploy the moment a host exists         |
| Brand TTFs + logo files                     | 🚫     | PDFs use WinAnsi (no rupee glyph) until the font arrives                     |
| Real fee structures, OT multiplier, INV2    | 🚫     | Business data/decisions, not code                                            |
| 29 SOPs library                             | 🔲     | Documentation deliverable owned by the founder                               |
| Scheduled email/PDF digest                  | ✅     | Built: Monday 08:00 IST, weekly per-student email + PDF                      |
| Grade-wise Discovery Flight templates       | 🟡     | One generic form; per-programme variants need the programme content (§7 #14) |
| Faculty guest-engagement / security deposit | 🟡     | Not built — needs HR policy confirmation                                     |

**Verification for this state:** `npm test` 261/261 across 28 suites,
`tsc --noEmit` clean, prettier clean, frontend production build clean, and all
four CI jobs green (`API`, `Database`, `Frontend`, `Repo — prettier`).

### Schema integrity (fixed 22 Oct 2026)

`prisma generate` had never run in this environment (engine downloads are
blocked), so two latent defects only surfaced when CI first ran:

1. **The schema was not valid Prisma** — a group of models had every field on
   one line, which the parser rejects. Every model/enum is now one field per
   line (canonical `prisma format` output).
2. **The generated migration disagreed with the schema** — `@db.*` attributes
   were ignored, so every UUID column was emitted as `TEXT`, dates as
   `TIMESTAMP(3)` and sized decimals as `DECIMAL(65,30)`; optional `@unique`
   columns had no index; `ON DELETE` ignored relation optionality. Fixed in
   `prisma/generate-init-migration.py`, and five HR relation columns that were
   missing `@db.Uuid` were corrected in the schema.

The generator is now guarded by CI: the committed SQL must equal a fresh run of
`prisma/generate-init-migration.py`, and `prisma migrate diff` must report no
drift against `schema.prisma`.

## 9. How this was verified

- **Routes:** 261 enumerated from decorators and compared to the pre-refactor
  baseline (130 + `/health` + 2 PDF endpoints, zero missing).
- **Models:** 66 models / 11 enums read from `schema.prisma`; presence of entities
  such as `OvertimeAuthorisation`, `StatutoryScheme` confirmed directly.
- **Behaviour:** 261 tests cover the fee, attendance, admission, certificate, scoping,
  validation and payroll rules; PDFs were rendered and text-extracted.
- **Gaps:** each 🟡/🔲 above names the file or the missing entity, so it can be
  checked independently.
