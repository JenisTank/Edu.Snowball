# Deploying on the shared VPS

Written against the live host survey of 23 Oct 2026. This is the box-specific
companion to [`RUNBOOK.md`](./RUNBOOK.md) §2 — read that for backups, rollback
and incident steps; read this for how BumbleB shares a machine with an existing
project.

## What is already on the box

| Thing              | Fact                                                                        |
| ------------------ | --------------------------------------------------------------------------- |
| OS / capacity      | Ubuntu 24.04, 4 vCPU, 7.8 GB RAM, 161 GB free                               |
| Docker / Compose   | 29.8.2 / v5.6.0 (`!override` supported)                                     |
| Reverse proxy      | **Caddy 2.11 on the host** (systemd), owns `:80` + `:443`                   |
| Existing project   | compose project `casnowball` — `/opt/casnowball/docker-compose.prod.yml`    |
| Its web container  | `casnowball-web-1` published on **`127.0.0.1:8080`** → its nginx            |
| Its API / DB / OCR | internal only (`3000`, `5432`, `8091` — none published)                     |
| Evolution API      | separate project `casnowball-whatsapp`, `evolution_api` on `127.0.0.1:8081` |
| Certificates       | issued and renewed by Caddy — **certbot is not used here**                  |

**The house pattern** is therefore: containers publish a loopback port only,
and host Caddy terminates TLS in front of it. BumbleB slots in the same way.

```
internet :443 → Caddy (host) ─┬→ 127.0.0.1:8080  casnowball-web    (existing)
                              └→ 127.0.0.1:8082  bumbleb-frontend (this app)
     bumbleb-frontend:80 ──/api──→ bumbleb-api:3000 ──→ bumbleb-db / bumbleb-redis
```

Nothing is shared with the existing project: separate compose project name,
network, volumes, database and Redis. `8082` is free (`8080` web, `8081`
Evolution).

## 1. Clone

```bash
sudo mkdir -p /srv/bumbleb-erp && sudo chown "$USER" /srv/bumbleb-erp
git clone -b arena/988a5eb9-edu-snowball <repo-url> /srv/bumbleb-erp
cd /srv/bumbleb-erp
```

## 2. Secrets

```bash
cp .env.example .env && chmod 600 .env
openssl rand -base64 48   # → JWT_SECRET
openssl rand -hex 32      # → PII_KEY  (32+ chars; see the warning below)
```

Edit `.env`:

| Variable      | Value                                                       |
| ------------- | ----------------------------------------------------------- |
| `DB_PASSWORD` | long random string                                          |
| `JWT_SECRET`  | output 1 (32+ chars)                                        |
| `PII_KEY`     | output 2 — **do not skip**, see below                       |
| `VAPID_*`     | `npx web-push generate-vapid-keys` (needed for parent push) |
| `EVOLUTION_*` | only once the centre's instance is linked (see §6)          |
| `UPI_VPA`     | leave blank; units set their own VPA in Settings → Units    |

> **`PII_KEY` is not optional in production.** `api/src/config/env.ts` only logs
> a warning when it is missing, so the API starts happily and stores statutory
> identifiers (PAN/UAN/bank details) **in plaintext**. The base compose file did
> not pass it through until this branch; it does now. With the key set, PII is
> encrypted on write — if you ever run without it and later add it, existing rows
> stay plaintext and need a backfill.

## 3. Build and start

> **Shortcut.** `bash deploy/deploy.sh` does §2 checks, §3–§5 and verification in
> one go, and is idempotent. `--seed` adds demo data, `--caddy` installs the site
> block, `--dry-run` only runs preflight. The manual steps below are what it
> executes — useful when something fails and you need to see each step.

```bash
docker compose -p bumbleb \
  -f docker-compose.yml \
  -f deploy/docker-compose.vps.yml \
  up -d --build
```

`-p bumbleb` is what keeps this project's networks and volumes away from
`casnowball`. The override drops the API's published port and publishes only
`127.0.0.1:8082`.

## 4. Migrate (first run, and after every deploy that changes the schema)

```bash
docker compose -p bumbleb -f docker-compose.yml -f deploy/docker-compose.vps.yml \
  exec api npx prisma migrate deploy
```

## 5. Demo data — UAT only

The seed creates demo logins with password `bumbleb123`, three sample units and
42 sample students. Useful for a client walkthrough, unacceptable at go-live.

```bash
# only if you want the demo walkthrough:
docker compose -p bumbleb ... exec api node dist/prisma/seed.js
```

Before real data goes in, recreate the database (`down -v`, then re-run §3–§4)
rather than trying to delete the demo rows one by one.

## 6. Caddy site block

The subdomain's **A record must point at this VPS before** reloading Caddy,
otherwise ACME fails and Caddy retries in the background.

Hostname: **`edu.snowballconcepts.com`** (A record → this VPS).

```bash
dig +short edu.snowballconcepts.com      # must print this VPS's public IP first
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%F-%H%M)
sudo tee -a /etc/caddy/Caddyfile < deploy/Caddyfile.erp.conf
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -fsS https://edu.snowballconcepts.com/api/health
```

### Why the same IP and port can serve two projects

Caddy listens once on `:80`/`:443` and picks the site block by **hostname** —
the TLS SNI for HTTPS, the `Host` header for HTTP. So the machine needs no extra
IP address and no extra public port:

```
snowballconcepts.com       ─(SNI/Host)→ 127.0.0.1:8080  casnowball-web
edu.snowballconcepts.com   ─(SNI/Host)→ 127.0.0.1:8082  bumbleb-frontend
```

Each hostname also gets its **own** certificate, issued automatically. The two
apps never compete for a host port because only Caddy binds `:80`/`:443`; the
containers expose loopback-only ports (`8080`, `8082`) that nothing else owns.
Inside each compose project, the API, database and Redis are on private
networks with unpublished ports, so Postgres/Redis collide nowhere either.

`systemctl reload` (not `restart`) keeps the existing site serving during the
swap. If anything looks wrong: `sudo cp /etc/caddy/Caddyfile.bak.* /etc/caddy/Caddyfile && sudo systemctl reload caddy`.

## 7. Verify

```bash
curl -fsS http://127.0.0.1:8082/api/health          # {"status":"ok",...}
curl -fsS https://edu.snowballconcepts.com/api/health/ready   # 503 only if db/redis down
docker compose -p bumbleb ps                        # 4 services, all healthy
```

Then log in through the browser and check: a receipt PDF opens in a new tab
(it needs the `bb_token` cookie, which requires HTTPS), Settings → Units shows
the PT switch and phone/UPI fields, Front desk loads as a Head Office account
(the no-`unitId` regression), and Inventory → reorder alerts is non-empty.

## 8. Backups — do not use `scripts/backup.sh` as-is

`scripts/backup.sh` runs a host `pg_dump` against `DATABASE_URL`, but this
project's `db` publishes no port, so the host cannot reach it. Dump through the
container instead:

```bash
sudo mkdir -p /srv/backups
30 2 * * * cd /srv/bumbleb-erp && docker compose -p bumbleb exec -T db \
  pg_dump -U bumbleb --no-owner --no-privileges bumblebkidz_erp \
  | gzip -9 > /srv/backups/bumbleb_$(date +\%F).sql.gz
```

Restore drill: `gunzip -c <file> | docker compose -p bumbleb exec -T db psql -U bumbleb -d bumblebkidz_erp`.

## 9. Operating rules for this host

- **One API replica.** The 05:00 IST scheduler and the BullMQ worker live inside
  the API process; a second replica double-sends absence alerts.
- **Never `docker compose down` at the project root without `-p bumbleb`** — do
  not disturb `casnowball`. Always pass the same `-p` and both `-f` flags.
- **Ports:** if `8082` is ever taken, change it in `deploy/docker-compose.vps.yml`
  and in the Caddy block together.
- **Redis** here is this project's own container; the Evolution stack's Redis is
  a different project and must not be reused.
- **Disk:** images plus volumes are small today, but `docker system prune` is
  shared with the other project — confirm before pruning.

## 10. Evolution API (WhatsApp)

`evolution_api` already runs on this host for the existing project. An Evolution
**instance** is the isolation boundary — its own QR pairing and its own phone
number — so the centre's number can live as a _new instance_ on that same server
without touching the existing one.

To switch the ERP's WhatsApp on, we still need three values in `.env`:

| Value                | Where it comes from                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EVOLUTION_API_URL`  | from the ERP's api container: `http://evolution_api:8080` (requires attaching that network — ask before changing networks), or `http://172.17.0.1:8081` via the docker bridge |
| `EVOLUTION_API_KEY`  | the global API key in `/opt/casnowball/deploy/whatsapp/.env`                                                                                                                  |
| `EVOLUTION_INSTANCE` | the instance created and QR-paired to the centre's number                                                                                                                     |

Until all three are set, comms stays in sandbox mode: messages are logged and
marked sent without leaving the server. That is expected, not a fault.

## 11. Three projects on one host — what is separated and what is not

A third project is expected on this box. Read this before it arrives, because
"separate" is true for ports, names and data, and **false** for CPU, RAM, disk
and the Docker daemon itself.

### Port map (one public listener, one loopback port per project)

| Port             | Owner                                           | Reachable from |
| ---------------- | ----------------------------------------------- | -------------- |
| `:80` / `:443`   | **Caddy** (host systemd)                        | internet       |
| `127.0.0.1:8080` | `casnowball` — `casnowball-web-1`               | host only      |
| `127.0.0.1:8081` | `casnowball-whatsapp` — `evolution_api`         | host only      |
| `127.0.0.1:8082` | `bumbleb` — `bumbleb-frontend-1`                | host only      |
| `127.0.0.1:8083` | `bumbleb-whatsapp` — QR pairing only, temporary | host only      |
| `127.0.0.1:8084` | **next free — reserve for project #3**          | host only      |

Nothing else is published. Every API, Postgres, Redis and OCR container in all
projects binds an internal-only port, so the classic collisions (`5432`, `6379`,
`3000`) cannot happen between projects.

### What is genuinely isolated

| Layer                 | Isolated? | Mechanism                                                           |
| --------------------- | --------- | ------------------------------------------------------------------- |
| Public ports / TLS    | Yes       | Only Caddy binds `:80`/`:443`; one certificate per hostname         |
| Hostname routing      | Yes       | Caddy matches TLS SNI / `Host` to a site block                      |
| Container names       | Yes       | `-p <project>` prefixes every name (`bumbleb-api-1`)                |
| Private network + DNS | Yes       | One bridge per project; `db` resolves only inside its own project   |
| Volumes and data      | Yes       | `bumbleb_pgdata` ≠ `casnowball_pgdata`; no shared database          |
| Secrets               | Yes       | Separate `.env` per project, separate DB passwords                  |
| Restart / crash scope | Mostly    | `restart: unless-stopped` is per container; a crashloop stays local |

Practical consequence: from inside `bumbleb-api-1`, the name `db` is BumbleB's
Postgres — it can never resolve to the other project's. Cross-project traffic
only happens if you deliberately join a shared external network.

### What is shared — and how to keep it from hurting

| Resource               | Risk                                                                                                   | Guardrail                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| **RAM (7.8 GB)**       | One project's leak can trigger the host OOM killer, which may kill _another_ project's process         | `mem_limit` per service (see below)                               |
| **CPU (4 vCPU)**       | `--build` saturates all cores for minutes; other sites get slow                                        | Build off-peak, one project at a time                             |
| **Disk (161 GB free)** | `json-file` logs are **unbounded by default** — a chatty app can fill the disk and break every project | Cap logs daemon-wide (below)                                      |
| **Docker daemon**      | `systemctl restart docker` stops every project at once                                                 | Avoid; `docker compose -p <x> restart` instead                    |
| **Caddy process**      | A bad site block fails the whole reload                                                                | `caddy validate` first — `deploy.sh --caddy` enforces it          |
| **Security**           | Same daemon, same root; a container escape is host-wide                                                | Not a VM boundary. Never mount `/var/run/docker.sock` into an app |

### Budget for three projects

Measured/typical resident memory for this stack shape:

| Component                    | Typical RSS |
| ---------------------------- | ----------- |
| Postgres 16 (per instance)   | 80–150 MB   |
| Redis (per instance)         | 10–25 MB    |
| NestJS API                   | 120–200 MB  |
| nginx (SPA)                  | 10–15 MB    |
| Evolution API (Node+Baileys) | 250–500 MB  |

So `bumbleb` ≈ 300–350 MB, `bumbleb-whatsapp` ≈ 500–600 MB, and three
application projects together ≈ 1.5–2 GB — comfortable inside 7.8 GB with the
existing load. Add memory limits anyway, so a runaway process degrades its own
project instead of the host.

### Guardrail 1 — cap logs daemon-wide (do this once)

```bash
sudo tee /etc/docker/daemon.json >/dev/null <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
sudo systemctl restart docker   # stops all projects briefly — do it in a window
```

Existing containers keep the old driver until recreated (`docker compose -p <x>
up -d --force-recreate`), so schedule that deliberately.

### Guardrail 2 — memory ceiling per service

Add to a project's compose file (Compose v2 maps these to host limits):

```yaml
services:
  api:
    mem_limit: 768m
    cpus: 1.5
```

Start with `bumbleb` (api 768m, db 512m, redis 128m, frontend 128m) and adjust
after watching `docker stats --no-stream` for a few days.

### Checklist for project #3

1. **Unique project name:** always run with `-p <name>` (or set
   `COMPOSE_PROJECT_NAME` in its `.env`). Two directories with the same basename
   silently merge into one project — that is the single easiest way to break
   this host.
2. **One free loopback port:** `8084` onwards. Publish `127.0.0.1:PORT:80`, never
   `80:80`.
3. **Its own hostname + Caddy block**, validated before reload.
4. **Its own database and Redis** — never reuse another project's.
5. **Its own volumes**, and no `external` volumes borrowed from elsewhere.
6. **Memory limits and log caps** as above.
7. **No shared `.env`**, no copied secrets between projects.
8. After it is up: `docker ps --format '{{.Names}}\t{{.Ports}}'` should show four
   or five containers with distinct loopback ports and nothing on `0.0.0.0`.
