import { describe, test, expect, beforeEach } from 'bun:test';
import { Store } from '../../src/infrastructure/store';
import { Payment, PaymentStatus } from '../../src/entities/payment';
import { PaymentEvent } from '../../src/entities/payment-event';
import { PaymentService } from '../../src/payments/payments.service';
import { createServer } from '../../src/http/server';
import { PaymentProviderManager } from '../../src/payments/providers/payment-provider.manager';
import { PaymentProvider, CreatePaymentParams, ProviderPaymentResult, ProviderStatusResult } from '../../src/payments/providers/payment-provider.interface';
import { ValidationError } from '../../src/http/errors.types';

// Mock провайдер для тестов
class MockPaymentProvider implements PaymentProvider {
  readonly id = 'mock-provider';
  readonly name = 'Mock Provider';
  readonly supportedCurrencies = ['RUB', 'USD', 'EUR'];

  async createPayment(params: CreatePaymentParams): Promise<ProviderPaymentResult> {
    return {
      providerTransactionId: `mock-tx-${params.paymentId}`,
      paymentUrl: `http://mock-provider.com/pay/${params.paymentId}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    };
  }

  async checkPaymentStatus(providerTransactionId: string): Promise<ProviderStatusResult> {
    return {
      status: PaymentStatus.COMPLETED,
      providerTransactionId
    };
  }

  async cancelPayment(providerTransactionId: string, reason: string): Promise<void> {
    // Успешная отмена
  }

  supportsCurrency(currency: string): boolean {
    return this.supportedCurrencies.includes(currency.toUpperCase());
  }

  mapStatus(providerStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'pending': PaymentStatus.AWAITING_PAYMENT,
      'processing': PaymentStatus.PROCESSING,
      'completed': PaymentStatus.COMPLETED,
      'failed': PaymentStatus.FAILED,
      'cancelled': PaymentStatus.CANCELLED
    };
    const status = statusMap[providerStatus.toLowerCase()];
    if (!status) {
      throw new ValidationError(
        `Неизвестный статус провайдера: ${providerStatus}`,
        { providerStatus, provider: this.id }
      );
    }
    return status;
  }
}

describe('PaymentsController - Валидация', () => {
  let paymentStore: Store<Payment>;
  let eventStore: Store<PaymentEvent>;
  let providerManager: PaymentProviderManager;
  let service: PaymentService;
  let app: any;

  beforeEach(async () => {
    paymentStore = new Store(Payment, './test-controller-payments.json');
    eventStore = new Store(PaymentEvent, './test-controller-events.json');
    
    await Promise.all([
      paymentStore.initialize(),
      eventStore.initialize()
    ]);
    
    paymentStore.clear();
    eventStore.clear();

    // Настройка провайдера
    providerManager = new PaymentProviderManager();
    providerManager.register(new MockPaymentProvider(), true);
    
    service = new PaymentService(
      paymentStore, 
      eventStore, 
      providerManager,
      'https://payment.example.com'
    );
    app = createServer(service);
  });

  test('должен вернуть ошибку при отрицательной сумме', async () => {
    const response = await app.handle(
      new Request('http://localhost/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: -100,
          currency: 'RUB',
          merchantId: crypto.randomUUID(),
          description: 'Тест'
        })
      })
    );

    expect(response.status).toBe(422); // Elysia использует 422 для валидационных ошибок
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('должен вернуть ошибку при неподдерживаемой валюте', async () => {
    const response = await app.handle(
      new Request('http://localhost/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 1000,
          currency: 'INVALID',
          merchantId: crypto.randomUUID(),
          description: 'Тест'
        })
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('должен вернуть ошибку при некорректном UUID мерчанта', async () => {
    const response = await app.handle(
      new Request('http://localhost/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 1000,
          currency: 'RUB',
          merchantId: 'not-a-uuid',
          description: 'Тест'
        })
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('должен вернуть ошибку при некорректном UUID платежа в параметре', async () => {
    const response = await app.handle(
      new Request('http://localhost/api/payments/not-a-uuid', {
        method: 'GET'
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('должен успешно создать платёж с валидными данными', async () => {
    const response = await app.handle(
      new Request('http://localhost/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 1000,
          currency: 'RUB',
          merchantId: crypto.randomUUID(),
          description: 'Тестовый платёж'
        })
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('paymentId');
    expect(body.data).toHaveProperty('paymentUrl');
  });

  test('должен валидировать webhook данные', async () => {
    const response = await app.handle(
      new Request('http://localhost/api/payments/webhook/mock-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: 'not-a-uuid',
          providerTransactionId: 'tx-123',
          status: 'success'
        })
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('должен валидировать статус в webhook', async () => {
    // Сначала создаём платёж
    const createResponse = await app.handle(
      new Request('http://localhost/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 1000,
          currency: 'RUB',
          merchantId: crypto.randomUUID(),
          description: 'Тест'
        })
      })
    );
    const createBody = await createResponse.json();
    const paymentId = createBody.data.paymentId;

    // Пытаемся отправить webhook с неизвестным статусом
    const response = await app.handle(
      new Request('http://localhost/api/payments/webhook/mock-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId,
          providerTransactionId: 'tx-123',
          status: 'invalid-unknown-status'
        })
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('Неизвестный статус провайдера');
  });

  test('должен валидировать providerId в URL webhook', async () => {
    const response = await app.handle(
      new Request('http://localhost/api/payments/webhook/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: crypto.randomUUID(),
          providerTransactionId: 'tx-123',
          status: 'success'
        })
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});
