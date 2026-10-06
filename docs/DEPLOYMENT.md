# BumbleB Kidz ERP — VPS Deployment Guide

Target: an **existing VPS that already runs other live projects**. Everything
below is designed so this stack cannot collide with what is already there.

## How conflicts are avoided

| Risk | How this stack avoids it |
|---|---|
| Port 80/443 already used by another project | We publish **nothing** on 80/443. Only one loopback port (`BB_HTTP_PORT`, default `8080`) is exposed, and your existing nginx/Traefik proxies the domain to it. |
| A Postgres/Redis already running on the host | Our `db` and `redis` have **no host ports** in the prod overlay — they are reachable only on the project's private Docker network. |
| Container name clashes | All containers are prefixed `bumbleb-` (`bumbleb-db`, `bumbleb-redis`, `bumbleb-api`, `bumbleb-web`). |
| One project eating all RAM | Memory limits per service (`db` 768M, `api` 768M, `redis` 192M, `web` 192M ≈ **2 GB ceiling**). |
| Disk filled by logs | JSON log driver capped at 10 MB × 3 files per service. |
| Volume name clashes | Volumes are namespaced by the compose project name — keep the directory named `bumbleb-erp`, or set `COMPOSE_PROJECT_NAME=bumbleb`. |

---

## 1. One-time setup on the VPS

```bash
# as a sudo user
sudo mkdir -p /srv/bumbleb-erp && sudo chown "$USER" /srv/bumbleb-erp
git clone <repo-url> /srv/bumbleb-erp
cd /srv/bumbleb-erp

cp .env.example .env
```

Fill in `.env` — the four that genuinely matter on day one:

```bash
openssl rand -hex 32   # → JWT_SECRET
openssl rand -hex 32   # → PII_ENCRYPTION_KEY   (back this up! losing it makes
                       #    encrypted medical fields unreadable forever)
openssl rand -hex 24   # → DB_PASSWORD
npx web-push generate-vapid-keys   # → VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

Pick a free host port if 8080 is taken:

```bash
ss -ltnp | grep -E ':(8080|8081|8090)\s'   # check what's free
echo 'BB_HTTP_PORT=8081' >> .env           # example
```

## 2. Bring the stack up

```bash
cd /srv/bumbleb-erp
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Create the schema (first deploy only):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec api npx prisma db push
```

Load the demo dataset (**skip this when real data is being imported**):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec api npx ts-node --transpile-only prisma/seed.ts
```

Health check:

```bash
curl -s http://127.0.0.1:${BB_HTTP_PORT:-8080}/api/health
# {"status":"ok","db":"up","at":"..."}
```

## 3. Wire the domain into the existing reverse proxy

### If the VPS uses nginx

`/etc/nginx/sites-available/erp.bumblebkidz.com`:

```nginx
server {
    listen 80;
    server_name erp.bumblebkidz.com;
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name erp.bumblebkidz.com;

    ssl_certificate     /etc/letsencrypt/live/erp.bumblebkidz.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/erp.bumblebkidz.com/privkey.pem;

    client_max_body_size 25m;          # document vault uploads

    location / {
        proxy_pass http://127.0.0.1:8080;   # = BB_HTTP_PORT
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/erp.bumblebkidz.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d erp.bumblebkidz.com      # only this new host
```

### If the VPS uses Traefik

Add to the `frontend` service in a local override file:

```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.bumbleb.rule=Host(`erp.bumblebkidz.com`)
  - traefik.http.routers.bumbleb.entrypoints=websecure
  - traefik.http.routers.bumbleb.tls.certresolver=letsencrypt
  - traefik.http.services.bumbleb.loadbalancer.server.port=80
networks: [traefik, default]
```

> **HTTPS is mandatory** — web push and the installable PWA only work on a
> secure origin.

## 4. Updating after a code change

```bash
cd /srv/bumbleb-erp
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# if the schema changed:
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api npx prisma db push
```

Rollback: `git checkout <previous-sha> && docker compose ... up -d --build`.

## 5. Backups

```bash
./scripts/backup.sh                       # db dump + document vault tarball
crontab -e
15 2 * * * cd /srv/bumbleb-erp && ./scripts/backup.sh >> /var/log/bumbleb-backup.log 2>&1
```

Keeps 14 days by default (`KEEP_DAYS`). Restore with
`./scripts/restore.sh backups/db-YYYYmmdd-HHMMSS.sql.gz`.

**Also back up `.env` somewhere safe** — `PII_ENCRYPTION_KEY` cannot be
regenerated.

## 6. Going from placeholder to live

Each of these is "add the key, restart the api container" — no code change:

| Feature | What to add to `.env` | Until then |
|---|---|---|
| Razorpay cards/net-banking | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Parents pay by UPI QR; office confirms the reference and the receipt is issued automatically. |
| WhatsApp | `WA_BSP_KEY`, `WA_BSP_URL` + approved template names recorded in Communication → Templates | Messages queue and are marked `SANDBOX`; app push still delivers. |
| Email fallback | `SMTP_*` | Skipped in the fallback chain. |
| Web push | `VAPID_*` | The "Turn on notifications" card tells the parent it is unavailable. |

Razorpay webhook URL to register: `https://erp.bumblebkidz.com/api/payments/webhook`.

## 7. Operations cheat-sheet

```bash
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
$C logs -f api                 # tail API logs
$C restart api                 # restart after an .env change
$C exec db psql -U bumbleb -d bumblebkidz_erp
$C down                        # stop (volumes/data are kept)
docker stats bumbleb-api bumbleb-db bumbleb-redis bumbleb-web
```

Resource footprint: ~2 GB RAM ceiling, ~1 vCPU under normal load, and roughly
2 GB disk plus whatever the document vault grows to.
