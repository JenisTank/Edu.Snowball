import { SetMetadata } from '@nestjs/common';

import { ROLES_KEY } from './auth.constants';

/** Restrict a route to the given roles — enforced by AuthGuard. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
