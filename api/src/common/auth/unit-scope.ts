import { HO_ROLES } from '../auth/auth.constants';

export function unitScope(user: { role: string; unitId: string | null }, requestedUnitId?: string) {
  if (HO_ROLES.includes(user.role)) {
    return requestedUnitId ? { unitId: requestedUnitId } : {};
  }
  return { unitId: user.unitId ?? '__none__' };
}
