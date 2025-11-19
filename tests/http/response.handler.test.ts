import { describe, test, expect } from 'bun:test';
import { responseHandler } from '../../src/http/response.handler';

describe('responseHandler', () => {
  // Mock объект set для тестов
  const createMockSet = (status?: number) => ({
    headers: {},
    status: status,
    redirect: undefined as string | undefined,
    cookie: undefined
  });

  describe('Обёртка успешных ответов', () => {
    test('должен обернуть объект в success + data', () => {
      const set = createMockSet();
      const response = { paymentId: '123', amount: 1000 };

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: { paymentId: '123', amount: 1000 }
      });
    });

    test('должен обернуть массив в success + data', () => {
      const set = createMockSet();
      const response = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' }
      ];

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: response
      });
    });

    test('должен обернуть строку в success + data', () => {
      const set = createMockSet();
      const response = 'OK';

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: 'OK'
      });
    });

    test('должен обернуть число в success + data', () => {
      const set = createMockSet();
      const response = 42;

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: 42
      });
    });

    test('должен обернуть boolean в success + data', () => {
      const set = createMockSet();
      const response = true;

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: true
      });
    });
  });

  describe('Обработка null/undefined', () => {
    test('должен вернуть только success: true для null', () => {
      const set = createMockSet();
      const response = null;

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true
      });
    });

    test('должен вернуть только success: true для undefined', () => {
      const set = createMockSet();
      const response = undefined;

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true
      });
    });
  });

  describe('Игнорирование ответов с ошибками', () => {
    test('должен пропустить ответ с 400 статусом', () => {
      const set = createMockSet(400);
      const response = { error: 'Bad Request' };

      const result = responseHandler({ response, set });

      expect(result).toBeUndefined();
    });

    test('должен пропустить ответ с 404 статусом', () => {
      const set = createMockSet(404);
      const response = { error: 'Not Found' };

      const result = responseHandler({ response, set });

      expect(result).toBeUndefined();
    });

    test('должен пропустить ответ с 422 статусом', () => {
      const set = createMockSet(422);
      const response = { error: 'Validation Error' };

      const result = responseHandler({ response, set });

      expect(result).toBeUndefined();
    });

    test('должен пропустить ответ с 500 статусом', () => {
      const set = createMockSet(500);
      const response = { error: 'Internal Server Error' };

      const result = responseHandler({ response, set });

      expect(result).toBeUndefined();
    });

    test('должен пропустить ответ с 502 статусом', () => {
      const set = createMockSet(502);
      const response = { error: 'Bad Gateway' };

      const result = responseHandler({ response, set });

      expect(result).toBeUndefined();
    });
  });

  describe('Обработка успешных статусов', () => {
    test('должен обернуть ответ с 200 статусом', () => {
      const set = createMockSet(200);
      const response = { data: 'success' };

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: { data: 'success' }
      });
    });

    test('должен обернуть ответ с 201 статусом', () => {
      const set = createMockSet(201);
      const response = { created: true };

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: { created: true }
      });
    });

    test('должен обернуть ответ с 204 статусом', () => {
      const set = createMockSet(204);
      const response = { message: 'No content' };

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: { message: 'No content' }
      });
    });

    test('должен обернуть ответ без явного статуса (по умолчанию 200)', () => {
      const set = createMockSet();
      const response = { test: 'data' };

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: { test: 'data' }
      });
    });
  });

  describe('Сложные структуры данных', () => {
    test('должен обернуть вложенный объект', () => {
      const set = createMockSet();
      const response = {
        payment: {
          id: '123',
          amount: 1000,
          currency: 'RUB',
          status: 'completed'
        },
        metadata: {
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02'
        }
      };

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: response
      });
    });

    test('должен обернуть массив объектов', () => {
      const set = createMockSet();
      const response = [
        { id: '1', status: 'pending' },
        { id: '2', status: 'completed' },
        { id: '3', status: 'failed' }
      ];

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: response
      });
    });

    test('должен обернуть пустой массив', () => {
      const set = createMockSet();
      const response: any[] = [];

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: []
      });
    });

    test('должен обернуть пустой объект', () => {
      const set = createMockSet();
      const response = {};

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: {}
      });
    });
  });

  describe('Граничные случаи', () => {
    test('должен обернуть 0 как валидные данные', () => {
      const set = createMockSet();
      const response = 0;

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: 0
      });
    });

    test('должен обернуть пустую строку как валидные данные', () => {
      const set = createMockSet();
      const response = '';

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: ''
      });
    });

    test('должен обернуть false как валидные данные', () => {
      const set = createMockSet();
      const response = false;

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: false
      });
    });

    test('должен пропустить ответ с граничным статусом 399 (не ошибка)', () => {
      const set = createMockSet(399);
      const response = { data: 'test' };

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: { data: 'test' }
      });
    });

    test('должен обработать статус как string и использовать default', () => {
      const set = {
        headers: {},
        status: 'OK' as any,
        redirect: undefined,
        cookie: undefined
      };
      const response = { data: 'test' };

      const result = responseHandler({ response, set });

      expect(result).toEqual({
        success: true,
        data: { data: 'test' }
      });
    });
  });
});
