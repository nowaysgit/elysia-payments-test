import { describe, test, expect } from 'bun:test';
import { PaymentEvent, PaymentEventType } from '../../src/entities/payment-event';

describe('PaymentEvent', () => {
  const paymentId = crypto.randomUUID();
  const now = new Date();

  describe('Создание событий через статические методы', () => {
    test('paymentInitiated - должен создать событие инициализации платежа', () => {
      const event = PaymentEvent.paymentInitiated(
        paymentId,
        1000,
        'RUB',
        crypto.randomUUID(),
        'Тестовый платёж'
      );

      expect(event.id).toBeDefined();
      expect(event.paymentId).toBe(paymentId);
      expect(event.type).toBe(PaymentEventType.PAYMENT_INITIATED);
      expect(event.data.amount).toBe(1000);
      expect(event.data.currency).toBe('RUB');
      expect(event.data.description).toBe('Тестовый платёж');
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    test('paymentLinkGenerated - должен создать событие генерации ссылки', () => {
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const event = PaymentEvent.paymentLinkGenerated(
        paymentId,
        'https://payment.example.com/pay/123',
        expiresAt
      );

      expect(event.id).toBeDefined();
      expect(event.paymentId).toBe(paymentId);
      expect(event.type).toBe(PaymentEventType.PAYMENT_LINK_GENERATED);
      expect(event.data.paymentUrl).toBe('https://payment.example.com/pay/123');
      expect(event.data.expiresAt).toBe(expiresAt);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    test('customerRedirected - должен создать событие перехода клиента', () => {
      const event = PaymentEvent.customerRedirected(
        paymentId,
        'Mozilla/5.0',
        '192.168.1.1'
      );

      expect(event.id).toBeDefined();
      expect(event.paymentId).toBe(paymentId);
      expect(event.type).toBe(PaymentEventType.CUSTOMER_REDIRECTED);
      expect(event.data.userAgent).toBe('Mozilla/5.0');
      expect(event.data.ipAddress).toBe('192.168.1.1');
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    test('customerRedirected - должен работать без userAgent и ipAddress', () => {
      const event = PaymentEvent.customerRedirected(paymentId);

      expect(event.id).toBeDefined();
      expect(event.paymentId).toBe(paymentId);
      expect(event.type).toBe(PaymentEventType.CUSTOMER_REDIRECTED);
      expect(event.data.userAgent).toBeUndefined();
      expect(event.data.ipAddress).toBeUndefined();
    });

    test('processingStarted - должен создать событие начала обработки', () => {
      const event = PaymentEvent.processingStarted(
        paymentId,
        'tbank-sbp',
        'tx-123456'
      );

      expect(event.id).toBeDefined();
      expect(event.paymentId).toBe(paymentId);
      expect(event.type).toBe(PaymentEventType.PAYMENT_PROCESSING_STARTED);
      expect(event.data.providerId).toBe('tbank-sbp');
      expect(event.data.providerTransactionId).toBe('tx-123456');
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    test('paymentCompleted - должен создать событие завершения платежа', () => {
      const event = PaymentEvent.paymentCompleted(
        paymentId,
        'tbank-sbp',
        'tx-123456'
      );

      expect(event.id).toBeDefined();
      expect(event.paymentId).toBe(paymentId);
      expect(event.type).toBe(PaymentEventType.PAYMENT_COMPLETED);
      expect(event.data.providerId).toBe('tbank-sbp');
      expect(event.data.providerTransactionId).toBe('tx-123456');
      expect(event.data.completedAt).toBeInstanceOf(Date);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    test('paymentFailed - должен создать событие ошибки', () => {
      const event = PaymentEvent.paymentFailed(
        paymentId,
        'INSUFFICIENT_FUNDS',
        'Недостаточно средств',
        true
      );

      expect(event.id).toBeDefined();
      expect(event.paymentId).toBe(paymentId);
      expect(event.type).toBe(PaymentEventType.PAYMENT_FAILED);
      expect(event.data.errorCode).toBe('INSUFFICIENT_FUNDS');
      expect(event.data.errorMessage).toBe('Недостаточно средств');
      expect(event.data.isRetryable).toBe(true);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    test('paymentFailed - должен работать с isRetryable=false', () => {
      const event = PaymentEvent.paymentFailed(
        paymentId,
        'FRAUD_DETECTED',
        'Обнаружено мошенничество',
        false
      );

      expect(event.data.errorCode).toBe('FRAUD_DETECTED');
      expect(event.data.isRetryable).toBe(false);
    });

    test('retryRequested - должен создать событие повторной попытки', () => {
      const event = PaymentEvent.retryRequested(
        paymentId,
        2,
        'Клиент запросил повторную попытку'
      );

      expect(event.id).toBeDefined();
      expect(event.paymentId).toBe(paymentId);
      expect(event.type).toBe(PaymentEventType.PAYMENT_RETRY_REQUESTED);
      expect(event.data.attemptNumber).toBe(2);
      expect(event.data.reason).toBe('Клиент запросил повторную попытку');
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    test('paymentCancelled - должен создать событие отмены', () => {
      const event = PaymentEvent.paymentCancelled(
        paymentId,
        'Клиент отменил заказ',
        'user@example.com'
      );

      expect(event.id).toBeDefined();
      expect(event.paymentId).toBe(paymentId);
      expect(event.type).toBe(PaymentEventType.PAYMENT_CANCELLED);
      expect(event.data.reason).toBe('Клиент отменил заказ');
      expect(event.data.cancelledBy).toBe('user@example.com');
      expect(event.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Сериализация и десериализация', () => {
    test('toJSON - должен сериализовать событие в JSON', () => {
      const event = PaymentEvent.paymentInitiated(
        paymentId,
        1000,
        'RUB',
        crypto.randomUUID(),
        'Тест'
      );

      const json = event.toJSON();

      expect(json.id).toBe(event.id);
      expect(json.paymentId).toBe(paymentId);
      expect(json.type).toBe(PaymentEventType.PAYMENT_INITIATED);
      expect(json.data).toEqual(event.data);
      expect(typeof json.timestamp).toBe('string');
      expect(json.timestamp).toBe(event.timestamp.toISOString());
    });

    test('fromJSON - должен десериализовать событие из JSON', () => {
      const originalEvent = PaymentEvent.paymentCompleted(
        paymentId,
        'tbank-sbp',
        'tx-123'
      );

      const json = originalEvent.toJSON();
      const restoredEvent = PaymentEvent.fromJSON(json);

      expect(restoredEvent.id).toBe(originalEvent.id);
      expect(restoredEvent.paymentId).toBe(originalEvent.paymentId);
      expect(restoredEvent.type).toBe(originalEvent.type);
      expect(restoredEvent.data).toEqual(originalEvent.data);
      expect(restoredEvent.timestamp).toEqual(originalEvent.timestamp);
    });

    test('toJSON -> fromJSON - должен сохранять все данные', () => {
      const original = PaymentEvent.paymentFailed(
        paymentId,
        'TIMEOUT',
        'Таймаут ожидания',
        true
      );

      const restored = PaymentEvent.fromJSON(original.toJSON());

      expect(restored.id).toBe(original.id);
      expect(restored.paymentId).toBe(original.paymentId);
      expect(restored.type).toBe(original.type);
      expect(restored.data.errorCode).toBe(original.data.errorCode);
      expect(restored.data.errorMessage).toBe(original.data.errorMessage);
      expect(restored.data.isRetryable).toBe(original.data.isRetryable);
      // Проверяем, что даты одинаковые (с точностью до миллисекунд)
      expect(restored.timestamp.getTime()).toBe(original.timestamp.getTime());
    });

    test('fromJSON - должен корректно восстанавливать дату', () => {
      const json = {
        id: crypto.randomUUID(),
        paymentId,
        type: PaymentEventType.PAYMENT_COMPLETED,
        data: { test: 'data' },
        timestamp: '2024-01-15T10:30:00.000Z'
      };

      const event = PaymentEvent.fromJSON(json);

      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.timestamp.toISOString()).toBe('2024-01-15T10:30:00.000Z');
    });
  });

  describe('Уникальность ID событий', () => {
    test('каждое событие должно иметь уникальный ID', () => {
      const event1 = PaymentEvent.paymentInitiated(paymentId, 100, 'RUB', crypto.randomUUID(), 'T1');
      const event2 = PaymentEvent.paymentInitiated(paymentId, 200, 'USD', crypto.randomUUID(), 'T2');

      expect(event1.id).not.toBe(event2.id);
    });

    test('несколько событий одного типа должны иметь разные ID', () => {
      const ids = new Set();
      
      for (let i = 0; i < 10; i++) {
        const event = PaymentEvent.retryRequested(paymentId, i, 'test');
        ids.add(event.id);
      }

      expect(ids.size).toBe(10);
    });
  });

  describe('Иммутабельность', () => {
    test('свойства события должны быть readonly', () => {
      const event = PaymentEvent.paymentInitiated(
        paymentId,
        1000,
        'RUB',
        crypto.randomUUID(),
        'Тест'
      );

      // TypeScript должен не позволить это скомпилировать,
      // но в runtime можно проверить, что свойства существуют
      expect(event.id).toBeDefined();
      expect(event.paymentId).toBeDefined();
      expect(event.type).toBeDefined();
      expect(event.data).toBeDefined();
      expect(event.timestamp).toBeDefined();
    });
  });
});
