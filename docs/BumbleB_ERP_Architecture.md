# BumbleB Kidz ERP — Full-Stack Production Architecture

**Version:** Session 2.1 (April 2026)
**Scope:** 27 modules · 3 layers · 4 phases · Multi-unit preschool chain
**Architect:** Parth (ERP Developer)
**Status:** Phase 1 build-ready. Phase 2 spec complete. Phases 3–4 pending.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture Diagram — Layers & Services](#3-architecture-diagram--layers--services)
4. [Repository & Project Structure](#4-repository--project-structure)
5. [Database Schema — Core Entities](#5-database-schema--core-entities)
6. [Module Architecture — All 27 Modules](#6-module-architecture--all-27-modules)
7. [Authentication & Role-Based Access Control](#7-authentication--role-based-access-control)
8. [API Design](#8-api-design)
9. [Third-Party Integrations](#9-third-party-integrations)
10. [Communication Layer](#10-communication-layer)
11. [Background Jobs & Automation Engine](#11-background-jobs--automation-engine)
12. [File Storage & Document Generation](#12-file-storage--document-generation)
13. [Payroll Engine Design](#13-payroll-engine-design)
14. [Parent Portal — Mobile-First Architecture](#14-parent-portal--mobile-first-architecture)
15. [AI & Intelligence Layer (Phase 4)](#15-ai--intelligence-layer-phase-4)
16. [Data Protection & DPDP Compliance](#16-data-protection--dpdp-compliance)
17. [Infrastructure & Deployment](#17-infrastructure--deployment)
18. [Phase Rollout Plan](#18-phase-rollout-plan)
19. [Open Items & Build Blockers](#19-open-items--build-blockers)

---

## 1. System Overview

BumbleB Kidz ERP is a **custom-built, multi-unit school management platform** for the BumbleB Kidz preschool chain (Nestleap Foundation / Nestleap Learning Pvt. Ltd.), serving 3 company-owned units in Rajkot, India with a franchise rollout path.

### Business Context

| Dimension | Detail |
|---|---|
| Operator | Nestleap Foundation (internal) / BumbleB Kidz (brand) |
| Units | 3 company-owned (Unit 1 Saraswati, Unit 2 Flagship Rajkot, Unit 3 Jivraj Park) |
| Programmes | Todd Care (1.5–2.5 yrs), PlayHouse (2.5–3.5), PreK (3.5–4.5), K1 (4.5–5.5), K2 (5.5–6.5) |
| Phase 1 launch | June 2026 (Unit 1 admission drive ready) |
| Replaces | Vercel temp CRM, Saraswati ERP, Butterfly Lab LMS |
| Compliance | DPDP (India Digital Personal Data Protection Act), Gujarat regulations |

### Key People

| Person | Role | ERP Authority |
|---|---|---|
| Helly | Founder / Decision-maker | Full access — all modules, all units |
| Parth | ERP Developer | Builds and maintains BumbleB ERP |
| Priyank | CA / Legal | Franchise T&C, DPDP compliance, financial audit access |
| FA / Falguni | Academic Lead | Curriculum, record book, activity log management |
| Meena | Training & Resources | EduGrowth Matrix integration |

---

## 2. Tech Stack

> Tech stack is **Parth's call** (resolved, open question E1). The recommendations below are based on the system's requirements: multi-unit real-time ops, mobile-first parent portal, PDF generation, WhatsApp automation, and Indian payment gateway integration.

### Recommended Stack

#### Backend

| Layer | Technology | Rationale |
|---|---|---|
| Language | **TypeScript (Node.js)** | Type safety across a complex domain model; large ecosystem for integrations |
| Runtime | **Node.js v20 LTS** | Non-blocking I/O suits real-time attendance, notification triggers |
| Framework | **NestJS** | Modular architecture mirrors the 27-module ERP structure; built-in DI, guards, decorators |
| ORM | **Prisma** | Strong TypeScript types; migration system; readable schema; works with PostgreSQL |
| Database | **PostgreSQL 16** | ACID compliance critical for payroll, fee ledger; JSON support for flexible config fields |
| Cache | **Redis** | Session store, job queues (BullMQ), rate limiting, real-time seat counts |
| Job Queue | **BullMQ** | Scheduled payroll runs, WhatsApp triggers, attendance lock jobs |
| Search | **Postgres full-text search** | Student search, SOP search — no separate engine needed at this scale |

#### Frontend — Staff ERP Portal

| Layer | Technology | Rationale |
|---|---|---|
| Framework | **Next.js 14 (App Router)** | SSR for document generation previews; React Server Components for data-heavy admin tables |
| UI Library | **shadcn/ui + Tailwind CSS** | Rapid build; accessible; fully customisable to BumbleB brand palette |
| State | **Zustand** | Lightweight; suits per-module state isolation |
| Forms | **React Hook Form + Zod** | Complex multi-step admission forms; runtime schema validation matching backend |
| Charts | **Recharts** | Revenue, admission funnel, attendance charts for founder dashboard |
| Fonts | **Nunito (headers) + DM Sans (body)** via Google Fonts | Fixed brand requirement — never substitute |

#### Frontend — Parent Portal (Mobile-First)

| Layer | Technology | Rationale |
|---|---|---|
| Framework | **React Native (Expo)** | Single codebase for iOS + Android; web parity via Expo Web |
| Navigation | **Expo Router** | File-based routing mirrors Next.js patterns |
| Notifications | **Expo Notifications + Firebase FCM** | Push notifications for absence alerts, fee reminders |
| State | **TanStack Query** | Server state sync; offline-first caching for attendance history |

#### Infrastructure

| Component | Technology |
|---|---|
| Hosting | Parth's call (E2 resolved) — recommend **Vercel** (Next.js) + **Railway/Render** (NestJS API) |
| Database hosting | **Supabase** (managed PostgreSQL) or **Neon** (serverless Postgres) |
| File storage | **AWS S3** or **Supabase Storage** — student docs, certificates, gallery |
| Payments | **Razorpay** (primary) + UPI |
| WhatsApp | **WhatsApp Business API** via BSP (BSP vs Meta direct — Parth's call, PC-3 deferred) |
| Email | **Resend** or **SendGrid** (SMTP) — receipts, certificates only |
| SMS | Phase 3 only (PC-6 deferred) |
| CDN | **Cloudflare** — static assets, brand fonts |
| Monitoring | **Sentry** (errors) + **Pino** (structured logs) |
| CI/CD | **GitHub Actions** |

#### Language Reference

For language selection reasoning, see [Ciphereleven.com](https://www.ciphereleven.com/) — encyclopedia of all programming languages with paradigm and ecosystem comparisons.

- **TypeScript** over plain JavaScript: static types prevent runtime errors in complex financial calculations (payroll engine, fee ledger)
- **Node.js** over Python/Django: ecosystem depth for WhatsApp BSP SDKs, Razorpay, PDF generation
- **PostgreSQL** over MySQL: superior JSON support (programme config, SOP metadata), native full-text search, row-level security for DPDP compliance

---

## 3. Architecture Diagram — Layers & Services

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  ┌─────────────────────┐    ┌──────────────────────────────┐   │
│  │  Staff ERP Portal   │    │     Parent Portal            │   │
│  │  (Next.js 14)       │    │  (React Native / Expo)       │   │
│  │  Web + Desktop      │    │  iOS + Android + Web         │   │
│  └──────────┬──────────┘    └──────────────┬───────────────┘   │
└─────────────┼──────────────────────────────┼───────────────────┘
              │ HTTPS / REST + WebSocket      │
┌─────────────┼──────────────────────────────┼───────────────────┐
│                        API GATEWAY                              │
│          ┌──▼──────────────────────────────▼──┐               │
│          │     NestJS API (Port 3000)          │               │
│          │  Auth Guard → Role Guard → Handler  │               │
│          └──────────────┬──────────────────────┘               │
└─────────────────────────┼───────────────────────────────────── ┘
              ┌───────────┼───────────────┐
              │           │               │
┌─────────────▼──┐ ┌──────▼──────┐ ┌────▼────────────────────┐
│  PostgreSQL 16 │ │  Redis      │ │  BullMQ Workers          │
│  (Primary DB)  │ │  Cache +    │ │  - Attendance locker     │
│                │ │  Sessions   │ │  - WhatsApp trigger      │
│  Prisma ORM    │ │             │ │  - Fee reminder cron     │
└────────────────┘ └─────────────┘ │  - Payroll engine        │
                                   │  - PDF generation queue  │
                                   └──────────────────────────┘
              ┌────────────────────────────────────────────────┐
              │              EXTERNAL SERVICES                  │
              │  Razorpay  │  WhatsApp BSP  │  AWS S3          │
              │  Calendly  │  Firebase FCM  │  Resend (email)  │
              └────────────────────────────────────────────────┘
              ┌────────────────────────────────────────────────┐
              │              AI INTEGRATIONS (Phase 4)          │
              │  BuzzPortfolio API  │  BuzzSheet API           │
              │  EduGrowth Matrix   │  Predictive Analytics    │
              └────────────────────────────────────────────────┘
```

### Multi-Unit Data Isolation

Every database table carrying operational data includes a `unit_id` foreign key. API middleware automatically scopes all queries to the authenticated user's unit(s). Founder (Helly) and HO-level roles see cross-unit data via explicit `unit_id: null` or array queries.

---

## 4. Repository & Project Structure

```
bumblebkidz-erp/
├── apps/
│   ├── api/                        # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── admission/      # Modules 1-4
│   │   │   │   ├── student/        # Module 5
│   │   │   │   ├── attendance/     # Module 6
│   │   │   │   ├── fees/           # Module 7
│   │   │   │   ├── hr/             # Module 8
│   │   │   │   ├── academic/       # Module 10 (4 sub-modules)
│   │   │   │   ├── inventory/      # Module 11
│   │   │   │   ├── communication/  # Module 12
│   │   │   │   ├── ptm/            # Module 13
│   │   │   │   ├── certificates/   # Module 14
│   │   │   │   ├── evening-centre/ # Module 15
│   │   │   │   ├── correspondence/ # Module 16
│   │   │   │   ├── analytics/      # Module 17
│   │   │   │   ├── franchise/      # Modules 18-23 (Phase 3)
│   │   │   │   └── ai/             # Modules 24-27 (Phase 4)
│   │   │   ├── auth/               # JWT, roles, guards
│   │   │   ├── common/             # Shared decorators, pipes, interceptors
│   │   │   ├── jobs/               # BullMQ job definitions
│   │   │   ├── notifications/      # WhatsApp, push, email dispatch
│   │   │   ├── pdf/                # PDF generation service
│   │   │   ├── storage/            # S3 file upload/retrieval
│   │   │   └── prisma/             # Prisma service + migrations
│   │   └── prisma/
│   │       ├── schema.prisma       # Master schema
│   │       └── migrations/
│   ├── web/                        # Next.js staff portal
│   │   ├── app/
│   │   │   ├── (auth)/             # Login
│   │   │   ├── (erp)/              # All ERP screens
│   │   │   │   ├── admission/
│   │   │   │   ├── students/
│   │   │   │   ├── attendance/
│   │   │   │   ├── fees/
│   │   │   │   ├── hr/
│   │   │   │   ├── academic/
│   │   │   │   ├── inventory/
│   │   │   │   ├── comms/
│   │   │   │   └── dashboard/
│   │   │   └── api/                # Next.js API routes (thin proxy to NestJS)
│   │   └── components/
│   │       ├── ui/                 # shadcn/ui components
│   │       └── brand/              # BumbleB brand components
│   └── mobile/                     # Expo parent app
│       ├── app/
│       │   ├── (auth)/
│       │   ├── (parent)/
│       │   │   ├── child/          # Child profile, attendance, fees
│       │   │   ├── comms/          # Two-way messaging
│       │   │   └── docs/           # Document vault
│       │   └── notifications/
│       └── components/
├── packages/
│   ├── shared-types/               # TypeScript types shared across apps
│   ├── brand-tokens/               # Design tokens (colours, fonts)
│   └── pdf-templates/              # Handlebars/Puppeteer templates
├── infra/
│   ├── docker-compose.yml          # Local dev (Postgres + Redis)
│   └── .env.example
└── docs/
    ├── ERP_specifications.pdf      # Source of truth
    └── SOPs/
```

---

## 5. Database Schema — Core Entities

### Foundational Tables

```sql
-- Units (3 company-owned; franchise units added in Phase 3)
CREATE TABLE units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,                -- "Unit 1 – Saraswati", "Unit 2 – Rajkot Flagship"
  type        TEXT NOT NULL,                -- 'company_owned' | 'franchise'
  address     TEXT,
  phone       TEXT,                         -- Internal ops number only
  email       TEXT,
  website     TEXT,
  status      TEXT DEFAULT 'active',        -- 'active' | 'development' | 'inactive'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Unit settings (HO-configurable per unit)
CREATE TABLE unit_settings (
  unit_id             UUID PRIMARY KEY REFERENCES units(id),
  petty_cash_float    NUMERIC(10,2) DEFAULT 5000.00,  -- HO edit only
  admission_number    TEXT,                             -- Published central hub number only
  calendly_link       TEXT,
  updated_by          UUID REFERENCES users(id),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Programmes (fixed names/ages — never modify)
CREATE TABLE programmes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,         -- 'TODD_CARE', 'PLAYHOUSE', 'PREK', 'K1', 'K2'
  name        TEXT NOT NULL,               -- "Todd Care", "PlayHouse", etc.
  tier_name   TEXT NOT NULL,               -- "Baby Bees", "Beginner Bees", etc.
  age_min     NUMERIC(4,1),               -- 1.5
  age_max     NUMERIC(4,1),               -- 2.5
  level_colour TEXT NOT NULL              -- "Yellow shades", "Baby Pink", etc.
);

-- Batches (programme × unit × shift)
CREATE TABLE batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id         UUID NOT NULL REFERENCES units(id),
  programme_id    UUID NOT NULL REFERENCES programmes(id),
  name            TEXT NOT NULL,           -- "K1 Morning Gujarati"
  medium          TEXT,                    -- 'gujarati' | 'english'
  shift           TEXT NOT NULL,           -- 'morning' | 'afternoon' | 'evening'
  start_time      TIME NOT NULL,           -- Used for attendance_lock calculation
  end_time        TIME,
  capacity        INT NOT NULL,
  academic_year   TEXT NOT NULL,           -- "2025-26"
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Student & Admission Tables

```sql
-- Core student record
CREATE TABLE students (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id           UUID NOT NULL REFERENCES units(id),
  student_code      TEXT UNIQUE NOT NULL,  -- Auto-generated: BK-U2-2526-0001
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  dob               DATE NOT NULL,
  gender            TEXT,
  blood_group       TEXT,
  allergies         TEXT,
  medical_notes     TEXT,
  special_needs     TEXT,
  programme_id      UUID REFERENCES programmes(id),
  batch_id          UUID REFERENCES batches(id),
  admission_date    DATE,
  status            TEXT DEFAULT 'active', -- 'active' | 'tc_issued' | 'graduated' | 'withdrawn'
  academic_year     TEXT NOT NULL,
  sibling_ids       UUID[],               -- Sibling concession link
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- First Buzz Form — Lead/Inquiry
CREATE TABLE leads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id             UUID REFERENCES units(id),  -- NULL until routed
  stage               TEXT NOT NULL DEFAULT 'new_inquiry',
  -- Stage pipeline: new_inquiry → first_buzz → routing → experience_session
  --                 → discovery_flight → offer → confirmation → enrolled
  parent_name         TEXT NOT NULL,
  parent_phone        TEXT NOT NULL,
  parent_email        TEXT,
  child_name          TEXT,
  child_dob           DATE,
  programme_interest  UUID REFERENCES programmes(id),
  area_locality       TEXT,
  preferred_unit      TEXT,              -- 'U1' | 'U2' | 'U3' | 'no_preference'
  system_suggested_unit UUID REFERENCES units(id),
  assigned_unit       UUID REFERENCES units(id),
  routing_notes       TEXT,              -- Mandatory if override
  inquiry_channel     TEXT,             -- 'call' | 'whatsapp' | 'website' | 'social' | 'event' | 'referral'
  experience_interest BOOLEAN DEFAULT FALSE,
  lead_score          INT DEFAULT 0,
  source_campaign     TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Discovery Flight Screening
CREATE TABLE discovery_flights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID REFERENCES students(id),
  lead_id         UUID REFERENCES leads(id),
  unit_id         UUID NOT NULL REFERENCES units(id),
  conducted_by    UUID REFERENCES users(id),  -- Centre Head
  scheduled_at    TIMESTAMPTZ,
  conducted_at    TIMESTAMPTZ,
  result_code     TEXT,  -- 'EP' | 'GP' | 'SP' | 'NP' | 'ND'
  notes           TEXT,
  internal_only   BOOLEAN DEFAULT TRUE,  -- Never shown to parents
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Attendance Tables

```sql
-- Daily attendance
CREATE TABLE attendance_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES students(id),
  batch_id        UUID NOT NULL REFERENCES batches(id),
  unit_id         UUID NOT NULL REFERENCES batches(unit_id),
  date            DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'absent',  -- DEFAULT ABSENT (child safety)
  marked_by       UUID REFERENCES users(id),
  marked_at       TIMESTAMPTZ,
  is_locked       BOOLEAN DEFAULT FALSE,
  lock_time       TIMESTAMPTZ,  -- class_start_time + 30 minutes (dynamic)
  override_by     UUID REFERENCES users(id),  -- Centre Head only
  override_reason TEXT,
  delivery_note   TEXT,  -- Teacher can add post-mark
  UNIQUE (student_id, date, batch_id)
);

-- Attendance lock jobs (managed by BullMQ)
CREATE TABLE attendance_lock_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    UUID NOT NULL REFERENCES batches(id),
  date        DATE NOT NULL,
  lock_at     TIMESTAMPTZ NOT NULL,  -- Computed: batch.start_time + 30min
  status      TEXT DEFAULT 'pending',  -- 'pending' | 'completed'
  executed_at TIMESTAMPTZ,
  UNIQUE (batch_id, date)
);
```

### Fee Tables

```sql
-- Fee structure master (HO-locked)
CREATE TABLE fee_structures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id         UUID NOT NULL REFERENCES units(id),
  programme_id    UUID NOT NULL REFERENCES programmes(id),
  academic_year   TEXT NOT NULL,
  instalment_plan TEXT NOT NULL,  -- 'annual' | 'two_instalment' | 'quarterly'
  total_fee       NUMERIC(10,2) NOT NULL,
  instalment_1    NUMERIC(10,2),
  instalment_2    NUMERIC(10,2),
  instalment_3    NUMERIC(10,2),
  instalment_4    NUMERIC(10,2),
  joining_window_start INT,  -- Day of month joining window opens
  joining_window_end   INT,
  sibling_discount_pct NUMERIC(5,2),
  created_by      UUID REFERENCES users(id),
  locked          BOOLEAN DEFAULT FALSE,  -- HO locks before AY start
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Fee ledger (one row per transaction)
CREATE TABLE fee_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES students(id),
  unit_id         UUID NOT NULL REFERENCES units(id),
  ledger_type     TEXT NOT NULL,  -- 'preschool' | 'evening'
  amount          NUMERIC(10,2) NOT NULL,
  payment_mode    TEXT NOT NULL,  -- 'cash' | 'upi' | 'razorpay' | 'neft' | 'cheque'
  razorpay_id     TEXT,
  payment_date    DATE NOT NULL,
  instalment_no   INT,
  receipt_no      TEXT UNIQUE NOT NULL,  -- Auto-generated
  receipt_sent_at TIMESTAMPTZ,          -- Auto-WhatsApp PDF
  collected_by    UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### HR Tables

```sql
-- Staff
CREATE TABLE staff (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id           UUID NOT NULL REFERENCES units(id),
  employee_code     TEXT UNIQUE NOT NULL,
  full_name         TEXT NOT NULL,
  role              TEXT NOT NULL,  -- See Role ENUM below
  employment_type   TEXT NOT NULL,  -- 'morning_salaried' | 'evening_hourly'
  base_salary       NUMERIC(10,2),  -- Monthly (salaried only)
  hourly_rate       NUMERIC(8,2),   -- Per hour (evening only)
  joined_date       DATE NOT NULL,
  security_deposit  NUMERIC(10,2) DEFAULT 0,
  nach_mandate      BOOLEAN DEFAULT FALSE,
  nach_account      TEXT,
  phone             TEXT NOT NULL,
  email             TEXT,
  status            TEXT DEFAULT 'active',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Shift master (configurable — not hardcoded)
CREATE TABLE shift_master (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id         UUID NOT NULL REFERENCES units(id),
  shift_name      TEXT NOT NULL,  -- 'morning_k1k2', 'todd_care_morning', 'todd_care_evening'
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  late_grace_min  INT DEFAULT 5,
  is_active       BOOLEAN DEFAULT TRUE,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Overtime authorisation (pre-approval required — OT2 resolved)
CREATE TABLE ot_authorisation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff(id),
  authorised_by   UUID NOT NULL REFERENCES users(id),  -- Next-in-hierarchy
  date            DATE NOT NULL,
  hours_approved  NUMERIC(4,2) NOT NULL,
  reason          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Monthly payroll run
CREATE TABLE payroll_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id         UUID NOT NULL REFERENCES units(id),
  month           INT NOT NULL,
  year            INT NOT NULL,
  run_type        TEXT NOT NULL,  -- 'morning_salaried' | 'evening_hourly'
  status          TEXT DEFAULT 'draft',  -- 'draft' | 'approved' | 'locked'
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (unit_id, month, year, run_type)
);

-- Per-staff payroll line
CREATE TABLE payroll_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id      UUID NOT NULL REFERENCES payroll_runs(id),
  staff_id            UUID NOT NULL REFERENCES staff(id),
  working_days        INT,
  present_days        INT,
  lwp_days            INT DEFAULT 0,
  late_instances      INT DEFAULT 0,
  forgiven_late       INT DEFAULT 0,  -- 2/month threshold
  late_deduction      NUMERIC(10,2) DEFAULT 0,
  gross_pay           NUMERIC(10,2),
  ot_hours            NUMERIC(5,2) DEFAULT 0,
  ot_pay              NUMERIC(10,2) DEFAULT 0,
  other_allowance     NUMERIC(10,2) DEFAULT 0,
  extra_salary        NUMERIC(10,2) DEFAULT 0,
  travel_allowance    NUMERIC(10,2) DEFAULT 0,
  loan_deduction      NUMERIC(10,2) DEFAULT 0,
  security_deduction  NUMERIC(10,2) DEFAULT 0,
  other_deductions    NUMERIC(10,2) DEFAULT 0,
  pt_deduction        NUMERIC(10,2) DEFAULT 0,  -- Auto: gross >₹12,000 → ₹200
  net_payable         NUMERIC(10,2),
  payslip_url         TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### Inventory Tables

```sql
-- SKU master
CREATE TABLE inventory_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code        TEXT UNIQUE NOT NULL,  -- "CLS-001", "STU-UNI-S"
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,  -- 'CRT' | 'CLS' | 'SCR' | 'STU' | 'MKT' | 'ADM' | 'SFT'
  sub_category    TEXT,
  unit_of_measure TEXT NOT NULL DEFAULT 'piece',
  is_saleable     BOOLEAN DEFAULT FALSE,  -- STU category items
  reorder_qty     INT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Per-unit stock
CREATE TABLE unit_inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id         UUID NOT NULL REFERENCES units(id),
  item_id         UUID NOT NULL REFERENCES inventory_items(id),
  current_stock   INT NOT NULL DEFAULT 0,
  last_updated    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (unit_id, item_id)
);

-- Purchase Requisition → PO → GRN flow
CREATE TABLE purchase_requisitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     UUID NOT NULL REFERENCES units(id),
  raised_by   UUID NOT NULL REFERENCES users(id),
  items       JSONB NOT NULL,  -- [{item_id, qty, estimated_cost}]
  status      TEXT DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected' | 'po_raised'
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. Module Architecture — All 27 Modules

### Layer 1 — Unit Operations (Modules 1–17)

| # | Module | Phase | Key Entities | Key Logic |
|---|---|---|---|---|
| 1 | Centralised Admission Hub | 1 | `leads`, `units` | Routing engine: area → unit; 1 receptionist; central WhatsApp number only |
| 2 | Lead & Inquiry Management (First Buzz CRM) | 1 | `leads`, `lead_activities` | 9-stage pipeline; lead scoring; WhatsApp + Calendly auto-trigger; replaces Vercel CRM |
| 3 | Admission & Enrolment Management | 1 | `students`, `batches` | Registration → Discovery Flight → Confirmation → Add to Class; sibling concession; seat tracker |
| 4 | Discovery Flight Screening | 1 | `discovery_flights` | Grade-wise templates; EP/GP/SP/NP/ND coding; Centre Head approval; internal-only |
| 5 | Student Lifecycle Management | 2 | `students` (18-tab profile) | Grade transitions; TC / Graduation Certificate; School Readiness Report |
| 6 | Student Attendance | 1 | `attendance_records`, `attendance_lock_jobs` | Default absent; lock = class_start_time + 30 min (dynamic); auto-WhatsApp on absence |
| 7 | Fee Collection & Management | 1 | `fee_structures`, `fee_transactions` | 3 instalment plans; joining-window logic; Razorpay/UPI online; receipt → WhatsApp PDF; 14 report types |
| 8 | HR & Staff Management | 2 | `staff`, `shift_master`, `payroll_runs` | Morning salaried + evening hourly engines; leave; OT (pre-approval required); security deposit; guest log |
| 9 | *(Absorbed into Module 10)* | — | — | Timetable content moved to Academic Module |
| 10 | Academic Module (4 sub-modules) | 2 | `yearly_goals`, `big_rocks`, `log_plan_unit_overlay`, `log_plan_activity` | Yearly Goals → Big Rocks → Calendar → Log Plan → Daily Plan (derived view); hierarchical outcome taxonomy |
| 11 | Inventory Management | 2 | `inventory_items`, `unit_inventory`, `purchase_requisitions` | 8 categories; SKU coding; ₹5,000 petty cash float (CH-held, HO-configurable); PRF → PO → GRN |
| 12 | Parent Communication | 2 | `communication_threads`, `messages` | App-first (post-familiarisation); WhatsApp-only (pre); email for receipts/certs; CH-owned reply; 38 MCQs spec'd in companion file |
| 13 | PTM Management | 2 | `ptm_sessions`, `ptm_attendance` | Scheduling; parent attendance; physical form upload; teacher notes; student-wise + class-wise view |
| 14 | Student Certificates & Documents | 2 | `certificates`, `document_templates` | 7 certificate types; I-card batch generation; auto-populated from student data; HO-locked templates |
| 15 | Evening Activity Centre | 2 | `evening_registrations`, `evening_attendance` | External student registration; session attendance; monthly fee; Todd Care evening (pending confirmation) |
| 16 | Inward Outward Register | 3 | `correspondence_log` | All official correspondence logged; audit trail for franchise compliance |
| 17 | Analytics & Founder Dashboard | 3 | (aggregated views) | Real-time cards; unit-wise + consolidated; admission funnel; revenue; capacity; staff summary |

### Layer 2 — Franchisor Control (Modules 18–23) — Phase 3

| # | Module | Key Logic |
|---|---|---|
| 18 | Franchise Management | Onboarding; agreement tracking; territory; compliance status; centre performance dashboard |
| 19 | Central Academic Governance | Curriculum master; Discovery Flight template master; academic audit; version control |
| 20 | Training & SOP Compliance | SOP library; staff certification tracking; non-compliance alerts; compliance scoring |
| 21 | Central Inventory & Supply Chain | SKU master (HO only); opening stock per new unit; PO management; kit register; asset register |
| 22 | Royalty & Financial Oversight | Fee structure master (HO-locked); unit-wise collection; royalty calculation; benchmarking |
| 23 | Marketing & Lead Intelligence | Campaign tagging; lead source analysis; cost per admission; conversion benchmarking |

### Layer 3 — AI & Intelligence (Modules 24–27) — Phase 4

| # | Module | Integration Model |
|---|---|---|
| 24 | BuzzPortfolio Integration | Worksheet evaluation API; Dual Signal Processor; progress reports; School Readiness Report at K2. **BuzzPortfolio is a separate product — this is the integration layer.** |
| 25 | BuzzSheet (Worksheet Generator) | Prompt-based AI generation; grade-locked templates; CH approval; regional layer. **BuzzSheet is a separate product — this is the integration layer.** |
| 26 | EduGrowth Matrix Integration | 49-module staff development tracking; teacher growth reports. **EduGrowth Matrix is standalone SaaS — this is the integration layer.** |
| 27 | Predictive Analytics & Forecasting | Admission forecasting; revenue projection; fee default risk; attrition risk; compliance alerts |

---

## 7. Authentication & Role-Based Access Control

### 6 System Roles

```typescript
enum UserRole {
  FOUNDER         = 'FOUNDER',          // Helly — all modules, all units
  ACADEMIC_DIR    = 'ACADEMIC_DIR',     // HO — AD level; author academic content
  CURRICULUM_LEAD = 'CURRICULUM_LEAD',  // HO / FA — propose academic content
  CENTRE_HEAD     = 'CENTRE_HEAD',      // Per unit — approvals, ops authority
  COORDINATOR     = 'COORDINATOR',      // Per unit — draft, operations
  TEACHER         = 'TEACHER',          // Per unit — own class only
}
```

**Rule: Every person has their own login. Shared accounts = DPDP violation.**

### Permission Matrix (Academic Module example)

| Role | Yearly Goals | Big Rocks | Calendar | Log Plan Master | Unit Overlay | Daily Done-Marking |
|---|---|---|---|---|---|---|
| Academic Director (HO) | ✅ author | ✅ author | view | ✅ author | view all | view |
| Curriculum Lead (HO, FA) | propose | propose | view | propose | view all | view |
| Centre Head (Unit) | view | timeline tweak + approve | ✅ approve | view | ✅ approve/ack | view |
| Coordinator (Unit) | view | edit-draft | ✅ draft | view | propose on teacher's behalf | view |
| Teacher | view | view (own grade) | view (own grade) | view | propose date shifts + add details | ✅ mark done |

### JWT Strategy

```typescript
// NestJS guard example
@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const { user } = context.switchToHttp().getRequest();
    // Unit scoping: user.unitId must match resource's unitId
    // FOUNDER and ACADEMIC_DIR bypass unit restriction
    return requiredRoles.some(role => user.role === role);
  }
}
```

- **Access tokens:** 15-minute expiry (short, sensitive data)
- **Refresh tokens:** 7-day expiry, stored in HttpOnly cookie
- **Session store:** Redis (unit_id + role embedded in token payload)

---

## 8. API Design

### REST Conventions

```
Base URL: https://api.bumblebkidz.com/v1

GET    /students                    # List students (unit-scoped)
GET    /students/:id                # Student profile (18-tab model)
POST   /students                    # Create (admission confirmed)
PATCH  /students/:id                # Update profile

GET    /attendance/:batchId/:date   # Daily register
PATCH  /attendance/:recordId        # Mark present/absent
POST   /attendance/:batchId/lock    # Centre Head override

GET    /fees/ledger/:studentId      # Full fee history
POST   /fees/collect                # Record payment
POST   /fees/razorpay/webhook       # Razorpay payment confirmation

GET    /hr/payroll/:unitId/:month/:year   # Payroll run
POST   /hr/payroll/run              # Trigger payroll calculation
PATCH  /hr/payroll/:id/approve      # Centre Head approve + lock

GET    /inventory/:unitId           # Current stock
POST   /inventory/prf               # Purchase Requisition
```

### WebSocket Events (Real-time)

```typescript
// Attendance real-time updates (teacher tablet)
socket.emit('attendance:mark', { studentId, status: 'present', batchId, date });
socket.on('attendance:locked', { batchId, date, lockedAt });

// Founder dashboard live data
socket.on('dashboard:update', { unitId, metric, value });
```

### Response Format

```typescript
interface APIResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    total: number;
    page: number;
    pageSize: number;
  };
  error?: {
    code: string;
    message: string;
    field?: string;
  };
}
```

---

## 9. Third-Party Integrations

### Razorpay / UPI

```typescript
// Fee collection flow
// 1. Create Razorpay order
const order = await razorpay.orders.create({
  amount: instalmentAmount * 100, // paise
  currency: 'INR',
  receipt: `RCPT-${studentCode}-${Date.now()}`,
});

// 2. Parent pays on portal
// 3. Webhook confirms payment
// 4. Auto-generate receipt → WhatsApp PDF to parent
// 5. Manual collect-and-record remains as fallback
```

- Receipt auto-issued on Razorpay success
- Manual cash collection uses collect-and-record UI

### WhatsApp Business API

```typescript
// Template-based messages (admin adds templates via ERP UI)
// Template Management screen — HO admin owns master list

interface WhatsAppTrigger {
  event: 'absence_notification' | 'fee_reminder' | 'fee_receipt' |
         'admission_confirmation' | 'discovery_flight_invite';
  studentId: string;
  parentPhone: string;
  templateCode: string;
  params: Record<string, string>;
  fallback: 'push_notification' | 'email';
}

// Absence notification trigger (auto, post-lock)
// Fee reminders: T-5 / T-0 / T+3 / T+7 schedule (PC-1 pending Helly/FA review)
// All comms logged in communication_threads table
```

### Calendly

- Unit 2 (Flagship): `calendly.com/bumblebkidz/new-meeting`
- Unit 3: Own link
- Central Hub (Admissions): None (handled by receptionist directly)

### Firebase Cloud Messaging (Parent App)

```typescript
// Push notification for parent app (primary post-familiarisation channel)
await admin.messaging().send({
  token: parent.fcmToken,
  notification: {
    title: `${child.name} - Attendance Alert`,
    body: 'Attendance not marked today. Please check.'
  },
  data: { type: 'attendance', studentId: student.id }
});
```

---

## 10. Communication Layer

### Module 12 — Communication Priority Chain

```
Pre-familiarisation:  WhatsApp only
Post-familiarisation: App (primary) → WhatsApp (fallback) → Email (receipts/certs only)
SMS:                  Phase 3 only (tertiary fallback — deferred, PC-6)
```

### Message Ownership Rules

- **Inbound parent messages** → CH receives + owns reply (CH-Reply model)
- **Escalation:** CH can flag to Academic Director; AD responds within ERP
- **All comms logged:** `communication_threads` table — full thread model per student per parent

### Absence Notification Flow

```
attendance_lock_job fires
  → Check remaining students as 'absent'
  → For each absent student:
      → Trigger WhatsApp template (absence_notification)
      → If WhatsApp fails: push notification via FCM
      → Log in communication_threads
  → CH notified of absent list
  → If absent 3+ consecutive days: escalation alert to CH + Founder
```

---

## 11. Background Jobs & Automation Engine

All jobs managed by **BullMQ** (Redis-backed).

```typescript
// Job queue definitions
const queues = {
  ATTENDANCE_LOCK:  new Queue('attendance-lock'),   // Scheduled daily per batch
  FEE_REMINDERS:   new Queue('fee-reminders'),      // T-5 / T-0 / T+3 / T+7 (cron)
  PAYROLL_CALC:    new Queue('payroll-calc'),        // On-demand, month-end
  WHATSAPP_SEND:   new Queue('whatsapp-send'),       // Rate-limited dispatch
  PDF_GENERATE:    new Queue('pdf-generate'),        // Receipts, certificates, payslips
  LEAD_SCORING:    new Queue('lead-scoring'),        // On lead update
};

// Attendance lock job — created fresh each school day
async function scheduleAttendanceLock(batch: Batch, date: Date) {
  const lockAt = new Date(date);
  lockAt.setHours(batch.startTime.hours + 0, batch.startTime.minutes + 30);
  // class_start_time + 30 minutes — no hardcoded values

  await attendanceLockQueue.add('lock', { batchId: batch.id, date }, {
    delay: lockAt.getTime() - Date.now(),
    removeOnComplete: true,
  });
}
```

### Daily Scheduler (cron, 5:00 AM IST)

```typescript
// Creates attendance lock jobs for all active batches for the day
// Skips holidays (from academic calendar)
// Creates fee reminder checks
// Triggers lead scoring refresh
```

---

## 12. File Storage & Document Generation

### Storage Structure (S3 / Supabase Storage)

```
bumblebkidz-files/
├── students/{unitId}/{studentId}/
│   ├── admission-form.pdf
│   ├── birth-cert.pdf
│   ├── photo.jpg
│   ├── medical-cert.pdf
│   └── screening-sheet.pdf
├── certificates/{unitId}/
│   ├── bonafide/{studentId}/
│   ├── tc/{studentId}/
│   └── graduation/{studentId}/
├── gallery/{unitId}/{yearMonth}/  # Photo/Video gallery — CH approval required
├── payslips/{unitId}/{year}/{month}/
└── templates/                     # HO-locked document templates
    ├── BumbleB_Bonafide_v1.html
    ├── BumbleB_TC_v1.html
    └── BumbleB_Receipt_v1.html
```

### PDF Generation Service

```typescript
// Puppeteer-based PDF generation
// Branded templates using BumbleB brand spec:
// - Font: Nunito (headers, 600-900 weight) + DM Sans (body, 300-700 weight)
// - Palette: Black/White primary, #C8922A golden brown accent, #4BAED0 sky blue
// - A4 page format
// - Logo: BumbleB Kidz (trademarked, as-is, white bg variant)
// - Plain mailto: links — never encoded
// - Full-page content — no free space at bottom
// - @media print CSS included

async function generateReceipt(transaction: FeeTransaction): Promise<Buffer> {
  const html = await renderTemplate('receipt', {
    student: transaction.student,
    amount: transaction.amount,
    receiptNo: transaction.receiptNo,
    // ...
  });
  return await puppeteer.generatePDF(html, { format: 'A4' });
}
```

### BumbleB Assessment Rating Scale

Documents and reports use the BumbleB rating scale — **never numeric grades**:

| Rating | Symbol | Replaces |
|---|---|---|
| Brilliant | ☀️ | Numeric grade |
| Buzzing | 🐝 | Numeric grade |
| Blooming | 🌸 | Numeric grade |
| Growing | 🌱 | Numeric grade |
| Budding | 🌀 | Numeric grade |

*Rationale: Prevents parent score comparisons. Child's growth is celebrated individually.*

---

## 13. Payroll Engine Design

### Morning Salaried Engine (10-Step Automated Run)

```typescript
async function runMorningPayroll(unitId: string, month: number, year: number) {
  // Step 1: Pull attendance + punch records for the month
  const attendance = await getMonthAttendance(unitId, month, year);

  // Step 2: Apply shift rules → calculate late minutes per staff
  // Step 3: Apply forgiveness (2/month) → penalise from 3rd instance @ 0.35% salary
  // Step 4: Deduction = Late min × (Salary ÷ 31 ÷ shift_minutes)
  // Step 5: Pull approved leave → identify LWP days
  // Step 6: Pull monthly variable adjustments (allowances, deductions)
  // Step 7: Auto-apply PT: gross > ₹12,000 → deduct ₹200
  // Step 8: Net Payable = Base – LWP – Deductions + Allowances
  // Step 9: Generate payslip per staff member → store as PDF
  // Step 10: Centre Head approves → payroll locked for editing

  // OT: counted only if matching ot_authorisation row exists
  // No threshold-based auto-OT — explicit pre-approval required
}
```

### Late Bracket Rules

| Late Duration | Penalty |
|---|---|
| 1–30 minutes | 0.35% of monthly salary per instance (from 3rd occurrence) |
| 31–60 minutes | 1 hour deduction |
| 61–120 minutes | 2 hour deduction |
| 120+ minutes | 4 hour deduction |
| Forgiveness | 2 instances/month — 3rd onwards penalised |

### Evening Hourly Engine

```typescript
// Completely separate from morning engine
// Earnings = (Minutes worked ÷ 60) × hourly_rate
// Deduction for short attendance = short_minutes × (hourly_rate ÷ 60)
// No security deposit. No NACH. Monthly sum of all session earnings disbursed.
// PT applicability if earnings cross ₹12,000/month (pending Priyank confirmation)
```

---

## 14. Parent Portal — Mobile-First Architecture

### Access Model

```
B1 (resolved): Web login + Mobile app (both available)
Mobile app = primary channel post-familiarisation
Web = parity feature set
```

### Parent App Screens

```typescript
// Core navigation
tabs: [
  'home',        // Today: attendance, messages, fee due
  'child',       // 18-tab student profile (parent-visible tabs only)
  'fees',        // Fee history, online payment
  'comms',       // Two-way message thread with CH
  'docs',        // Document vault (non-sensitive docs only)
]

// Parent-visible student tabs:
// Basic info, Parent info, Parent Feedback & Queries,
// Vaccination, Height & Weight, Docs Vault, Fees Details,
// Attendance (month-wise %), Parent Communication, Leave Application
// (Health, Infirmary, Anecdotal Remarks, IEP = staff-only)
```

### Razorpay Payment Flow (Parent App)

```
1. Parent taps "Pay Now" on fee outstanding
2. App calls POST /fees/razorpay/create-order
3. Razorpay checkout opens in-app
4. On success → webhook fires → receipt auto-generated
5. Receipt PDF sent via WhatsApp + available in-app
6. Ledger updates in real-time
```

---

## 15. AI & Intelligence Layer (Phase 4)

### Integration Architecture

All three AI products integrate via API — they are **separate products**, not ERP modules:

```typescript
// Module 24: BuzzPortfolio Integration
POST /external/buzzportfolio/evaluate    # Submit worksheet for AI evaluation
GET  /external/buzzportfolio/report/:id  # Fetch progress report

// Module 25: BuzzSheet (Worksheet Generator)
POST /external/buzzsheet/generate        # Generate worksheet from prompt
     // params: grade, topic, language, difficulty

// Module 26: EduGrowth Matrix
GET  /external/edugrowth/staff/:staffId  # Staff development data (49 modules)
POST /external/edugrowth/log             # Log training completion
```

### Module 27: Predictive Analytics

```typescript
// ML features (Phase 4)
interface PredictiveSignals {
  admissionForecast: {
    nextMonth: number;
    confidence: number;
  };
  feeDefaultRisk: {
    studentId: string;
    riskScore: number;  // 0-1
    signals: string[];  // 'late_last_2_months', 'partial_payment'
  }[];
  attritionRisk: {
    studentId: string;
    riskScore: number;
    signals: string[];  // 'low_attendance', 'no_ptm_attendance'
  }[];
}
```

---

## 16. Data Protection & DPDP Compliance

DPDP runs **across all modules** — not a standalone module.

### Key Compliance Requirements

| Requirement | Implementation |
|---|---|
| **No shared accounts** | 6-role matrix enforced from Day 1; every person has own login |
| **Child data encryption** | PII fields encrypted at rest (medical, health, Aadhaar if stored) |
| **Consent tracking** | `consent_log` table — admission form consent, photo/video consent |
| **Audit logs** | All data mutations logged: who changed what, when |
| **Role-based visibility** | Health/Infirmary/IEP/Anecdotal Remarks = staff-only; never parent-visible |
| **Data retention** | Configurable per data type; auto-archive after AY + 3 years |
| **Right to access** | Parent portal provides self-service access to own child's non-sensitive data |
| **No Nestleap entities on public materials** | BumbleB Kidz brand only — never expose legal entity names |

```typescript
// Row-level security (PostgreSQL)
-- Students visible to their unit's staff only
CREATE POLICY student_unit_isolation ON students
  USING (unit_id = current_setting('app.current_unit_id')::uuid
         OR current_setting('app.user_role') IN ('FOUNDER', 'ACADEMIC_DIR'));

// Audit log table
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL,
  record_id   UUID NOT NULL,
  action      TEXT NOT NULL,  -- 'INSERT' | 'UPDATE' | 'DELETE'
  old_data    JSONB,
  new_data    JSONB,
  changed_by  UUID NOT NULL REFERENCES users(id),
  changed_at  TIMESTAMPTZ DEFAULT NOW(),
  ip_address  INET
);
```

---

## 17. Infrastructure & Deployment

### Environment Architecture

```
Production:
  API:        Railway / Render (NestJS — always-on)
  Web:        Vercel (Next.js — edge-optimised)
  Mobile:     Expo EAS Build → App Store + Play Store
  Database:   Supabase (managed PostgreSQL)
  Redis:      Upstash (serverless Redis — BullMQ compatible)
  Storage:    Supabase Storage (or AWS S3)
  CDN:        Cloudflare

Staging:
  Full mirror of production
  Seeded with anonymised test data

Development:
  docker-compose (Postgres + Redis local)
  .env.local for credentials
```

### CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  test:
    - run: pnpm test
    - run: pnpm prisma validate

  deploy-api:
    needs: test
    - run: railway up

  deploy-web:
    needs: test
    # Vercel auto-deploys on push to main

  deploy-mobile:
    needs: test
    - run: eas build --platform all --auto-submit
```

### Monitoring & Alerting

- **Sentry:** Error tracking — web, API, mobile
- **Pino:** Structured JSON logging in NestJS
- **Uptime:** Betterstack or UptimeRobot (per Parth's choice)
- **DB metrics:** Supabase dashboard
- **Alerts:** Critical errors → WhatsApp Business API (irony intended)

---

## 18. Phase Rollout Plan

| Phase | Modules | Focus | Target |
|---|---|---|---|
| **Phase 1** | 1, 2, 3, 4, 6, 7 (core) | Admission drive ready before launch | **June 2026 — Unit 1** |
| **Phase 2** | 5, 8, 10, 11, 12, 13, 14, 15, 24, 25 | Full operational capability | Post-launch AY 2025-26 |
| **Phase 3** | 16, 17, 18, 19, 20, 21, 22, 23 | Franchisor control + governance | Unit 3 launch onwards |
| **Phase 4** | 26, 27 | AI, forecasting, scale intelligence | TBD |

### Phase 1 — Build Checklist (Pre-June 2026)

- [ ] Auth system + 6-role RBAC
- [ ] Unit setup + unit_settings (petty cash, contact details)
- [ ] Programme + Batch master data seeded
- [ ] Lead management (First Buzz form — Version A & B)
- [ ] Routing engine
- [ ] Discovery Flight Screening (EP/GP/SP/NP/ND)
- [ ] Student admission + enrolment to batch
- [ ] Attendance (default absent, dynamic lock, WhatsApp trigger)
- [ ] Fee collection (3 instalment plans, Razorpay, receipt PDF → WhatsApp)
- [ ] WhatsApp Business API connected (template management screen)
- [ ] Parent portal — web login + mobile app (auth, child card, attendance, fees)
- [ ] BumbleB branded document templates (Bonafide, TC, Receipt, I-Card)
- [ ] SOP library seeded with 7 P0 SOPs

---

## 19. Open Items & Build Blockers

### 🔴 Blockers for Phase 1

| Code | Item | Owner |
|---|---|---|
| OT1 | Overtime rate multiplier (1x / 1.25x / 1.5x) | Helly — confirm before first payroll run |
| INV2 | Reorder quantities per CLS sub-category | Lock when Unit 1 class strength confirmed |
| PC-1 | Fee reminder schedule (T-5/T-0/T+3/T+7) | Helly + FA review |
| NOTE | Unit 1 and Unit 3 contact numbers, emails, Calendly links | Set up and share with Parth before ERP launch |
| NOTE | Central hub admission phone number | Procure and share with Parth |
| NOTE | STU/UNI opening stock sizing ratio for Rajkot | Determine before opening stock procurement |

### 🟡 Blockers for Phase 2

| Code | Item | Owner |
|---|---|---|
| ACA-LP-1 | Todd Care + PlayHouse curriculum bank structure | FA's input + Unit 0 reference needed |
| ACA-SEED-1 | PreK Big Rocks source: 2024-25 data; needs 2025-26 update | FA team |
| ACA-SEED-2 | K1 Big Rocks: Dec–April content missing from source PDF | FA team before AY rollout |
| ACA-CAL-4 | Saturday teacher working-hours policy | Lock in HR Manual Section 2 |
| ACA-OUT-1 | Outcome taxonomy alignment (Academic Module ↔ EduGrowth Matrix) | When EduGrowth tech brief taken up |
| PC-3 | WhatsApp BSP vs Meta direct decision | Parth |
| NOTE | Todd Care evening shift (5:30–7:00 PM) confirmation | Helly |
| NOTE | PT applicability on hourly evening staff if earnings > ₹12,000 | Priyank |

### 🔵 Deferred to Phase 3+

| Code | Item |
|---|---|
| PC-6 | SMS as tertiary fallback (post-WhatsApp 24h failure) |
| PC-7 | Cost reconciliation automation (BSP/Meta API integration) |
| A3 | ERP success metrics at end of Year 1 (revisit closer to launch) |

---

*Document prepared from BumbleB Kidz ERP Complete Specification v2.1 (April 2026). Tech stack recommendations informed by [Ciphereleven.com](https://www.ciphereleven.com/) language/paradigm encyclopedia. All module specs, business rules, and open questions are sourced directly from the master specification document.*

*Last updated: June 2026*
