/**
 * Статусы платежа
 */
export enum PaymentStatus {
  INITIATED = 'initiated',
  AWAITING_PAYMENT = 'awaiting_payment',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Сущность платежа
 * Хранит текущее состояние платежа
 */
export class Payment {
  constructor(
    public readonly id: string,
    public status: PaymentStatus,
    public readonly amount: number,
    public readonly currency: string,
    public readonly merchantId: string,
    public readonly description: string,
    public readonly providerId: string,
    public paymentUrl?: string,
    public providerTransactionId?: string,
    public retryCount: number = 0,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}

  /**
   * Создание нового платежа
   */
  static create(
    id: string,
    amount: number,
    currency: string,
    merchantId: string,
    description: string,
    providerId: string
  ): Payment {
    return new Payment(
      id,
      PaymentStatus.INITIATED,
      amount,
      currency,
      merchantId,
      description,
      providerId
    );
  }

  /**
   * Проверка возможности перехода в новый статус
   */
  canTransitionTo(newStatus: PaymentStatus): boolean {
    const transitions: Record<PaymentStatus, PaymentStatus[]> = {
      [PaymentStatus.INITIATED]: [PaymentStatus.AWAITING_PAYMENT, PaymentStatus.FAILED],
      [PaymentStatus.AWAITING_PAYMENT]: [PaymentStatus.PROCESSING, PaymentStatus.CANCELLED, PaymentStatus.FAILED],
      [PaymentStatus.PROCESSING]: [PaymentStatus.COMPLETED, PaymentStatus.FAILED],
      [PaymentStatus.COMPLETED]: [],
      [PaymentStatus.FAILED]: [PaymentStatus.AWAITING_PAYMENT],
      [PaymentStatus.CANCELLED]: []
    };

    return transitions[this.status].includes(newStatus);
  }

  /**
   * Обновление статуса
   */
  updateStatus(newStatus: PaymentStatus): void {
    this.status = newStatus;
    this.updatedAt = new Date();
  }

  /**
   * Установка ссылки для оплаты
   */
  setPaymentUrl(url: string): void {
    this.paymentUrl = url;
    this.updatedAt = new Date();
  }

  /**
   * Установка ID транзакции провайдера
   */
  setProviderTransactionId(id: string): void {
    this.providerTransactionId = id;
    this.updatedAt = new Date();
  }

  /**
   * Увеличение счётчика попыток
   */
  incrementRetryCount(): void {
    this.retryCount++;
    this.updatedAt = new Date();
  }

  /**
   * Проверка, является ли платёж финальным (завершён или отменён)
   */
  isFinal(): boolean {
    return this.status === PaymentStatus.COMPLETED || 
           this.status === PaymentStatus.CANCELLED;
  }

  /**
   * Сериализация для сохранения
   */
  toJSON() {
    return {
      id: this.id,
      status: this.status,
      amount: this.amount,
      currency: this.currency,
      merchantId: this.merchantId,
      description: this.description,
      providerId: this.providerId,
      paymentUrl: this.paymentUrl,
      providerTransactionId: this.providerTransactionId,
      retryCount: this.retryCount,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString()
    };
  }

  /**
   * Десериализация из JSON
   */
  static fromJSON(json: any): Payment {
    return new Payment(
      json.id,
      json.status,
      json.amount,
      json.currency,
      json.merchantId,
      json.description,
      json.providerId,
      json.paymentUrl,
      json.providerTransactionId,
      json.retryCount,
      new Date(json.createdAt),
      new Date(json.updatedAt)
    );
  }
}
