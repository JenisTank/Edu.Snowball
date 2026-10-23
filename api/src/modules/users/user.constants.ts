import { HO_ROLES } from '../../common/auth/auth.constants';

/** Roles that may hold no unit (they work for Head Office). */
export const HEAD_OFFICE_USER_ROLES = [...HO_ROLES, 'HR_MANAGER'];

/** Roles a Centre Head is allowed to create or edit. */
export const UNIT_MANAGED_ROLES = ['COORDINATOR', 'TEACHER', 'RECEPTIONIST'];
