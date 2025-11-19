import { describe, test, expect, beforeEach } from 'bun:test';
import { PaymentService } from '../../src/payments/payments.service';
import { Store } from '../../src/infrastructure/store';
import { Payment, PaymentStatus } from '../../src/entities/payment';
import { PaymentEvent } from '../../src/entities/payment-event';
import { PaymentProviderManager } from '../../src/payments/providers/payment-provider.manager';
import { PaymentProvider, CreatePaymentParams, ProviderPaymentResult, ProviderStatusResult } from '../../src/payments/providers/payment-provider.interface';
import { ValidationError, InvalidStateError } from '../../src/http/errors.types';

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
      'awaiting_payment': PaymentStatus.AWAITING_PAYMENT,
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

describe('PaymentService', () => {
  let paymentStore: Store<Payment>;
  let eventStore: Store<PaymentEvent>;
  let providerManager: PaymentProviderManager;
  let service: PaymentService;

  beforeEach(async () => {
    paymentStore = new Store(Payment, './test-service-payments.json');
    eventStore = new Store(PaymentEvent, './test-service-events.json');
    
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
      'http://localhost:3000'
    );
  });

  test('должен создать платёж и сгенерировать ссылку', async () => {
    const result = await service.createPayment({
      amount: 1000,
      currency: 'RUB',
      merchantId: crypto.randomUUID(),
      description: 'Тестовый платёж'
    });

    expect(result.paymentId).toBeDefined();
    expect(result.paymentUrl).toContain('http://mock-provider.com/pay/');
    
    // Проверка что платёж сохранён
    const payment = paymentStore.get(result.paymentId);
    expect(payment).not.toBeNull();
    expect(payment?.status).toBe(PaymentStatus.AWAITING_PAYMENT);
    expect(payment?.providerId).toBe('mock-provider');
    
    // Проверка что созданы события
    const events = eventStore.find(e => (e as any).paymentId === result.paymentId);
    expect(events.length).toBe(2); // INITIATED + LINK_GENERATED
  });

  test('должен обработать успешный webhook', async () => {
    // Создаём платёж
    const createResult = await service.createPayment({
      amount: 1000,
      currency: 'RUB',
      merchantId: crypto.randomUUID(),
      description: 'Тестовый платёж'
    });

    const paymentId = createResult.paymentId;
    
    // Сначала переводим в processing
    await service.processWebhook({
      paymentId,
      providerId: 'mock-provider',
      providerTransactionId: 'tx-123',
      status: 'processing'
    });

    // Затем завершаем
    await service.processWebhook({
      paymentId,
      providerId: 'mock-provider',
      providerTransactionId: 'tx-123',
      status: 'completed'
    });

    // Проверяем что статус обновился
    const payment = paymentStore.get(paymentId);
    expect(payment?.status).toBe(PaymentStatus.COMPLETED);
    
    // Проверяем события
    const events = eventStore.find(e => (e as any).paymentId === paymentId);
    expect(events.length).toBe(4); // INITIATED + LINK_GENERATED + PROCESSING + COMPLETED
  });

  test('должен обработать неудачный webhook', async () => {
    // Создаём платёж
    const createResult = await service.createPayment({
      amount: 1000,
      currency: 'RUB',
      merchantId: crypto.randomUUID(),
      description: 'Тестовый платёж'
    });

    const paymentId = createResult.paymentId;
    
    // Обрабатываем webhook с ошибкой
    await service.processWebhook({
      paymentId,
      providerId: 'mock-provider',
      providerTransactionId: 'tx-123',
      status: 'failed',
      errorCode: 'INSUFFICIENT_FUNDS',
      errorMessage: 'Недостаточно средств'
    });

    // Проверяем что статус обновился
    const payment = paymentStore.get(paymentId);
    expect(payment?.status).toBe(PaymentStatus.FAILED);
  });

  test('должен выполнить повторную попытку оплаты', async () => {
    // Создаём платёж
    const createResult = await service.createPayment({
      amount: 1000,
      currency: 'RUB',
      merchantId: crypto.randomUUID(),
      description: 'Тестовый платёж'
    });

    const paymentId = createResult.paymentId;
    
    // Делаем платёж неудачным
    await service.processWebhook({
      paymentId,
      providerId: 'mock-provider',
      providerTransactionId: 'tx-123',
      status: 'failed',
      errorCode: 'TIMEOUT',
      errorMessage: 'Таймаут'
    });
    
    // Повторная попытка
    const retryResult = await service.retryPayment(paymentId, 'Таймаут провайдера');
    
    expect(retryResult.paymentUrl).toBeDefined();
    
    // Проверяем что статус вернулся в AWAITING_PAYMENT
    const payment = paymentStore.get(paymentId);
    expect(payment?.status).toBe(PaymentStatus.AWAITING_PAYMENT);
    expect(payment?.retryCount).toBe(1);
  });

  test('должен запретить более 3 попыток', async () => {
    // Создаём платёж
    const createResult = await service.createPayment({
      amount: 1000,
      currency: 'RUB',
      merchantId: crypto.randomUUID(),
      description: 'Тестовый платёж'
    });

    const paymentId = createResult.paymentId;
    
    // Делаем платёж неудачным
    await service.processWebhook({
      paymentId,
      providerId: 'mock-provider',
      providerTransactionId: 'tx-123',
      status: 'failed'
    });
    
    // 3 успешных retry
    await service.retryPayment(paymentId, 'Попытка 1');
    await service.processWebhook({ paymentId, providerId: 'mock-provider', providerTransactionId: 'tx', status: 'failed' });
    
    await service.retryPayment(paymentId, 'Попытка 2');
    await service.processWebhook({ paymentId, providerId: 'mock-provider', providerTransactionId: 'tx', status: 'failed' });
    
    await service.retryPayment(paymentId, 'Попытка 3');
    await service.processWebhook({ paymentId, providerId: 'mock-provider', providerTransactionId: 'tx', status: 'failed' });
    
    // 4-я попытка должна быть отклонена
    expect(async () => {
      await service.retryPayment(paymentId, 'Попытка 4');
    }).toThrow(ValidationError);
  });

  test('должен вернуть ошибку для несуществующего платежа', async () => {
    expect(async () => {
      await service.getPayment('non-existent-id');
    }).toThrow();
  });

  test('должен отменить платёж', async () => {
    // Создаём платёж
    const createResult = await service.createPayment({
      amount: 1000,
      currency: 'RUB',
      merchantId: crypto.randomUUID(),
      description: 'Тестовый платёж'
    });

    const paymentId = createResult.paymentId;
    
    // Отменяем платёж
    await service.cancelPayment(
      paymentId,
      'Клиент отменил заказ',
      'customer'
    );
    
    // Проверяем статус
    const payment = paymentStore.get(paymentId);
    expect(payment?.status).toBe(PaymentStatus.CANCELLED);
  });
});
