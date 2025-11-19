/**
 * Базовый класс для всех ошибок приложения
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Ошибка валидации (422)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super('VALIDATION_ERROR', message, 422, details);
  }
}

/**
 * Ресурс не найден (404)
 */
export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} с ID ${id} не найден`, 404);
  }
}

/**
 * Невалидное состояние для операции (400)
 */
export class InvalidStateError extends AppError {
  constructor(message: string) {
    super('INVALID_STATE', message, 400);
  }
}

/**
 * Ошибка внешнего сервиса (502)
 */
export class ExternalServiceError extends AppError {
  constructor(
    public readonly service: string,
    public readonly serviceErrorCode: string,
    message: string
  ) {
    super('EXTERNAL_SERVICE_ERROR', `${service}: ${message}`, 502, {
      service,
      serviceErrorCode
    });
  }
}

/**
 * Проверяет, является ли ошибка ошибкой приложения
 */
export function isAppError(error: any): error is AppError {
  return error instanceof AppError;
}
