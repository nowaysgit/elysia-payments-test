import { PaymentStatus } from '../../entities/payment';

/**
 * Результат создания платежа у провайдера
 */
export interface ProviderPaymentResult {
  /** ID транзакции у провайдера */
  providerTransactionId: string;
  /** URL для оплаты */
  paymentUrl: string;
  /** Время истечения ссылки */
  expiresAt: Date;
  /** Дополнительные данные провайдера */
  metadata?: Record<string, any>;
}

/**
 * Результат проверки статуса у провайдера
 */
export interface ProviderStatusResult {
  status: PaymentStatus;
  providerTransactionId: string;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

/**
 * Параметры для создания платежа
 */
export interface CreatePaymentParams {
  paymentId: string;
  amount: number;
  currency: string;
  description: string;
  merchantId: string;
  callbackUrl?: string;
  successUrl?: string;
  failUrl?: string;
}

/**
 * Интерфейс платёжного провайдера
 * 
 * Методы могут выбрасывать:
 * @throws {ExternalServiceError} При ошибках связи с провайдером
 * @throws {ValidationError} При невалидных параметрах
 * @throws {NotFoundError} При отсутствии платежа
 */
export interface PaymentProvider {
  /** Уникальный идентификатор провайдера */
  readonly id: string;
  
  /** Название провайдера */
  readonly name: string;
  
  /** Поддерживаемые валюты */
  readonly supportedCurrencies: string[];

  /**
   * Создание платежа у провайдера
   */
  createPayment(params: CreatePaymentParams): Promise<ProviderPaymentResult>;

  /**
   * Проверка статуса платежа у провайдера
   */
  checkPaymentStatus(providerTransactionId: string): Promise<ProviderStatusResult>;

  /**
   * Отмена платежа у провайдера
   */
  cancelPayment(providerTransactionId: string, reason: string): Promise<void>;

  /**
   * Проверка поддержки валюты
   */
  supportsCurrency(currency: string): boolean;

  /**
   * Маппинг статуса провайдера к внутреннему статусу
   * @param providerStatus - статус от провайдера (любая строка)
   * @returns внутренний статус
   * @throws {ValidationError} Если статус провайдера не распознан
   */
  mapStatus(providerStatus: string): PaymentStatus;
}
