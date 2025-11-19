import { describe, test, expect, beforeEach } from 'bun:test';
import { Payment, PaymentStatus } from '../../src/entities/payment';

describe('Payment Entity', () => {
  test('должен создать платёж с корректными данными', () => {
    const payment = Payment.create(
      'test-id',
      1000,
      'RUB',
      'merchant-123',
      'Тестовый платёж',
      'test-provider'
    );

    expect(payment.id).toBe('test-id');
    expect(payment.status).toBe(PaymentStatus.INITIATED);
    expect(payment.amount).toBe(1000);
    expect(payment.currency).toBe('RUB');
    expect(payment.merchantId).toBe('merchant-123');
    expect(payment.description).toBe('Тестовый платёж');
    expect(payment.providerId).toBe('test-provider');
    expect(payment.retryCount).toBe(0);
  });

  test('должен правильно проверять допустимые переходы статусов', () => {
    const payment = Payment.create(
      'test-id',
      1000,
      'RUB',
      'merchant-123',
      'Тестовый платёж',
      'test-provider'
    );

    // Из INITIATED можно перейти в AWAITING_PAYMENT
    expect(payment.canTransitionTo(PaymentStatus.AWAITING_PAYMENT)).toBe(true);
    // Из INITIATED нельзя перейти в COMPLETED
    expect(payment.canTransitionTo(PaymentStatus.COMPLETED)).toBe(false);
  });

  test('должен обновить статус и время обновления', () => {
    const payment = Payment.create(
      'test-id',
      1000,
      'RUB',
      'merchant-123',
      'Тестовый платёж',
      'test-provider'
    );

    const oldUpdatedAt = payment.updatedAt;
    
    // Небольшая задержка чтобы время обновилось
    setTimeout(() => {
      payment.updateStatus(PaymentStatus.AWAITING_PAYMENT);
      
      expect(payment.status).toBe(PaymentStatus.AWAITING_PAYMENT);
      expect(payment.updatedAt.getTime()).toBeGreaterThan(oldUpdatedAt.getTime());
    }, 10);
  });

  test('должен установить ссылку для оплаты', () => {
    const payment = Payment.create(
      'test-id',
      1000,
      'RUB',
      'merchant-123',
      'Тестовый платёж',
      'test-provider'
    );

    payment.setPaymentUrl('http://localhost:3000/pay/test-id');
    
    expect(payment.paymentUrl).toBe('http://localhost:3000/pay/test-id');
  });

  test('должен увеличить счётчик повторных попыток', () => {
    const payment = Payment.create(
      'test-id',
      1000,
      'RUB',
      'merchant-123',
      'Тестовый платёж',
      'test-provider'
    );

    expect(payment.retryCount).toBe(0);
    
    payment.incrementRetryCount();
    expect(payment.retryCount).toBe(1);
    
    payment.incrementRetryCount();
    expect(payment.retryCount).toBe(2);
  });

  test('должен правильно определять финальные статусы', () => {
    const payment = Payment.create(
      'test-id',
      1000,
      'RUB',
      'merchant-123',
      'Тестовый платёж',
      'test-provider'
    );

    expect(payment.isFinal()).toBe(false);
    
    payment.updateStatus(PaymentStatus.COMPLETED);
    expect(payment.isFinal()).toBe(true);
    
    payment.updateStatus(PaymentStatus.CANCELLED);
    expect(payment.isFinal()).toBe(true);
    
    payment.updateStatus(PaymentStatus.FAILED);
    expect(payment.isFinal()).toBe(false);
  });

  test('должен сериализовать и десериализовать платёж', () => {
    const payment = Payment.create(
      'test-id',
      1000,
      'RUB',
      'merchant-123',
      'Тестовый платёж',
      'test-provider'
    );
    
    payment.setPaymentUrl('http://localhost:3000/pay/test-id');
    payment.updateStatus(PaymentStatus.AWAITING_PAYMENT);

    const json = payment.toJSON();
    const restoredPayment = Payment.fromJSON(json);

    expect(restoredPayment.id).toBe(payment.id);
    expect(restoredPayment.status).toBe(payment.status);
    expect(restoredPayment.amount).toBe(payment.amount);
    expect(restoredPayment.currency).toBe(payment.currency);
    expect(restoredPayment.providerId).toBe(payment.providerId);
    expect(restoredPayment.paymentUrl).toBe(payment.paymentUrl);
  });
});
