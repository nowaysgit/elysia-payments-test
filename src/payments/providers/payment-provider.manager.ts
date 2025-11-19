import type { PaymentProvider } from './payment-provider.interface';
import { NotFoundError } from '../../http/errors.types';

/**
 * Менеджер провайдеров платежей
 * Управляет регистрацией и получением провайдеров
 */
export class PaymentProviderManager {
  private providers = new Map<string, PaymentProvider>();
  private defaultProvider?: PaymentProvider;

  /**
   * Регистрация провайдера
   */
  register(provider: PaymentProvider, isDefault: boolean = false): void {
    this.providers.set(provider.id, provider);
    if (isDefault) {
      this.defaultProvider = provider;
    }
  }

  /**
   * Получение провайдера по ID
   * @throws {NotFoundError} Если провайдер не найден
   */
  getProvider(providerId: string): PaymentProvider {
    const provider = this.providers.get(providerId);
    
    if (!provider) {
      throw new NotFoundError('Провайдер', providerId);
    }

    return provider;
  }

  /**
   * Получение всех зарегистрированных провайдеров
   */
  getAllProviders(): PaymentProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Проверка существования провайдера
   */
  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  /**
   * Получение провайдера по умолчанию
   * @throws {NotFoundError} Если провайдер по умолчанию не установлен
   */
  getDefaultProvider(): PaymentProvider {
    if (!this.defaultProvider) {
      throw new NotFoundError('Провайдер по умолчанию', 'default');
    }
    return this.defaultProvider;
  }
}
