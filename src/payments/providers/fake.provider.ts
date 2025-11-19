import { 
  PaymentProvider, 
  CreatePaymentParams, 
  ProviderPaymentResult,
  ProviderStatusResult
} from './payment-provider.interface';
import { PaymentStatus } from '../../entities/payment';
import { ValidationError } from '../../http/errors.types';

/**
 * Конфигурация Fake провайдера
 */
export interface FakeProviderConfig {
  /** Автоматически подтверждать платежи через N мс (0 = не подтверждать) */
  autoConfirmDelay?: number;
  /** Вероятность успеха платежа (0-1) */
  successRate?: number;
  /** Поддерживаемые валюты */
  supportedCurrencies?: string[];
}

/**
 * Fake провайдер для тестирования
 * Не делает внешних запросов, хранит все в памяти
 */
export class FakeProvider implements PaymentProvider {
  readonly id = 'fake';
  readonly name = 'Fake Payment Provider';
  readonly supportedCurrencies: string[];

  private readonly autoConfirmDelay: number;
  private readonly successRate: number;
  
  // Хранилище платежей в памяти
  private payments = new Map<string, {
    status: PaymentStatus;
    paymentId: string;
    amount: number;
    createdAt: Date;
    confirmedAt?: Date;
    errorCode?: string;
  }>();

  constructor(config: FakeProviderConfig = {}) {
    this.autoConfirmDelay = config.autoConfirmDelay ?? 0;
    this.successRate = config.successRate ?? 1.0;
    this.supportedCurrencies = config.supportedCurrencies ?? ['RUB', 'USD', 'EUR'];
  }

  /**
   * Создание платежа
   */
  async createPayment(params: CreatePaymentParams): Promise<ProviderPaymentResult> {
    // Генерируем уникальный ID транзакции
    const providerTransactionId = `fake_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Определяем, будет ли платеж успешным
    const willSucceed = Math.random() < this.successRate;
    const initialStatus = willSucceed 
      ? PaymentStatus.AWAITING_PAYMENT
      : PaymentStatus.FAILED;

    // Сохраняем платеж
    this.payments.set(providerTransactionId, {
      status: initialStatus,
      paymentId: params.paymentId,
      amount: params.amount,
      createdAt: new Date(),
      errorCode: willSucceed ? undefined : 'FAKE_ERROR'
    });

    // Автоматическое подтверждение
    if (this.autoConfirmDelay > 0 && willSucceed) {
      setTimeout(() => {
        const payment = this.payments.get(providerTransactionId);
        if (payment && payment.status === PaymentStatus.AWAITING_PAYMENT) {
          payment.status = PaymentStatus.COMPLETED;
          payment.confirmedAt = new Date();
        }
      }, this.autoConfirmDelay);
    }

    return {
      providerTransactionId,
      paymentUrl: `https://fake-payment.local/pay/${providerTransactionId}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 минут
      metadata: {
        fake: true,
        willSucceed,
        autoConfirm: this.autoConfirmDelay > 0
      }
    };
  }

  /**
   * Проверка статуса платежа
   */
  async checkPaymentStatus(providerTransactionId: string): Promise<ProviderStatusResult> {
    const payment = this.payments.get(providerTransactionId);

    if (!payment) {
      return {
        status: PaymentStatus.FAILED,
        providerTransactionId,
        errorCode: 'PAYMENT_NOT_FOUND',
        metadata: { fake: true }
      };
    }

    return {
      status: payment.status,
      providerTransactionId,
      errorCode: payment.errorCode,
      metadata: {
        fake: true,
        createdAt: payment.createdAt.toISOString(),
        confirmedAt: payment.confirmedAt?.toISOString()
      }
    };
  }

  /**
   * Отмена платежа
   */
  async cancelPayment(providerTransactionId: string, reason: string): Promise<void> {
    const payment = this.payments.get(providerTransactionId);

    if (!payment) {
      throw new Error(`Payment ${providerTransactionId} not found`);
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      throw new Error(`Cannot cancel completed payment ${providerTransactionId}`);
    }

    payment.status = PaymentStatus.CANCELLED;
  }

  /**
   * Проверка поддержки валюты
   */
  supportsCurrency(currency: string): boolean {
    return this.supportedCurrencies.includes(currency.toUpperCase());
  }

	/**
	 * Маппинг статуса к внутреннему статусу
	 * Fake провайдер использует те же статусы, что и система
	 */
	mapStatus(providerStatus: string): PaymentStatus {
		const statusMap: Record<string, PaymentStatus> = {
			initiated: PaymentStatus.INITIATED,
			pending: PaymentStatus.AWAITING_PAYMENT,
			awaiting_payment: PaymentStatus.AWAITING_PAYMENT,
			processing: PaymentStatus.PROCESSING,
			completed: PaymentStatus.COMPLETED,
			failed: PaymentStatus.FAILED,
			cancelled: PaymentStatus.CANCELLED,
			// Поддержка алиасов
			success: PaymentStatus.COMPLETED,
			error: PaymentStatus.FAILED,
			rejected: PaymentStatus.FAILED,
		};

		const status = statusMap[providerStatus.toLowerCase()];
		if (!status) {
			throw new ValidationError(
				`Неизвестный статус провайдера: ${providerStatus}`,
				{ providerStatus, provider: this.id }
			);
		}
		return status;
	}  /**
   * Утилиты для тестирования
   */

  /**
   * Вручную подтвердить платеж (для тестов)
   */
  confirmPayment(providerTransactionId: string): void {
    const payment = this.payments.get(providerTransactionId);
    if (payment && payment.status === PaymentStatus.AWAITING_PAYMENT) {
      payment.status = PaymentStatus.COMPLETED;
      payment.confirmedAt = new Date();
    }
  }

  /**
   * Вручную отклонить платеж (для тестов)
   */
  failPayment(providerTransactionId: string, errorCode: string = 'FAKE_ERROR'): void {
    const payment = this.payments.get(providerTransactionId);
    if (payment && payment.status === PaymentStatus.AWAITING_PAYMENT) {
      payment.status = PaymentStatus.FAILED;
      payment.errorCode = errorCode;
    }
  }

  /**
   * Очистить все платежи (для тестов)
   */
  clearPayments(): void {
    this.payments.clear();
  }

  /**
   * Получить все платежи (для тестов)
   */
  getAllPayments() {
    return Array.from(this.payments.entries()).map(([id, payment]) => ({
      providerTransactionId: id,
      ...payment
    }));
  }

  /**
   * Симуляция отправки webhook (для тестов)
   * Возвращает объект, который можно отправить на /api/payments/webhook/fake
   */
  simulateWebhook(
    providerTransactionId: string,
    status: PaymentStatus
  ): {
    paymentId: string;
    providerTransactionId: string;
    status: string;
    errorCode?: string;
    errorMessage?: string;
  } | null {
    const payment = this.payments.get(providerTransactionId);
    if (!payment) {
      return null;
    }

    return {
      paymentId: payment.paymentId,
      providerTransactionId,
      status,
      errorCode: status === PaymentStatus.FAILED ? 'FAKE_ERROR' : undefined,
      errorMessage: status === PaymentStatus.FAILED ? 'Simulated failure' : undefined
    };
  }
}
