import { UnprocessableEntityException, ValidationPipe, type ValidationError } from '@nestjs/common';

/** Aplana errores anidados (p. ej. items[0].quantity) en un mapa campo → mensajes. */
function flatten(errors: ValidationError[], parent = '', out: Record<string, string[]> = {}) {
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) out[path] = Object.values(error.constraints);
    if (error.children?.length) flatten(error.children, path, out);
  }
  return out;
}

export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    stopAtFirstError: false,
    exceptionFactory: (errors) => {
      const result = flatten(errors);
      const first = Object.values(result)[0]?.[0];
      return new UnprocessableEntityException({
        message: first ?? 'Error de validación',
        errors: result,
      });
    },
  });
}
