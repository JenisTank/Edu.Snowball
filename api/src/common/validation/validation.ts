import { ValidationPipe } from '@nestjs/common';

/**
 * Global request validation.
 *
 * - `whitelist` strips properties that a DTO does not declare, which closes the
 *   mass-assignment door on every endpoint that has a DTO.
 * - Handlers still typed as `@Body() b: any` (no DTO) are untouched by design:
 *   Nest only validates when a DTO class is supplied, so this can be rolled out
 *   endpoint by endpoint without changing existing behaviour.
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
