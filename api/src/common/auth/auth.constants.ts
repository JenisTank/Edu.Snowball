import { Roles } from '../auth/roles.decorator';
import { unitScope } from '../auth/unit-scope';

/**
 * Authorisation primitives shared by every module.
 *
 * The ERP is multi-unit: HO roles see across units, every other role is scoped
 * to its own unitId via `unitScope()`.
 */
export const ROLES_KEY = 'roles';

/** Head-office roles — cross-unit visibility. */
export const HO_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CURRICULUM_LEAD', 'RECEPTIONIST'];

/** Roles that administer the user directory (Founder / Academic Director). */
export const ADMIN_ROLES = ['FOUNDER', 'ACADEMIC_DIR'];
