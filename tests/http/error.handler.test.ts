import { describe, test, expect } from 'bun:test';
import { errorHandler } from '../../src/http/error.handler';
import { 
  ValidationError, 
  NotFoundError, 
  InvalidStateError, 
  ExternalServiceError 
} from '../../src/http/errors.types';

describe('errorHandler', () => {
  // Mock объект set для тестов
  const createMockSet = () => ({
    headers: {},
    status: undefined as number | undefined,
    redirect: undefined as string | undefined,
    cookie: undefined
  });

  describe('Обработка кастомных ошибок приложения', () => {
    test('ValidationError - должен вернуть 422 и корректную структуру ответа', () => {
      const set = createMockSet();
      const error = new ValidationError('Неверный формат email', { field: 'email' });

      const result = errorHandler({ code: 'UNKNOWN', error, set });

      expect(set.status).toBe(422);
      expect(result).toEqual({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Неверный формат email',
          details: { field: 'email' }
        }
      });
    });

    test('NotFoundError - должен вернуть 404 и корректную структуру ответа', () => {
      const set = createMockSet();
      const error = new NotFoundError('Payment', '123e4567-e89b-12d3-a456-426614174000');

      const result = errorHandler({ code: 'UNKNOWN', error, set });

      expect(set.status).toBe(404);
      expect(result).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Payment с ID 123e4567-e89b-12d3-a456-426614174000 не найден',
          details: undefined
        }
      });
    });

    test('InvalidStateError - должен вернуть 400 и корректную структуру ответа', () => {
      const set = createMockSet();
      const error = new InvalidStateError('Невозможно отменить завершённый платёж');

      const result = errorHandler({ code: 'UNKNOWN', error, set });

      expect(set.status).toBe(400);
      expect(result).toEqual({
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Невозможно отменить завершённый платёж',
          details: undefined
        }
      });
    });

    test('ExternalServiceError - должен вернуть 502 и корректную структуру ответа', () => {
      const set = createMockSet();
      const error = new ExternalServiceError(
        'TBank',
        'TIMEOUT',
        'Таймаут ожидания ответа'
      );

      const result = errorHandler({ code: 'UNKNOWN', error, set });

      expect(set.status).toBe(502);
      expect(result).toEqual({
        success: false,
        error: {
          code: 'EXTERNAL_SERVICE_ERROR',
          message: 'TBank: Таймаут ожидания ответа',
          details: {
            service: 'TBank',
            serviceErrorCode: 'TIMEOUT'
          }
        }
      });
    });
  });

  describe('Обработка ошибок валидации Elysia/Zod', () => {
    test('VALIDATION - должен вернуть 422 и обработать ошибку валидации', () => {
      const set = createMockSet();
      const error = {
        message: 'Expected string, received number',
        all: [
          {
            path: '/amount',
            message: 'Expected number, received string'
          }
        ]
      } as any;

      const result = errorHandler({ code: 'VALIDATION', error, set });

      expect(set.status).toBe(422);
      expect(result).toEqual({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Expected string, received number',
          details: error.all
        }
      });
    });

    test('VALIDATION - должен работать с ошибкой без поля all', () => {
      const set = createMockSet();
      const error = {
        message: 'Validation failed'
      } as any;

      const result = errorHandler({ code: 'VALIDATION', error, set });

      expect(set.status).toBe(422);
      expect(result).toEqual({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: undefined
        }
      });
    });

    test('VALIDATION - должен использовать сообщение по умолчанию', () => {
      const set = createMockSet();
      const error = {} as any;

      const result = errorHandler({ code: 'VALIDATION', error, set });

      expect(set.status).toBe(422);
      expect(result.error.message).toBe('Ошибка валидации');
    });
  });

  describe('Обработка ошибки 404 от Elysia', () => {
    test('NOT_FOUND - должен вернуть 404 и корректное сообщение', () => {
      const set = createMockSet();
      const error = new Error('Not Found');

      const result = errorHandler({ code: 'NOT_FOUND', error, set });

      expect(set.status).toBe(404);
      expect(result).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Ресурс не найден'
        }
      });
    });
  });

  describe('Обработка прочих ошибок', () => {
    test('INTERNAL_SERVER_ERROR - должен вернуть 500', () => {
      const set = createMockSet();
      const error = new Error('Database connection failed');

      const result = errorHandler({ code: 'INTERNAL_SERVER_ERROR', error, set });

      expect(set.status).toBe(500);
      expect(result).toEqual({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database connection failed'
        }
      });
    });

    test('UNKNOWN - должен вернуть 500 и скрыть детали в production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const set = createMockSet();
      const error = new Error('Sensitive internal error');

      const result = errorHandler({ code: 'UNKNOWN', error, set });

      expect(set.status).toBe(500);
      expect(result).toEqual({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Внутренняя ошибка сервера'
        }
      });

      process.env.NODE_ENV = originalEnv;
    });

    test('UNKNOWN - должен показывать детали в development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const set = createMockSet();
      const error = new Error('Detailed error message');

      const result = errorHandler({ code: 'UNKNOWN', error, set });

      expect(set.status).toBe(500);
      expect(result.error.message).toBe('Detailed error message');

      process.env.NODE_ENV = originalEnv;
    });

    test('PARSE - должен вернуть 500 для ошибки парсинга', () => {
      const set = createMockSet();
      const error = new Error('Invalid JSON');

      const result = errorHandler({ code: 'PARSE', error, set });

      expect(set.status).toBe(500);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_SERVER_ERROR');
    });

    test('Неизвестная ошибка без message - должен использовать стандартное сообщение', () => {
      const set = createMockSet();
      const error = { toString: () => 'Unknown error' } as any;

      const result = errorHandler({ code: 'UNKNOWN', error, set });

      expect(set.status).toBe(500);
      expect(result.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  describe('Логирование ошибок', () => {
    test('должен логировать ошибку в консоль', () => {
      const originalConsoleError = console.error;
      const errorLogs: any[] = [];
      console.error = (...args: any[]) => errorLogs.push(args);

      const set = createMockSet();
      const error = new ValidationError('Test error');

      errorHandler({ code: 'UNKNOWN', error, set });

      expect(errorLogs.length).toBeGreaterThan(0);
      expect(errorLogs[0][0]).toContain('❌ Ошибка сервера:');

      console.error = originalConsoleError;
    });
  });

  describe('Установка статуса ответа', () => {
    test('должен корректно устанавливать статус для каждого типа ошибки', () => {
      const testCases = [
        { error: new ValidationError('test'), expectedStatus: 422 },
        { error: new NotFoundError('Payment', '123'), expectedStatus: 404 },
        { error: new InvalidStateError('test'), expectedStatus: 400 },
        { error: new ExternalServiceError('Test', 'ERR', 'msg'), expectedStatus: 502 }
      ];

      testCases.forEach(({ error, expectedStatus }) => {
        const set = createMockSet();
        errorHandler({ code: 'UNKNOWN', error, set });
        expect(set.status).toBe(expectedStatus);
      });
    });
  });
});
