import { ValidationPipe } from '@nestjs/common';

/**
 * Global request validation.
 *
 * - `whitelist` strips properties that a DTO does not declare, which closes the
 *   mass-assignment door on every endpoint that has a DTO.
 * - Every route body now supplies a DTO class, so nothing reaches a handler
 *   unvalidated; `test/body-dto.spec.ts` fails the build if an `@Body()` is
 *   ever declared as `any` or as an inline object literal again.
 * - `transform` turns payloads into DTO instances so numbers/dates arrive typed.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidUnknownValues: false,
    transformOptions: { enableImplicitConversion: true },
    validationError: { target: false, value: false },
  });
}
