import { createContext, useContext, useState, ReactNode } from 'react';
import { api, store } from './api';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  unitId: string | null;
  unitName: string;
}

export const ROLE_LABELS: Record<string, string> = {
  FOUNDER: 'Founder',
  ACADEMIC_DIR: 'Academic Director',
  CURRICULUM_LEAD: 'Curriculum Lead',
  CENTRE_HEAD: 'Centre Head',
  COORDINATOR: 'Coordinator',
  TEACHER: 'Teacher',
  RECEPTIONIST: 'Receptionist',
};

export const HO_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CURRICULUM_LEAD', 'RECEPTIONIST'];

interface AuthCtx {
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => {
    const raw = store.get('bb_user');
    return raw ? JSON.parse(raw) : null;
  });

  async function login(email: string, password: string) {
    const res = await api<{ accessToken: string; refreshToken: string; user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    store.set('bb_token', res.accessToken);
    store.set('bb_refresh', res.refreshToken);
    store.set('bb_user', JSON.stringify(res.user));
    setUser(res.user);
  }

  function logout() {
    store.del('bb_token');
    store.del('bb_refresh');
    store.del('bb_user');
    setUser(null);
  }

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
