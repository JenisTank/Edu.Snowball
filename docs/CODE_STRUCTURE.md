# Code structure

How the repository is organised and where new code belongs. Written for whoever
picks this up next (the code plan explicitly targets handover to a hired developer).

---

## 1. Repository

| Path                 | What lives there                                                     |
| -------------------- | -------------------------------------------------------------------- |
| `api/`               | NestJS + Prisma backend. Own `package.json`.                         |
| `frontend/`          | Staff portal **and** the parent PWA (one Vite app, route `/parent`). |
| `docs/`              | Specification, code plan, architecture, this file.                   |
| `scripts/`           | `dev-restore.sh` — rebuilds a full dev environment.                  |
| `backups/`           | Dumps written by `scripts/backup.sh`; git-ignored, restored by hand. |
| `docker-compose.yml` | postgres + redis + api + nginx-served frontend.                      |

Root `package.json` holds convenience scripts only (`npm run api`, `npm run web`,
`npm run typecheck`, `npm run format`). It is **not** an npm workspace, so each app
installs independently.

---

## 2. API layout

```
api/src/
├── main.ts                  bootstrap: env validation, CORS, global prefix/filter, worker
├── app.module.ts            imports global infrastructure + every feature module
├── config/env.ts            typed environment access + fail-fast validation
├── common/
│   ├── auth/
│   │   ├── auth.constants.ts   ROLES_KEY, HO_ROLES, ADMIN_ROLES
│   │   ├── roles.decorator.ts  @Roles(...)
│   │   ├── auth.guard.ts       AuthGuard — JWT from header/cookie
│   │   └── unit-scope.ts       unitScope() — the multi-unit rule
│   ├── audit/               AuditService (global) — every mutation logged
│   ├── database/            PrismaService + global PrismaModule (one pool)
│   └── filters/             AllExceptionsFilter — one error shape for the frontend
│   ├── pdf/                 PdfService — browser-free PDFs (pdf-lib)
│   ├── validation/          global ValidationPipe configuration
│   └── filters/             AllExceptionsFilter
├── jobs/queue.ts            BullMQ queue + worker (absence scans, reminders)
└── modules/
    ├── auth/                login / refresh / me
    ├── users/               team directory, password reset
    ├── units/               units, programmes, batches
    ├── students/            student list + detail
    ├── dashboard/           staff landing summary
    ├── crm/                 First Buzz leads + area routing
    ├── admissions/          register → discovery flight → approve → confirm
    ├── attendance/          default-absent roster, lock, escalation
    ├── fees/                structures, collection, receipts, reminders
    ├── parents/             parent portal API (PWA)
    ├── certificates/        templates, serials, print
    ├── comms/               outbox, announcements, dispatch
    ├── lifecycle/          18-tab student profile records
    ├── academic/           yearly goals, big rocks, calendar, log plan
    ├── inventory/          stock ledger
    ├── ptm/                sessions + records
    ├── evening/            evening activity centre (separate ledger)
    ├── hr/                 employees · leave · overtime · attendance import ·
    │                       masters · payroll (one controller per concern)
    ├── analytics/          founder dashboard
    ├── audit/              read-only audit trail
    ├── theme/              default UI theme
    ├── health/             unauthenticated liveness probe
    └── notifications/      web-push service (global)
```

Every feature folder holds `<feature>.controller.ts` and `<feature>.module.ts`.
Controllers stay thin: they scope the request, validate the payload and delegate to
Prisma. Provider-level services live next to the thing they serve
(`common/audit`, `modules/notifications`) — not in a shared `services/` dump.

### Adding a new endpoint

1. Put it in the feature folder that owns the data (create the folder if new).
2. Decorate the controller with `@Controller('<route>')` + `@UseGuards(AuthGuard)`.
3. Use `unitScope(req.user, unitId)` for every list/aggregate query, so unit
   isolation cannot be forgotten.
4. Call `this.audit.log(req, '<table>', id, 'INSERT' | 'UPDATE' | 'DELETE', old, new)`
   for every mutation (system rule 3).
5. Register the controller in that folder's module and the module in `app.module.ts`.
   Do **not** add `PrismaService`, `AuditService` or `PushService` to `providers` —
   they are global.

### Global modules

`PrismaModule`, `AuditModule`, `NotificationsModule` and `AuthModule` are `@Global()`
and imported once in `app.module.ts`. This keeps dependency injection simple and
guarantees a single Prisma connection pool (previously each module created its own
client).

---

## 3. Frontend layout

```
frontend/src/
├── pages/        one file per route (Dashboard, Leads, Fees, HR, Parent…)
├── components/   layout/ (shell), ui/ (DataTable, Modal), brand/ (Logo)
└── lib/          api.ts (single fetch client), auth.tsx, appTheme.ts, utils.ts
```

- All HTTP goes through `lib/api.ts` (token storage, silent refresh, error handling).
  Never call `fetch` directly in a page.
- `/api` is always a **relative** path; Vite proxies it in dev and nginx proxies it
  in production, so there is no CORS configuration to maintain.
- The parent portal is `pages/Parent.tsx` behind `/parent` — same bundle, own
  phone + admission-number login. It is intentionally not a second app
  (see `parent-app/README.md`).

---

## 4. Conventions

- **Formatting**: Prettier, configured at the repo root (`.prettierrc.json`,
  `printWidth: 100`, single quotes). Run `npm run format`.
- **Types**: `npm run typecheck` (API). No `any` for new code, even though the
  existing controllers still use it for request bodies.
- **Naming**: `*.controller.ts`, `*.module.ts`, `*.service.ts`; folders are plural
  feature names; route prefixes match the folder.
- **Errors**: throw Nest HTTP exceptions (`BadRequestException`, …) — the global
  filter converts them into `{ statusCode, message }`.
- **Environment**: never read `process.env` directly outside `config/env.ts`;
  add a getter to `env` instead so the variable is documented and validated.

---

## 5. Rules modules (pure, unit-tested)

Business rules that must never be wrong live in `*.rules.ts` next to their
feature, with no Prisma import, so they can be tested without a database:

| File                                         | Covers                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `modules/fees/fees.rules.ts`                 | sibling concession, plans A/B/C, due dates, payment allocation, reminder stages, serials |
| `modules/attendance/attendance.rules.ts`     | IST timings, lock = start + 30 min, alert +30 min, call task +2 h                        |
| `modules/admissions/admissions.rules.ts`     | joining window → suggested instalment plan                                               |
| `modules/certificates/certificates.rules.ts` | certificate serial sequence                                                              |

Tests run with `npm test` (Jest + ts-jest, no database needed) and cover the rules
above, unit scoping, request validation and the payroll maker-checker guard.

## 6. Database migrations

`api/prisma/migrations/` is the source of truth for the schema.

- Local change: `cd api && npx prisma migrate dev --name <change>`
- Deploy: `npx prisma migrate deploy` (compose runs this after the DB is healthy)
- The baseline (`20261021120000_init`) was generated from `schema.prisma` by
  `prisma/generate-init-migration.py` because the Prisma engine download is blocked
  in some environments. CI applies it to a real Postgres 16 and then runs
  `prisma migrate diff --exit-code` to prove it matches the schema.

## 7. Validation

Every write endpoint that has a DTO is validated by a global `ValidationPipe`
(`whitelist: true`, so undeclared properties are stripped). DTOs live in
`modules/<feature>/dto/`. Handlers still typed `@Body() body: any` are not
validated — convert them by adding a DTO, nothing else changes.

## 8. Internationalisation

`frontend/src/lib/i18n.tsx` holds the `en` / `gu` dictionaries, the
`<I18nProvider>` and the `LanguageSwitch` control. Use `const { t } = useI18n()`
and `t('nav.fees')`; missing keys fall back to English, then to the key itself.
Translated today: the app shell (navigation), login, and the parent portal.
