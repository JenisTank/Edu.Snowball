import { ADMIN_ROLES, HO_ROLES } from '../src/common/auth/auth.constants';
import { unitScope } from '../src/common/auth/unit-scope';

describe('unit scoping (system rule 1 — multi-unit isolation)', () => {
  it('lets Head Office roles read across units', () => {
    for (const role of HO_ROLES) {
      expect(unitScope({ role, unitId: null })).toEqual({});
    }
  });

  it('lets Head Office narrow to one unit when asked', () => {
    expect(unitScope({ role: 'FOUNDER', unitId: null }, 'unit-2')).toEqual({ unitId: 'unit-2' });
  });

  it('always scopes unit roles to their own unit, ignoring the request', () => {
    for (const role of ['CENTRE_HEAD', 'COORDINATOR', 'TEACHER', 'HR_MANAGER']) {
      expect(unitScope({ role, unitId: 'unit-1' }, 'unit-2')).toEqual({ unitId: 'unit-1' });
    }
  });

  it('fails closed for a unit role with no unit', () => {
    expect(unitScope({ role: 'TEACHER', unitId: null })).toEqual({ unitId: '__none__' });
  });

  it('keeps admin management limited to Founder and Academic Director', () => {
    expect(ADMIN_ROLES).toEqual(['FOUNDER', 'ACADEMIC_DIR']);
    expect(HO_ROLES).not.toContain('TEACHER');
  });
});
