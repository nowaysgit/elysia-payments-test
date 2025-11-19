import crypto from 'crypto';
import { 
  PaymentProvider, 
  CreatePaymentParams, 
  ProviderPaymentResult,
  ProviderStatusResult
} from './payment-provider.interface';
import { PaymentStatus } from '../../entities/payment';
import { ExternalServiceError, ValidationError } from '../../http/errors.types';

/**
 * Конфигурация T-Bank СБП
 */
export interface TBankSBPConfig {
  /** Terminal ID из личного кабинета T-Bank */
  terminalId: string;
  /** Секретный ключ для подписи */
  secretKey: string;
  /** API URL (по умолчанию production) */
  apiUrl?: string;
  /** Таймаут запросов в мс */
  timeout?: number;
}

/**
 * Провайдер для работы с T-Bank СБП (Система Быстрых Платежей)
 * 
 * Документация API: https://www.tbank.ru/kassa/dev/payments/
 */
export class TBankSBPProvider implements PaymentProvider {
  readonly id = 'tbank-sbp';
  readonly name = 'T-Bank СБП';
  readonly supportedCurrencies = ['RUB'];

  private readonly apiUrl: string;
  private readonly timeout: number;

  constructor(private readonly config: TBankSBPConfig) {
    this.apiUrl = config.apiUrl || 'https://securepay.tinkoff.ru/v2';
    this.timeout = config.timeout || 30000;
  }

  /**
   * Создание платежа через СБП
   */
  async createPayment(params: CreatePaymentParams): Promise<ProviderPaymentResult> {
    try {
      // Формируем данные для запроса
      const requestData = {
        TerminalKey: this.config.terminalId,
        Amount: Math.round(params.amount * 100), // Копейки
        OrderId: params.paymentId,
        Description: params.description,
        PayType: 'S', // 'S' = СБП
        NotificationURL: params.callbackUrl,
        SuccessURL: params.successUrl,
        FailURL: params.failUrl,
        Receipt: this.buildReceipt(params)
      };

      // Добавляем токен (подпись)
      const dataWithToken = {
        ...requestData,
        Token: this.generateToken(requestData)
      };

      // Отправляем запрос
      const response = await this.makeRequest('/Init', dataWithToken);

      if (!response.Success) {
        throw new ExternalServiceError(
          'T-Bank СБП',
          response.ErrorCode || 'UNKNOWN_ERROR',
          response.Message || response.Details || 'Неизвестная ошибка'
        );
      }

      return {
        providerTransactionId: response.PaymentId,
        paymentUrl: response.PaymentURL,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 минут
        metadata: {
          orderId: response.OrderId,
          status: response.Status
        }
      };
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError(
        'T-Bank СБП',
        'CONNECTION_ERROR',
        error instanceof Error ? error.message : 'Ошибка соединения'
      );
    }
  }

  /**
   * Проверка статуса платежа
   */
  async checkPaymentStatus(providerTransactionId: string): Promise<ProviderStatusResult> {
    try {
      const requestData = {
        TerminalKey: this.config.terminalId,
        PaymentId: providerTransactionId
      };

      const dataWithToken = {
        ...requestData,
        Token: this.generateToken(requestData)
      };

      const response = await this.makeRequest('/GetState', dataWithToken);

      if (!response.Success) {
        throw new ExternalServiceError(
          'T-Bank СБП',
          response.ErrorCode || 'UNKNOWN_ERROR',
          response.Message || response.Details || 'Неизвестная ошибка'
        );
      }

      return {
        status: this.mapStatus(response.Status),
        providerTransactionId: response.PaymentId,
        errorCode: response.ErrorCode,
        metadata: {
          orderId: response.OrderId,
          amount: response.Amount
        }
      };
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError(
        'T-Bank СБП',
        'CONNECTION_ERROR',
        error instanceof Error ? error.message : 'Ошибка соединения'
      );
    }
  }

  /**
   * Отмена платежа
   */
  async cancelPayment(providerTransactionId: string, reason: string): Promise<void> {
    try {
      const requestData = {
        TerminalKey: this.config.terminalId,
        PaymentId: providerTransactionId
      };

      const dataWithToken = {
        ...requestData,
        Token: this.generateToken(requestData)
      };

      const response = await this.makeRequest('/Cancel', dataWithToken);

      if (!response.Success) {
        throw new ExternalServiceError(
          'T-Bank СБП',
          response.ErrorCode || 'UNKNOWN_ERROR',
          response.Message || response.Details || 'Неизвестная ошибка'
        );
      }
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError(
        'T-Bank СБП',
        'CONNECTION_ERROR',
        error instanceof Error ? error.message : 'Ошибка соединения'
      );
    }
  }

  /**
   * Проверка поддержки валюты
   */
  supportsCurrency(currency: string): boolean {
    return this.supportedCurrencies.includes(currency.toUpperCase());
  }

	/**
	 * Маппинг статуса T-Bank к внутреннему статусу
	 */
	mapStatus(providerStatus: string): PaymentStatus {
		const statusMap: Record<string, PaymentStatus> = {
			// T-Bank статусы
			NEW: PaymentStatus.AWAITING_PAYMENT,
			FORM_SHOWED: PaymentStatus.AWAITING_PAYMENT,
			AUTHORIZING: PaymentStatus.PROCESSING,
			AUTHORIZED: PaymentStatus.PROCESSING,
			'3DS_CHECKING': PaymentStatus.PROCESSING,
			'3DS_CHECKED': PaymentStatus.PROCESSING,
			CONFIRMING: PaymentStatus.PROCESSING,
			CONFIRMED: PaymentStatus.COMPLETED,
			REJECTED: PaymentStatus.FAILED,
			CANCELLED: PaymentStatus.CANCELLED,
			REFUNDED: PaymentStatus.CANCELLED,
			PARTIAL_REFUNDED: PaymentStatus.COMPLETED,
			DEADLINE_EXPIRED: PaymentStatus.FAILED,
			ATTEMPTS_EXPIRED: PaymentStatus.FAILED,
		};

		const upperStatus = providerStatus.toUpperCase();
		const status = statusMap[upperStatus];
		if (!status) {
			throw new ValidationError(
				`Неизвестный статус T-Bank: ${providerStatus}`,
				{ providerStatus, provider: this.id }
			);
		}
		return status;
	}  /**
   * Генерация токена (подписи запроса)
   */
  private generateToken(data: Record<string, any>): string {
    // Удаляем ненужные поля
    const { Token, Receipt, Data, ...filteredData } = data;

    // Сортируем по ключам и добавляем секретный ключ
    const values = Object.keys(filteredData)
      .sort()
      .map(key => filteredData[key])
      .concat(this.config.secretKey);

    // Создаём SHA-256 хеш
    const concatenated = values.join('');
    return crypto
      .createHash('sha256')
      .update(concatenated)
      .digest('hex');
  }

  /**
   * Формирование чека (54-ФЗ)
   */
  private buildReceipt(params: CreatePaymentParams): any {
    return {
      Email: 'customer@example.com', // В реальном приложении брать из параметров
      Taxation: 'usn_income', // Система налогообложения
      Items: [
        {
          Name: params.description,
          Price: Math.round(params.amount * 100), // Копейки
          Quantity: 1,
          Amount: Math.round(params.amount * 100),
          Tax: 'none',
          PaymentMethod: 'full_payment',
          PaymentObject: 'service'
        }
      ]
    };
  }

  /**
   * Выполнение HTTP-запроса к API T-Bank
   */
  private async makeRequest(endpoint: string, data: any): Promise<any> {
    const url = `${this.apiUrl}${endpoint}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
