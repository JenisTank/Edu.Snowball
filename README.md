# 🐝 BumbleB Kidz ERP

Custom multi-unit preschool ERP for the BumbleB Kidz chain (Rajkot).
27 modules · 3 layers · 4 phases — per master specification Session 2.1.

## Stack
- **API:** NestJS (Node.js v20) + Prisma + PostgreSQL 16
- **Jobs:** Redis + BullMQ (attendance locks, WhatsApp triggers, fee reminders, payroll)
- **Staff portal:** React (Vite) + Tailwind CSS + TanStack Table/Query
- **Parent portal:** React PWA at `/parent` (installable — manifest + service worker)
- **Packaging:** Docker / docker-compose

## Quick start (development)
```bash
# 1. Start Postgres + Redis (or use local installs)
# 2. API
cd api && cp ../.env.example .env   # edit values
npm install && npx prisma db push && npx prisma db seed
npm run dev                          # → http://localhost:3000/api

# 3. Staff portal
cd ../frontend && npm install && npm run dev   # → http://localhost:5173
```

## Production
```bash
cp .env.example .env   # set strong DB_PASSWORD + JWT_SECRET
docker compose up -d
```

## Demo logins (seed data — password `bumbleb123`)
| Role | Email |
|---|---|
| Founder | founder@bumblebkidz.com |
| Academic Director | ad@bumblebkidz.com |
| Curriculum Lead | falguni@bumblebkidz.com |
| Centre Head U1 | ch.u1@bumblebkidz.com |
| Centre Head U2 | ch.u2@bumblebkidz.com |
| Coordinator U1 | coord.u1@bumblebkidz.com |
| Teacher U1 | teacher.u1@bumblebkidz.com |
| Receptionist (Hub) | reception@bumblebkidz.com |

**Parent portal demo** (open `/parent` on a phone or narrow window):
phone `+91 9100000000` + admission no `BB-U1-2627-0001`.

## Module map (Slices 0–7, live)
| Area | Where |
|---|---|
| CRM (First Buzz) | `/leads` — stages, routing, activities |
| Admissions | `/admissions` — register → discovery → approval → confirm |
| Attendance engine | `/attendance` — default-ABSENT roster, lock +30 min, absence alerts, 3-day escalation |
| Fees & receipts | `/fees` — locked structures, instalments, sibling concession, receipts + print, reminders T-5/T-0/T+3/T+7 |
| Parent portal (PWA) | `/parent` — child dashboard, attendance calendar, fee ledger, receipt download, updates feed |
| Certificates | `/certificates` — 7 HO-locked templates, serial numbers, TC gated on cleared fees + No-Dues |
| Communication | `/comms` — single outbox for WhatsApp messages; sandbox mode until `WA_BSP_KEY` is set in `.env` |

## Key system rules (enforced from Slice 0)
- Every operational table carries `unit_id`; API auto-scopes to user's unit.
  HO roles (Founder, AD, Curriculum Lead, Receptionist) see cross-unit.
- Attendance **default = ABSENT** (child safety); lock = class start + 30 min, dynamic.
- One login per person — shared accounts are a DPDP violation.
- Brand: Nunito + DM Sans, golden brown #C8922A, sky blue #4BAED0, pastels only.
- BumbleB rating scale (Brilliant/Buzzing/Blooming/Growing/Budding) — never numeric grades.

## Docs
- `docs/` — code plan, specification, SOPs
- Slice progress: see `BumbleB_ERP_Code_Plan.md` (workspace root)
