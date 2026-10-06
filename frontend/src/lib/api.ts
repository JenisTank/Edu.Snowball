// Single API client — all requests go through here (token, auto-refresh, errors)
const BASE = '/api';

// Safe storage: localStorage → in-memory → cookie, so the session survives
// even when the preview iframe restricts one of the mechanisms.
const mem: Record<string, string> = {};
function setCookie(k: string, v: string) {
  try { document.cookie = `${k}=${encodeURIComponent(v)}; path=/; max-age=604800; SameSite=None; Secure`; } catch { /* ignore */ }
}
function getCookie(k: string): string | null {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}
function delCookie(k: string) {
  try { document.cookie = `${k}=; path=/; max-age=0; SameSite=None; Secure`; } catch { /* ignore */ }
}
export const store = {
  get(k: string): string | null {
    try { const v = localStorage.getItem(k); if (v) return v; } catch { /* blocked */ }
    return mem[k] ?? getCookie(k);
  },
  set(k: string, v: string) {
    mem[k] = v;
    try { localStorage.setItem(k, v); } catch { /* in-memory + cookie only */ }
    setCookie(k, v);
  },
  del(k: string) {
    delete mem[k];
    try { localStorage.removeItem(k); } catch { /* ignore */ }
    delCookie(k);
  },
};

export const getToken = () => store.get('bb_token');

// ── Silent token refresh (spec: 15-min access + 7-day refresh) ──
let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  const rt = store.get('bb_refresh');
  if (!rt) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) return false;
        const d = await res.json();
        store.set('bb_token', d.accessToken);
        if (d.refreshToken) store.set('bb_refresh', d.refreshToken);
        if (d.user) store.set('bb_user', JSON.stringify(d.user));
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => { refreshing = null; }, 0);
      }
    })();
  }
  return refreshing;
}

function clearSession() {
  store.del('bb_token');
  store.del('bb_refresh');
  store.del('bb_user');
}

export async function api<T = any>(path: string, options: RequestInit = {}, _retried = false): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      // Token sent through BOTH headers — proxies may strip Authorization,
      // custom x-bb-token survives; cookie rides along as third channel.
      ...(token ? { Authorization: `Bearer ${token}`, 'x-bb-token': token } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401 && !path.startsWith('/auth')) {
    // Access token expired → try silent refresh once, then retry the request
    if (!_retried && (await tryRefresh())) {
      return api<T>(path, options, true);
    }
    clearSession();
    window.location.href = '/login?reason=session';
    throw new Error('Session expired — please log in again');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export const fmtINR = (n: number | string) =>
  '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
