import { ValidationPipe } from '@nestjs/common';

export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    stopAtFirstError: false,
    exceptionFactory: (errors) => {
      const result: Record<string, string[]> = {};
      for (const error of errors) {
        result[error.property] = Object.values(error.constraints ?? {});
      }
      return {
        message: 'Error de validación',
        name: 'ValidationException',
        errors: result,
        getStatus: () => 422,
        getResponse: () => ({
          message: 'Error de validación',
          errors: result,
          statusCode: 422,
        }),
      } as unknown as Error;
    },
  });
}
