import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

const PRISMA_ERRORS: Record<string, { status: HttpStatus; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'Ya existe un registro con esos datos únicos' },
  P2003: { status: HttpStatus.BAD_REQUEST, message: 'El registro referenciado no existe' },
  P2014: { status: HttpStatus.BAD_REQUEST, message: 'Violación de relación requerida' },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Registro no encontrado' },
};

/**
 * Filtro único de excepciones: todas las respuestas de error tienen la misma forma
 * { success: false, statusCode, message, errors?, code?, timestamp, path }.
 * Los errores inesperados se registran con su traza pero nunca se exponen al cliente.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    if (response.headersSent) return;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: unknown = 'Error interno del servidor';
    let errors: unknown;
    let code: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const obj = body as Record<string, unknown>;
        message = obj['message'] ?? exception.message;
        errors = obj['errors'];
        code = obj['code'];
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = PRISMA_ERRORS[exception.code];
      if (mapped) {
        status = mapped.status;
        message = mapped.message;
      } else {
        this.logger.error(`Prisma ${exception.code} en ${request.method} ${request.url}: ${exception.message}`);
        message = 'Error de base de datos';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Datos inválidos para la operación solicitada';
      this.logger.warn(`Validación Prisma en ${request.method} ${request.url}`);
    } else {
      const err = exception as Error;
      this.logger.error(`${request.method} ${request.url}: ${err?.message}`, err?.stack);
    }

    if (status >= 500 && exception instanceof HttpException) {
      this.logger.error(`${request.method} ${request.url}`, exception.stack);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
      ...(code ? { code } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
