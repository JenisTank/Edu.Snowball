#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# BumbleB ERP — one-shot deploy on the shared VPS
#
#   bash deploy/deploy.sh                 # check, build, migrate, verify
#   bash deploy/deploy.sh --seed          # also load demo data (UAT only)
#   bash deploy/deploy.sh --caddy         # also install the Caddy site block
#   bash deploy/deploy.sh --dry-run       # preflight only, changes nothing
#
# Safe by construction: it only ever touches the `bumbleb` compose project and
# (with --caddy) appends ONE block to /etc/caddy/Caddyfile after a backup. It
# never stops, recreates or prunes anything belonging to another project, and
# it never deletes a volume.
#
# Host facts this is written against (survey 23 Oct 2026):
#   - host Caddy owns :80/:443, one site block per hostname
#   - the existing project `casnowball` publishes 127.0.0.1:8080
#   - this ERP publishes 127.0.0.1:8082 (deploy/docker-compose.vps.yml)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT="bumbleb"
HOSTNAME_ERP="edu.snowballconcepts.com"
LOCAL_PORT="8082"
COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.yml -f deploy/docker-compose.vps.yml)
CADDY_CONF="/etc/caddy/Caddyfile"

SEED=0; CADDY=0; DRY=0
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=1 ;;
    --caddy) CADDY=1 ;;
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1;33m▸ %s\033[0m\n' "$*"; }

# ── 1. Preflight ─────────────────────────────────────────────
step "Preflight"

command -v docker >/dev/null || die "docker is not installed"
docker compose version >/dev/null 2>&1 || die "docker compose plugin missing"
ok "docker $(docker --version | awk '{print $3}' | tr -d ,) · compose $(docker compose version --short 2>/dev/null || echo '?')"

[ -f .env ] || die ".env missing — cp .env.example .env and fill it in"

# Required secrets. PII_KEY is the one that silently degrades: env.ts only warns.
get_env() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '"'"'"''; }
missing=0
for key in DB_PASSWORD JWT_SECRET PII_KEY; do
  val="$(get_env "$key" || true)"
  if [ -z "${val:-}" ]; then
    warn "$key is not set in .env"
    missing=1
  fi
done
[ "$missing" -eq 0 ] || die "fill the empty secrets in .env (openssl rand -hex 32 for PII_KEY)"

jwt="$(get_env JWT_SECRET)"; pii="$(get_env PII_KEY)"
[ "${#jwt}" -ge 32 ] || die "JWT_SECRET must be 32+ characters (openssl rand -base64 48)"
[ "${#pii}" -ge 32 ] || die "PII_KEY must be 32+ characters (openssl rand -hex 32)"
ok "secrets present (JWT ${#jwt} chars, PII ${#pii} chars)"

# The merged compose file must parse — this is also the !override support check.
"${COMPOSE[@]}" config -q || die "compose files do not merge — is compose >= 2.24 for !override?"
ok "compose files merge cleanly"

# Port must be free, unless it is already ours from a previous deploy.
if ss -tln 2>/dev/null | grep -q "127.0.0.1:${LOCAL_PORT} "; then
  if docker ps --format '{{.Names}}' | grep -q "^${PROJECT}-frontend"; then
    ok "port ${LOCAL_PORT} already held by this project (redeploy)"
  else
    die "127.0.0.1:${LOCAL_PORT} is taken by something else — edit deploy/docker-compose.vps.yml first"
  fi
else
  ok "port ${LOCAL_PORT} is free"
fi

# DNS must already point here, or ACME will fail and retry in the background.
resolved="$(getent hosts "$HOSTNAME_ERP" | awk '{print $1; exit}' || true)"
[ -n "$resolved" ] || die "$HOSTNAME_ERP does not resolve — add the A record first"
ok "$HOSTNAME_ERP → $resolved"

public_ip="$(curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null || true)"
if [ -n "$public_ip" ]; then
  if [ "$public_ip" = "$resolved" ]; then
    ok "that is this host's public IP"
  else
    warn "DNS points at $resolved but this host reports $public_ip — cert may fail"
  fi
fi

df_pct="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
[ "${df_pct:-0}" -lt 90 ] || die "root filesystem ${df_pct}% full"
ok "disk ${df_pct}% used"

avail_mb="$(free -m | awk '/^Mem:/{print $7}')"
[ "${avail_mb:-0}" -gt 800 ] || warn "only ${avail_mb} MB RAM available; the build may struggle"

if [ "$DRY" -eq 1 ]; then
  step "Dry run — preflight passed, nothing was changed."
  exit 0
fi

# ── 2. Build and start ───────────────────────────────────────
step "Building and starting (project: ${PROJECT})"
"${COMPOSE[@]}" up -d --build

step "Waiting for the API to report healthy"
for i in $(seq 1 60); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "${PROJECT}-api-1" 2>/dev/null || echo missing)"
  [ "$status" = "healthy" ] && { ok "api healthy"; break; }
  [ "$i" -eq 60 ] && die "api did not become healthy — check: ${COMPOSE[*]} logs api"
  sleep 2
done

# ── 3. Schema ────────────────────────────────────────────────
step "Applying migrations"
"${COMPOSE[@]}" exec -T api npx prisma migrate deploy
ok "schema up to date"

if [ "$SEED" -eq 1 ]; then
  step "Loading demo data (UAT — never at go-live)"
  "${COMPOSE[@]}" exec -T api node dist/prisma/seed.js
  warn "demo logins use password 'bumbleb123'. Before real data: down -v, then redeploy without --seed."
fi

# ── 4. Verify ────────────────────────────────────────────────
step "Verifying"
health="$(curl -fsS --max-time 10 "http://127.0.0.1:${LOCAL_PORT}/api/health" || true)"
[ -n "$health" ] || die "the SPA is not answering on 127.0.0.1:${LOCAL_PORT}"
echo "  $health"
case "$health" in
  *'"database":"up"'*) ok "database reachable" ;;
  *) die "database not reachable inside the stack" ;;
esac
case "$health" in
  *'"redis":"down"'*) warn "redis down — queued jobs will not run (check '${COMPOSE[*]} ps')" ;;
  *) ok "redis reachable" ;;
esac

# ── 5. Caddy site block (optional) ───────────────────────────
if [ "$CADDY" -eq 1 ]; then
  step "Installing the Caddy site block for ${HOSTNAME_ERP}"
  command -v caddy >/dev/null || die "caddy is not installed on this host"
  [ -r "$CADDY_CONF" ] || die "cannot read ${CADDY_CONF} (run with sudo)"
  command -v sudo >/dev/null || die "sudo required to edit ${CADDY_CONF}"

  if sudo grep -qF "${HOSTNAME_ERP} {" "$CADDY_CONF"; then
    ok "a block for ${HOSTNAME_ERP} already exists — leaving the file alone"
  else
    sudo cp -a "$CADDY_CONF" "${CADDY_CONF}.bak.$(date +%F-%H%M%S)"
    ok "backed up to ${CADDY_CONF}.bak.*"
    # Leading newline guards against a missing trailing newline in the original.
    printf '\n' | sudo tee -a "$CADDY_CONF" >/dev/null
    sudo tee -a "$CADDY_CONF" < deploy/Caddyfile.erp.conf >/dev/null
    ok "block appended"
  fi

  sudo caddy validate --config "$CADDY_CONF" || die "invalid Caddyfile — restore the .bak and fix before reloading"
  ok "Caddyfile valid"
  sudo systemctl reload caddy
  ok "caddy reloaded (the existing site kept serving)"

  sleep 3
  if curl -fsS --max-time 15 "https://${HOSTNAME_ERP}/api/health" >/dev/null; then
    ok "https://${HOSTNAME_ERP}/api/health responds"
  else
    warn "HTTPS not answering yet — ACME may still be issuing. Watch: sudo journalctl -u caddy -f"
  fi
fi

cat <<EOF

────────────────────────────────────────────────────────────
  Deployed.

  Public    https://${HOSTNAME_ERP}
  Parent    https://${HOSTNAME_ERP}/parent
  Local     http://127.0.0.1:${LOCAL_PORT}/api/health

  Logs      ${COMPOSE[*]} logs -f api
  Backups   container-based pg_dump (see docs/VPS_DEPLOY.md §8)
────────────────────────────────────────────────────────────
EOF
