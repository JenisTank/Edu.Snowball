# Parent Portal

The parent portal is **not a separate app** — it ships inside the staff frontend
as an installable PWA to keep hosting simple (one deploy, one domain).

- Route: `/parent` (own login: registered mobile + child admission no)
- Code: `frontend/src/pages/Parent.tsx`
- PWA bits: `frontend/public/manifest.webmanifest`, `frontend/public/sw.js`, icons

If it ever needs to become a standalone app (e.g. separate domain or native
wrapper), this folder is the place to grow it.
