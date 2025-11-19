/**
 * Типы событий платежа
 */
export enum PaymentEventType {
  PAYMENT_INITIATED = 'payment_initiated',
  PAYMENT_LINK_GENERATED = 'payment_link_generated',
  CUSTOMER_REDIRECTED = 'customer_redirected',
  PAYMENT_PROCESSING_STARTED = 'payment_processing_started',
  PAYMENT_COMPLETED = 'payment_completed',
  PAYMENT_FAILED = 'payment_failed',
  PAYMENT_RETRY_REQUESTED = 'payment_retry_requested',
  PAYMENT_CANCELLED = 'payment_cancelled'
}

/**
 * Сущность события платежа
 * Иммутабельная запись о том, что произошло с платежом
 */
export class PaymentEvent {
  constructor(
    public readonly id: string,              // ID события
    public readonly paymentId: string,       // ID платежа
    public readonly type: PaymentEventType,  // Тип события
    public readonly data: Record<string, any>, // Данные события
    public readonly timestamp: Date          // Время события
  ) {}

  /**
   * Создать событие инициализации платежа
   */
  static paymentInitiated(
    paymentId: string,
    amount: number,
    currency: string,
    merchantId: string,
    description: string
  ): PaymentEvent {
    return new PaymentEvent(
      crypto.randomUUID(),
      paymentId,
      PaymentEventType.PAYMENT_INITIATED,
      { amount, currency, merchantId, description },
      new Date()
    );
  }

  /**
   * Создать событие генерации ссылки
   */
  static paymentLinkGenerated(
    paymentId: string,
    paymentUrl: string,
    expiresAt: Date
  ): PaymentEvent {
    return new PaymentEvent(
      crypto.randomUUID(),
      paymentId,
      PaymentEventType.PAYMENT_LINK_GENERATED,
      { paymentUrl, expiresAt },
      new Date()
    );
  }

  /**
   * Создать событие перехода клиента
   */
  static customerRedirected(
    paymentId: string,
    userAgent?: string,
    ipAddress?: string
  ): PaymentEvent {
    return new PaymentEvent(
      crypto.randomUUID(),
      paymentId,
      PaymentEventType.CUSTOMER_REDIRECTED,
      { userAgent, ipAddress },
      new Date()
    );
  }

  /**
   * Создать событие начала обработки
   */
  static processingStarted(
    paymentId: string,
    providerId: string,
    providerTransactionId: string
  ): PaymentEvent {
    return new PaymentEvent(
      crypto.randomUUID(),
      paymentId,
      PaymentEventType.PAYMENT_PROCESSING_STARTED,
      { providerId, providerTransactionId },
      new Date()
    );
  }

  /**
   * Создать событие завершения платежа
   */
  static paymentCompleted(
    paymentId: string,
    providerId: string,
    providerTransactionId: string
  ): PaymentEvent {
    return new PaymentEvent(
      crypto.randomUUID(),
      paymentId,
      PaymentEventType.PAYMENT_COMPLETED,
      { providerId, providerTransactionId, completedAt: new Date() },
      new Date()
    );
  }

  /**
   * Создать событие ошибки
   */
  static paymentFailed(
    paymentId: string,
    errorCode: string,
    errorMessage: string,
    isRetryable: boolean
  ): PaymentEvent {
    return new PaymentEvent(
      crypto.randomUUID(),
      paymentId,
      PaymentEventType.PAYMENT_FAILED,
      { errorCode, errorMessage, isRetryable },
      new Date()
    );
  }

  /**
   * Создать событие повторной попытки
   */
  static retryRequested(
    paymentId: string,
    attemptNumber: number,
    reason: string
  ): PaymentEvent {
    return new PaymentEvent(
      crypto.randomUUID(),
      paymentId,
      PaymentEventType.PAYMENT_RETRY_REQUESTED,
      { attemptNumber, reason },
      new Date()
    );
  }

  /**
   * Создать событие отмены
   */
  static paymentCancelled(
    paymentId: string,
    reason: string,
    cancelledBy: string
  ): PaymentEvent {
    return new PaymentEvent(
      crypto.randomUUID(),
      paymentId,
      PaymentEventType.PAYMENT_CANCELLED,
      { reason, cancelledBy },
      new Date()
    );
  }

  /**
   * Сериализация для сохранения в JSON
   */
  toJSON() {
    return {
      id: this.id,
      paymentId: this.paymentId,
      type: this.type,
      data: this.data,
      timestamp: this.timestamp.toISOString()
    };
  }

  /**
   * Десериализация из JSON
   */
  static fromJSON(json: any): PaymentEvent {
    return new PaymentEvent(
      json.id,
      json.paymentId,
      json.type,
      json.data,
      new Date(json.timestamp)
    );
  }
}
