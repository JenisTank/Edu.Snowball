# BumbleB Kidz ERP — staff portal + parent PWA image
# Builds the Vite bundle, then serves it from nginx (SPA fallback + /api proxy).

# ── build ────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
# the UI kit is a git dependency, so git is required at install time
RUN apk add --no-cache git
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ── runtime ──────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q --spider http://127.0.0.1/ || exit 1
