import { Payment, PaymentStatus } from '../entities/payment';
import { PaymentEvent } from '../entities/payment-event';
import { Store } from '../infrastructure/store';
import { ValidationError, InvalidStateError, NotFoundError } from '../http/errors.types';
import { PaymentProviderManager } from './providers/payment-provider.manager';

/**
 * Сервис управления платежами
 * Содержит всю бизнес-логику работы с платежами
 */
export class PaymentService {
  constructor(
    private readonly paymentStore: Store<Payment>,
    private readonly eventStore: Store<PaymentEvent>,
    private readonly providerManager: PaymentProviderManager,
    private readonly callbackBaseUrl: string
  ) {}

  /**
   * Создание нового платежа
   */
  async createPayment(params: {
    amount: number;
    currency: string;
    merchantId: string;
    description: string;
    providerId?: string;
  }): Promise<{ paymentId: string; paymentUrl: string }> {
    // Определение провайдера
    const provider = params.providerId
      ? this.providerManager.getProvider(params.providerId)
      : this.providerManager.getDefaultProvider();

    // Проверка поддержки валюты
    if (!provider.supportsCurrency(params.currency)) {
      throw new ValidationError(
        `Провайдер ${provider.name} не поддерживает валюту ${params.currency}`,
        { 
          providerId: provider.id,
          currency: params.currency,
          supportedCurrencies: provider.supportedCurrencies
        }
      );
    }

    // Создание платежа
    const paymentId = crypto.randomUUID();
    const payment = Payment.create(
      paymentId,
      params.amount,
      params.currency,
      params.merchantId,
      params.description,
      provider.id
    );

    // Сохранение платежа
    this.paymentStore.save(payment);

    // Создание события инициализации
    const initiatedEvent = PaymentEvent.paymentInitiated(
      paymentId,
      params.amount,
      params.currency,
      params.merchantId,
      params.description
    );
    this.eventStore.save(initiatedEvent);

    // Создание платежа у провайдера
    try {
      const callbackUrl = `${this.callbackBaseUrl}/api/payments/webhook/${provider.id}`;
      const providerPayment = await provider.createPayment({
        paymentId,
        amount: params.amount,
        currency: params.currency,
        description: params.description,
        merchantId: params.merchantId,
        callbackUrl
      });

      // Обновление платежа с данными от провайдера
      payment.setPaymentUrl(providerPayment.paymentUrl);
      payment.setProviderTransactionId(providerPayment.providerTransactionId);
      payment.updateStatus(PaymentStatus.AWAITING_PAYMENT);
      this.paymentStore.save(payment);

      // Создание события генерации ссылки
      const linkEvent = PaymentEvent.paymentLinkGenerated(
        paymentId,
        providerPayment.paymentUrl,
        providerPayment.expiresAt
      );
      this.eventStore.save(linkEvent);

      return { 
        paymentId, 
        paymentUrl: providerPayment.paymentUrl 
      };
    } catch (error) {
      // Платёж не удалось создать у провайдера
      payment.updateStatus(PaymentStatus.FAILED);
      this.paymentStore.save(payment);

      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      const errorCode = (error as any).code || 'UNKNOWN_ERROR';
      
      const failedEvent = PaymentEvent.paymentFailed(
        paymentId,
        errorCode,
        errorMessage,
        false
      );
      this.eventStore.save(failedEvent);

      throw error;
    }
  }

  /**
   * Получение платежа по ID
   */
  async getPayment(paymentId: string): Promise<Payment> {
    const payment = this.paymentStore.get(paymentId);
    
    if (!payment) {
      throw new NotFoundError('Payment', paymentId);
    }

    return payment;
  }

  /**
   * Получение истории событий платежа
   */
  async getPaymentEvents(paymentId: string): Promise<PaymentEvent[]> {
    const payment = this.paymentStore.get(paymentId);
    
    if (!payment) {
      throw new NotFoundError('Payment', paymentId);
    }

    return this.eventStore.find(e => (e as any).paymentId === paymentId);
  }

  /**
   * Регистрация перехода клиента по ссылке
   */
  async recordCustomerRedirect(
    paymentId: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<void> {
    const payment = await this.getPayment(paymentId);

    if (payment.status !== PaymentStatus.AWAITING_PAYMENT) {
      throw new InvalidStateError(
        `Невозможно зарегистрировать переход для платежа в статусе ${payment.status}`
      );
    }

    const event = PaymentEvent.customerRedirected(paymentId, userAgent, ipAddress);
    this.eventStore.save(event);
  }

  /**
   * Обработка webhook от платёжного провайдера
   */
  async processWebhook(params: {
    paymentId: string;
    providerId: string;
    providerTransactionId: string;
    status: string;
    errorCode?: string;
    errorMessage?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const payment = await this.getPayment(params.paymentId);

    // Проверяем, что webhook от правильного провайдера
    if (payment.providerId !== params.providerId) {
      throw new ValidationError(
        `Webhook от провайдера ${params.providerId}, но платёж создан через ${payment.providerId}`
      );
    }

    // Получаем провайдер для маппинга статуса
    const provider = this.providerManager.getProvider(params.providerId);
    
    // Маппим статус провайдера к нашему внутреннему статусу
    const mappedStatus = provider.mapStatus(params.status);
    
    // Если статус неизвестен, логируем и выбрасываем ошибку
    if (mappedStatus === PaymentStatus.UNKNOWN) {
      throw new ValidationError(
        `Провайдер ${params.providerId} вернул неизвестный статус "${params.status}"`,
        { originalStatus: params.status, providerId: params.providerId }
      );
    }

    // Обновляем provider transaction ID если нужно
    if (params.providerTransactionId && !payment.providerTransactionId) {
      payment.setProviderTransactionId(params.providerTransactionId);
      this.paymentStore.save(payment);
    }

    // Обрабатываем статус
    switch (mappedStatus) {
      case PaymentStatus.INITIATED:
      case PaymentStatus.AWAITING_PAYMENT:
        // Платёж в ожидании
        if (payment.status === PaymentStatus.INITIATED && payment.canTransitionTo(PaymentStatus.AWAITING_PAYMENT)) {
          payment.updateStatus(PaymentStatus.AWAITING_PAYMENT);
          this.paymentStore.save(payment);
        }
        break;

      case PaymentStatus.PROCESSING:
        // Платёж в обработке
        if (payment.canTransitionTo(PaymentStatus.PROCESSING)) {
          payment.updateStatus(PaymentStatus.PROCESSING);
          this.paymentStore.save(payment);

          const processingEvent = PaymentEvent.processingStarted(
            params.paymentId,
            params.providerId,
            params.providerTransactionId
          );
          this.eventStore.save(processingEvent);
        }
        break;

      case PaymentStatus.COMPLETED:
        // Платёж успешно завершён
        if (!payment.canTransitionTo(PaymentStatus.COMPLETED)) {
          throw new InvalidStateError(
            `Невозможно завершить платёж в статусе ${payment.status}`
          );
        }

        payment.updateStatus(PaymentStatus.COMPLETED);
        this.paymentStore.save(payment);

        const completedEvent = PaymentEvent.paymentCompleted(
          params.paymentId,
          params.providerId,
          params.providerTransactionId
        );
        this.eventStore.save(completedEvent);
        break;

      case PaymentStatus.FAILED:
        // Платёж провалился
        if (!payment.canTransitionTo(PaymentStatus.FAILED)) {
          throw new InvalidStateError(
            `Невозможно перевести платёж в статус FAILED из ${payment.status}`
          );
        }

        payment.updateStatus(PaymentStatus.FAILED);
        this.paymentStore.save(payment);

        const failedEvent = PaymentEvent.paymentFailed(
          params.paymentId,
          params.errorCode || 'UNKNOWN_ERROR',
          params.errorMessage || 'Неизвестная ошибка',
          true
        );
        this.eventStore.save(failedEvent);
        break;

      case PaymentStatus.CANCELLED:
        // Платёж отменён
        if (!payment.canTransitionTo(PaymentStatus.CANCELLED)) {
          throw new InvalidStateError(
            `Невозможно отменить платёж в статусе ${payment.status}`
          );
        }

        payment.updateStatus(PaymentStatus.CANCELLED);
        this.paymentStore.save(payment);

        const cancelledEvent = PaymentEvent.paymentCancelled(
          params.paymentId,
          params.errorMessage || 'Отменено провайдером',
          params.providerId
        );
        this.eventStore.save(cancelledEvent);
        break;

      default:
        throw new ValidationError(`Неизвестный внутренний статус: ${mappedStatus}`);
    }
  }

  /**
   * Повторная попытка оплаты
   */
  async retryPayment(
    paymentId: string,
    reason: string
  ): Promise<{ paymentUrl: string }> {
    const payment = await this.getPayment(paymentId);

    if (payment.status !== PaymentStatus.FAILED) {
      throw new InvalidStateError(
        `Повторная попытка возможна только для платежей в статусе FAILED`
      );
    }

    if (payment.retryCount >= 3) {
      throw new ValidationError('Превышено максимальное количество попыток (3)');
    }

    // Получаем провайдер
    const provider = this.providerManager.getProvider(payment.providerId);

    // Создаём новый платёж у провайдера
    const callbackUrl = `${this.callbackBaseUrl}/api/payments/webhook/${provider.id}`;
    const providerPayment = await provider.createPayment({
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      description: payment.description,
      merchantId: payment.merchantId,
      callbackUrl
    });

    // Обновляем платёж
    payment.incrementRetryCount();
    payment.setPaymentUrl(providerPayment.paymentUrl);
    payment.setProviderTransactionId(providerPayment.providerTransactionId);
    payment.updateStatus(PaymentStatus.AWAITING_PAYMENT);
    this.paymentStore.save(payment);

    const retryEvent = PaymentEvent.retryRequested(
      paymentId,
      payment.retryCount,
      reason
    );
    this.eventStore.save(retryEvent);

    return { paymentUrl: providerPayment.paymentUrl };
  }

  /**
   * Отмена платежа
   */
  async cancelPayment(
    paymentId: string,
    reason: string,
    cancelledBy: string
  ): Promise<void> {
    const payment = await this.getPayment(paymentId);

    if (!payment.canTransitionTo(PaymentStatus.CANCELLED)) {
      throw new InvalidStateError(
        `Невозможно отменить платёж в статусе ${payment.status}`
      );
    }

    // Если у платежа есть ID транзакции провайдера, отменяем у провайдера
    if (payment.providerTransactionId) {
      try {
        const provider = this.providerManager.getProvider(payment.providerId);
        await provider.cancelPayment(payment.providerTransactionId, reason);
      } catch (error) {
        // Игнорируем ошибки отмены у провайдера, т.к. локально мы всё равно отменяем
      }
    }

    payment.updateStatus(PaymentStatus.CANCELLED);
    this.paymentStore.save(payment);

    const cancelledEvent = PaymentEvent.paymentCancelled(
      paymentId,
      reason,
      cancelledBy
    );
    this.eventStore.save(cancelledEvent);
  }

  /**
   * Получение всех платежей (для отладки)
   */
  async getAllPayments(): Promise<Payment[]> {
    return this.paymentStore.getAll();
  }
}
