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

**Current footprint:** 133 HTTP routes · 48 Prisma models · 11 enums · 54 tests ·
21 staff pages + parent PWA.

---

## 1. Scoreboard

| Phase                     | Modules                        | ✅  | 🟡  | 🔲  | ⏸   | 🚫  |
| ------------------------- | ------------------------------ | --- | --- | --- | --- | --- |
| Phase 1 (admission drive) | 1, 2, 3, 4, 6, 7               | —   | 5   | —   | —   | 1   |
| Phase 2 (operations)      | 5, 8, 10, 11, 12, 13, 14, 15   | 1   | 6   | —   | —   | 1   |
| Phase 3 (franchisor)      | 16, 17, 18, 19, 20, 21, 22, 23 | —   | 1   | 1   | 6   | —   |
| Phase 4 (AI)              | 24, 25, 26, 27                 | —   | —   | —   | 4   | —   |

Nothing in Phase 1 is unbuilt; the gaps are spec details, not missing screens.
The real open surface is Phase 3 (franchisor control) and the DPDP/system-wide layer.

---

## 2. Phase 1 — Admission drive ready

### Module 1 · Centralised Admission Hub — 🟡

| Spec item                                            | Status | Evidence / gap                                                           |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| Area master (locality → unit)                        | ✅     | `areas` controller, `AreaMaster` model                                   |
| Routing: area → availability → preference → confirm  | ✅     | `POST /leads/:id/route`                                                  |
| Override requires mandatory note                     | ✅     | `Leads.tsx` route modal                                                  |
| Re-route restricted to CH/receptionist, history kept | ✅     | `LeadActivity` rows on every route                                       |
| Dedicated hub admission line per unit                | ✅     | `unitSettings.admissionNumber`                                           |
| Calendly booking link per unit                       | 🟡     | Stored and editable, but **no booking integration** — it is display-only |
| Counsellor auto-notified via WhatsApp + ERP alert    | 🚫     | Alert row is written (`MessageLog`), dispatch needs BSP keys             |

### Module 2 · First Buzz CRM — 🟡

| Spec item                                | Status | Evidence / gap                                                                          |
| ---------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| 9-stage pipeline                         | ✅     | `STAGE_ORDER` in `crm/leads.controller.ts`                                              |
| Lead scoring                             | ✅     | `leadScore` computed on create/stage change                                             |
| Lead activities timeline                 | ✅     | `LeadActivity`                                                                          |
| Form A (hub/remote) vs Form B (walk-in)  | ✅     | `formVersion` branch in `create()`                                                      |
| WhatsApp welcome + Calendly auto-trigger | 🔲     | Outbox rows exist; no automatic trigger on lead creation — needs BSP + a Calendly token |
| Source-campaign tagging                  | ✅     | `sourceCampaign` field                                                                  |

### Module 3 · Admission & Enrolment — 🟡

| Spec item                                                             | Status | Evidence / gap                                                                                                                         |
| --------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Registration → Discovery Flight → CH approval → confirm               | ✅     | `/admissions` page + `admissions` controller                                                                                           |
| Admission no. `BB-U?-2627-NNNN`                                       | ✅     | `admissions.rules.ts` + tests                                                                                                          |
| Batch assignment at confirmation                                      | ✅     | `confirm()`                                                                                                                            |
| Seat tracker (capacity block)                                         | ✅     | `batch._count.students >= batch.capacity`                                                                                              |
| Sibling detection → concession                                        | ✅     | `siblingGroup` + `fees.rules.ts` (tested)                                                                                              |
| **"Add to Class" activates attendance + fee ledger + parent account** | 🟡     | Fees derive from the structure and the parent logs in by phone, but there is no explicit one-shot activation step or activation record |
| **Confirmation letter PDF → app + WhatsApp**                          | 🔲     | No letter endpoint; certificates module has no `CONFIRMATION` template                                                                 |
| **Orientation date capture**                                          | 🔲     | No field or screen                                                                                                                     |
| **Waitlist when a batch is full**                                     | 🔲     | Full batch = hard error; no waitlist state                                                                                             |

### Module 4 · Discovery Flight — 🟡

| Spec item                                | Status | Evidence / gap                                               |
| ---------------------------------------- | ------ | ------------------------------------------------------------ |
| EP / GP / SP / NP / ND coding            | ✅     | Validated in `result` endpoint                               |
| Centre Head approval gate                | ✅     | `POST /discovery/:dfId/approve`, blocked until result exists |
| Strictly internal (never parent-visible) | ✅     | Not exposed by any `/parent` route                           |
| Grade-wise templates                     | 🔲     | One generic form; no per-programme template selection        |
| Auto-summary + recommendation            | 🟡     | Free-text recommendation only; no generated summary          |

### Module 6 · Student Attendance — 🟡 (one safety-critical gap)

| Spec item                                                | Status       | Evidence / gap                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default ABSENT roster                                    | ✅           | `roster()` returns every active student as ABSENT                                                                                                                                                                                                                                       |
| Lock = class start + 30 min (dynamic)                    | ✅           | `attendance.rules.ts` + tests                                                                                                                                                                                                                                                           |
| CH override with mandatory reason                        | ✅           | Validated + audited                                                                                                                                                                                                                                                                     |
| Absence push/WhatsApp at lock + 30 min                   | ✅ (sandbox) | `absence-scan` job                                                                                                                                                                                                                                                                      |
| Admin call task at lock + 2 h                            | ✅           | `admin-call-list` job                                                                                                                                                                                                                                                                   |
| 3-day consecutive escalation                             | ✅           | Inside `absence-scan`                                                                                                                                                                                                                                                                   |
| **Daily 5:00 AM scheduler creating lock jobs per batch** | 🔲           | **High priority.** Jobs are only enqueued when a teacher marks attendance. If nobody marks, no absence scan runs and no parent is alerted — the exact child-safety case the rule exists for. Needs a repeatable job at 05:00 IST that enqueues one scan per active batch, holiday-aware |
| Teacher-has-not-submitted alert to CH                    | 🔲           | Same missing scheduler                                                                                                                                                                                                                                                                  |
| **Student leave applications (parent + admin-logged)**   | 🔲           | No model. `LEAVE` is only a marking status; "approved leave suppresses alert" cannot work                                                                                                                                                                                               |
| Attendance reports per batch/student                     | 🟡           | Summary + messages only                                                                                                                                                                                                                                                                 |

### Module 7 · Fees — 🟡 + 🚫

| Spec item                                            | Status | Evidence / gap                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HO-locked fee structures per unit/programme/AY       | ✅     | `FeeStructure` + upsert endpoint                                                                                                                                                                                                                                                                                                          |
| Plans A / B / C + joining-window logic               | ✅     | `fees.rules.ts`, tested across all 12 months                                                                                                                                                                                                                                                                                              |
| 10% sibling concession                               | ✅     | Configurable pct, tested                                                                                                                                                                                                                                                                                                                  |
| Collection, all payment modes, fine, discount        | ✅     | `POST /fees/pay` (DTO-validated)                                                                                                                                                                                                                                                                                                          |
| Receipt numbering + print + **PDF**                  | ✅     | `BB-U?-RCPT-2627-NNNN`, `/print` and `/pdf`                                                                                                                                                                                                                                                                                               |
| Cancellation with reason + audit                     | ✅     | `POST /fees/receipt/:id/cancel` (DTO + audit)                                                                                                                                                                                                                                                                                             |
| Reminders T-5 / T-0 / T+3 / T+7                      | ✅     | `reminderStage()` tested; `POST /fees/reminders/run`                                                                                                                                                                                                                                                                                      |
| Dual ledger (preschool ≠ evening)                    | ✅     | `ledgerType` + tested separation                                                                                                                                                                                                                                                                                                          |
| No-Dues certificate                                  | 🔲     | No template or endpoint                                                                                                                                                                                                                                                                                                                   |
| **Razorpay order → webhook → auto receipt → ledger** | 🚫     | Not started; needs merchant KYC                                                                                                                                                                                                                                                                                                           |
| "Pay Now" in parent portal                           | 🚫     | Placeholder note only                                                                                                                                                                                                                                                                                                                     |
| **14 reports**                                       | 🟡     | 3 of 14: summary, per-student ledger, reminder log. Missing: Daily Collection, Outstanding, Fee Status per Student, Day Book, Monthly Collection, Unit-wise (HO), Payment Mode, Discount & Concession, Cancellation & Refund Log, Fee Structure Master, Programme-wise Revenue, Head-wise Summary, Add-on Fees, Accounting Export (Tally) |

---

## 3. Phase 2 — Operational modules

### Module 5 · Student Lifecycle — 🟡

| Spec item                    | Status | Evidence / gap                                                                                                                        |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 18 tabs declared             | ✅     | `LIFECYCLE_TABS` (18 entries, each with a visibility rule)                                                                            |
| Records per tab, per student | 🟡     | Stored as generic `{tab, title, payload}` rows — no per-tab schema, no required fields                                                |
| Visibility enforcement       | 🟡     | `visibility` column exists; parent portal does not read lifecycle records at all, so "staff + parent" tabs are effectively staff-only |
| Grade transitions            | 🔲     | No promotion/transition flow                                                                                                          |
| Readiness report             | 🔲     | Not built (needed for K2 → Grade 1)                                                                                                   |
| TC / Graduation              | ✅     | Certificate templates + fee-gating for TC                                                                                             |

### Module 8 · HR & Payroll — ✅ core, 🟡 edges

| Spec item                                              | Status | Evidence / gap                                                             |
| ------------------------------------------------------ | ------ | -------------------------------------------------------------------------- |
| Shift master (4 shifts, minutes, half-day, OT trigger) | ✅     | `HrShift` + masters UI                                                     |
| Morning salaried engine                                | ✅     | `payroll/morning/calculate`                                                |
| Late brackets + 2/month forgiveness                    | ✅     | `late.slice(2)`, brackets 30/60/120/+                                      |
| LWP from approved leave                                | ✅     | `StaffLeave.isLwp`                                                         |
| Evening hourly engine (separate)                       | ✅     | `payroll/evening/calculate`, minute rates                                  |
| OT pre-approval only (OT2)                             | ✅     | `OvertimeAuthorisation`, APPROVED-only matching                            |
| OT multiplier (OT1)                                    | 🚫     | Placeholder multiplier on the authorisation row; business value still open |
| PT / PF / ESIC statutory                               | ✅     | `StatutoryScheme` + slabs, `apply-statutory`                               |
| Maker-checker / lock / reversal                        | ✅     | Enforced + unit tested                                                     |
| Payslips + CSV export                                  | ✅     | HTML payslips, `export.csv`                                                |
| Security deposit (morning staff)                       | 🔲     | No entity, no holding/return/forfeit tracking                              |
| Guest engagement log                                   | 🔲     | No entity                                                                  |
| AB penalty + auto-LWP at cutoff                        | 🟡     | LWP exists; no scheduled cutoff job that flips pending leaves              |
| Employee self-service (my payslips / apply leave)      | 🔲     | All HR routes are Founder/HR_MANAGER only                                  |

### Module 10 · Academic — 🟡

| Spec item                                                 | Status | Evidence / gap                             |
| --------------------------------------------------------- | ------ | ------------------------------------------ |
| Yearly Goals / Big Rocks / Calendar / Log Plan            | ✅     | `kind` + status endpoints, one UI          |
| CH approval on Calendar                                   | ✅     | `PATCH /academic/:id/status`               |
| Daily Plan as a derived view                              | 🔲     | Not built                                  |
| Unit overlay on the AD master Log Plan                    | 🔲     | Single flat record set                     |
| Hierarchical outcome taxonomy (domain → strand → outcome) | 🔲     | Blocked on ACA-OUT-1 + EduGrowth brief     |
| HO-locked authoring (AD authors, units consume)           | 🟡     | Role-checked, but no lock/version workflow |

### Module 11 · Inventory — 🟡 (procurement half missing)

| Spec item                                      | Status | Evidence / gap                                       |
| ---------------------------------------------- | ------ | ---------------------------------------------------- |
| 8 categories + SKU coding                      | ✅     | `CATS`, `InventoryItem.sku`                          |
| Stock ledger / movements                       | ✅     | `InventoryMovement`, add/issue endpoint              |
| Reorder level + low-stock flag                 | ✅     | Used by analytics                                    |
| ₹5,000 petty cash float per unit (HO-editable) | ✅     | `unitSettings.pettyCashFloat`                        |
| **PRF → PO → GRN flow**                        | 🔲     | No purchase request, order or goods-receipt entities |
| Vendor master + pre-approved item list         | 🔲     | Not built                                            |
| Student issue linked to fee                    | 🔲     | Issues are not billed                                |
| Opening stock per new unit                     | 🔲     | No opening-stock entry                               |
| **10 inventory reports**                       | 🔲     | None; only the live stock list                       |

### Module 12 · Parent Communication — 🟡 + 🚫

| Spec item                                    | Status       | Evidence / gap                         |
| -------------------------------------------- | ------------ | -------------------------------------- |
| Parent portal (PWA), installable             | ✅           | `/parent`, manifest + service worker   |
| Web push (absence, fees, announcements)      | ✅           | `PushService` + `PushSubscription`     |
| CH-owned reply model                         | ✅           | Parent ↔ CH conversation thread        |
| Announcements fan-out per family             | ✅           | `POST /comms/announce`                 |
| Single outbox + dispatch                     | ✅ (sandbox) | `POST /comms/dispatch`                 |
| Real WhatsApp dispatch                       | 🚫           | Needs BSP account + approved templates |
| Channel rules (app-first → WhatsApp → email) | 🔲           | No fallback chain, no email channel    |
| AD escalation for unanswered parent messages | 🔲           | No escalation timer                    |
| HO template management screen (B2)           | 🔲           | Templates live in code                 |
| Email receipts/certificates                  | 🔲           | No mail transport                      |

### Module 13 · PTM — 🟡

| Spec item                         | Status | Evidence / gap                                        |
| --------------------------------- | ------ | ----------------------------------------------------- |
| Session scheduling                | ✅     | `PtmSession`                                          |
| Parent attendance + teacher notes | ✅     | `PtmRecord`                                           |
| Physical form reference           | 🟡     | `signedFormUrl` string only — no upload/storage       |
| Student-wise view                 | 🟡     | Records are queryable by student; no dedicated screen |
| Class-wise (batch) view           | 🔲     | Session is batch-scoped but no batch roll-up view     |
| Per-parent slot booking           | 🔲     | Not built                                             |

### Module 14 · Certificates & Documents — 🟡 (template set mismatch)

| Spec item                                | Status | Evidence / gap                                                                                                                                                                                                                                           |
| ---------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HO-locked templates, serials, print, PDF | ✅     | `TEMPLATES`, `BB-U?-CERT-2627-NNNN`, `/print`, `/pdf`                                                                                                                                                                                                    |
| I-card batch sheets                      | ✅     | `id-cards/batch/print`                                                                                                                                                                                                                                   |
| **The spec's 7 types**                   | 🟡     | Implemented: Bonafide, Progress, Participation, Appreciation, Character, Graduation, TC. **Missing: No Dues, Fee Statement, Admission Confirmation.** The four "extra" types are lifecycle awards — keep them, but the three document types are required |
| TC gated on cleared fees                 | ✅     | Fee check before issue                                                                                                                                                                                                                                   |

### Module 15 · Evening Activity Centre — 🟡

| Spec item                                     | Status | Evidence / gap                             |
| --------------------------------------------- | ------ | ------------------------------------------ |
| Activities with fee + capacity                | ✅     | `EveningActivity`                          |
| Enrolment + payments, separate receipt series | ✅     | `EveningEnrollment` / `EveningPayment`     |
| Ledger kept out of school fees                | ✅     | Tested in `fees.rules.spec.ts`             |
| **External (non-student) registration**       | 🔲     | Enrolment requires an existing `studentId` |
| **Session-level attendance**                  | 🔲     | No evening attendance entity               |
| Todd Care evening                             | 🔲     | Pending business decision                  |

### Module 17 · Analytics & Founder Dashboard — 🟡

| Spec item                                     | Status | Evidence / gap     |
| --------------------------------------------- | ------ | ------------------ |
| Real-time KPI cards, unit-wise + consolidated | ✅     | `/analytics`       |
| Admission funnel + conversion                 | ✅     | Stage groupBy      |
| Revenue (preschool + evening, separately)     | ✅     |                    |
| Inventory value + low stock                   | ✅     |                    |
| Payroll cost + PTM attendance                 | ✅     |                    |
| **Capacity utilisation (seats vs enrolled)**  | 🔲     | Not in the payload |
| Staff summary                                 | 🔲     | Not in the payload |
| Scheduled email/PDF digest                    | 🔲     | Not built          |

---

## 4. Phase 3 — Franchisor control (⏸ deferred, spec'd)

| Module                                | Status | Note                                                                      |
| ------------------------------------- | ------ | ------------------------------------------------------------------------- |
| 16 · Inward / Outward Register        | 🔲     | Required for franchise audit trail; simple to build once franchise starts |
| 18 · Franchise Management             | ⏸      | Onboarding, agreement, territory, compliance                              |
| 19 · Central Academic Governance      | ⏸      | Curriculum master, DF template master, versioning                         |
| 20 · Training & SOP Compliance        | ⏸      | SOP library, certification tracking, scoring                              |
| 21 · Central Inventory & Supply Chain | ⏸      | SKU master (HO), opening stock, PO, hit/asset register                    |
| 22 · Royalty & Financial Oversight    | ⏸      | Royalty calculation, benchmarking                                         |
| 23 · Marketing & Lead Intelligence    | ⏸      | Cost per admission, conversion benchmarking                               |

## 5. Phase 4 — AI & Intelligence (⏸ deferred)

| Module                                  | Status |
| --------------------------------------- | ------ |
| 24 · BuzzPortfolio integration          | ⏸      |
| 25 · BuzzSheet integration              | ⏸      |
| 26 · EduGrowth Matrix integration       | ⏸      |
| 27 · Predictive analytics & forecasting | ⏸      |

---

## 6. System-wide (not a module, but scored per spec)

| Requirement                                           | Status | Gap                                                                       |
| ----------------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| Audit log on every mutation                           | ✅     | `AuditService`, global                                                    |
| Role-based access, 8 roles                            | ✅     | `HO_ROLES`, `@Roles`, guard                                               |
| Multi-unit isolation                                  | ✅     | `unitScope()`, tested                                                     |
| Login brute-force protection                          | ✅     | Throttling + failed-login audit                                           |
| Request validation                                    | 🟡     | 9 endpoints covered by DTOs; the rest still accept `any`                  |
| **Consent log**                                       | 🔲     | Table exists, **0 writes**. Needs capture at registration + parent signup |
| **PII encryption at rest**                            | 🔲     | `pan`, `uan`, `esicNumber`, `bankAccountNo` stored plaintext              |
| **Retention policy / auto-purge**                     | 🔲     | Not built                                                                 |
| **Data export & delete (data subject rights)**        | 🔲     | Not built                                                                 |
| Notification fallback chain (push → WhatsApp → email) | 🔲     | Single channel per message                                                |
| 29 SOPs library                                       | 🔲     | Documentation deliverable, not code                                       |
| Brand rules (Nunito/DM Sans, palette, BumbleB scale)  | ✅     | Design system + Snowball tokens                                           |
| Bilingual UI (Gujarati)                               | 🟡     | Shell, login, parent portal done; staff page bodies still English         |
| Nightly backups, Sentry, uptime monitoring            | 🔲     | Ops work; `/api/health` is ready to be monitored                          |

---

## 7. Blocked on the founder (cannot be coded around)

| #   | Item                                                  | Blocks                                                                      |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Razorpay merchant KYC                                 | Online fee payment, auto-receipt, parent "Pay Now"                          |
| 2   | WhatsApp BSP account + template approval              | All live messaging, welcome/absence/receipt sends, template screen          |
| 3   | Domain + VPS                                          | Production deployment                                                       |
| 4   | Logo files (light/dark, high-res) + brand TTF         | Real branding; rupee glyph in PDFs needs an embedded font                   |
| 5   | Real fee structures per programme/unit for AY 2026-27 | Go-live data                                                                |
| 6   | PC-1: confirm reminder schedule with FA               | Reminder defaults (currently T-5/T-0/T+3/T+7)                               |
| 7   | OT1: overtime multiplier                              | First real payroll run                                                      |
| 8   | INV2: reorder-quantity basis                          | Automated reorder alerts                                                    |
| 9   | ACA-LP-1, ACA-CAL-4, ACA-SEED-1/2, ACA-OUT-1          | Todd Care/PlayHouse curriculum, Saturday hours, Big Rocks content, taxonomy |
| 10  | Priyank: PT applicability for hourly evening staff    | Evening payroll statutory                                                   |
| 11  | Central hub admission phone number                    | Hub settings                                                                |

---

## 8. Recommended sequence

Ordered by risk × dependency. Estimates are engineering days.

| Sprint                         | Work                                                                                                                                                                               | Why first                                                                                            | Est.  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----- |
| **S1 — Child-safety gap**      | Daily 05:00 IST scheduler per batch (holiday-aware); teacher-not-submitted alert; student leave applications (model + parent form + admin log) so approved leave suppresses alerts | The absence-escalation chain is the system's core promise and currently depends on a teacher marking | 4–5 d |
| **S2 — Money completeness**    | Nine remaining fee reports (start with the P0 four); No-Dues + Fee Statement + Admission Confirmation documents; confirmation letter PDF on enrol                                  | Day Book and Outstanding are needed from day one of collections                                      | 5–6 d |
| **S3 — Communication**         | Provider adapter for the BSP (mock now, keys later), fallback chain, HO template screen, AD escalation timer, email receipt                                                        | Unblocks live WhatsApp the moment KYC/templates land, without a code change                          | 5–6 d |
| **S4 — DPDP**                  | Consent capture at registration + parent signup, field encryption for PAN/UAN/bank, retention job, export/delete                                                                   | Legal exposure; cleanest before real family data lands                                               | 4–5 d |
| **S5 — Inventory procurement** | PRF → PO → GRN, vendor master, student issue billed to fee, 10 reports                                                                                                             | Needed before Unit 3 opening                                                                         | 6–8 d |
| **S6 — Lifecycle depth**       | Per-tab schemas + validation, parent-visible tab rendering, grade transitions, K2 readiness report                                                                                 | Parent portal is thin without it                                                                     | 6–8 d |
| **S7 — Polish**                | Capacity/staff analytics, validation for remaining `any` bodies, Gujarati for staff pages, PTM views                                                                               | Quality                                                                                              | 4–6 d |
| **S8 — Production**            | Deploy runbook, backups + restore drill, Sentry, monitoring on `/api/health`                                                                                                       | After S1–S4                                                                                          | 3–4 d |

**Not scheduled:** Phase 3 (franchise) and Phase 4 (AI) — both need client direction
before scoping, and modules 24–27 depend on separate products existing first.

---

## 9. How this was verified

- **Routes:** 133 enumerated from decorators and compared to the pre-refactor
  baseline (130 + `/health` + 2 PDF endpoints, zero missing).
- **Models:** 48 models / 11 enums read from `schema.prisma`; presence of entities
  such as `OvertimeAuthorisation`, `StatutoryScheme` confirmed directly.
- **Behaviour:** 54 tests cover the fee, attendance, admission, certificate, scoping,
  validation and payroll rules; PDFs were rendered and text-extracted.
- **Gaps:** each 🟡/🔲 above names the file or the missing entity, so it can be
  checked independently.
