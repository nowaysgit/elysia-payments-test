import { createServer } from './http/server';
import { Store } from './infrastructure/store';
import { StoreManager } from './infrastructure/store.manager';
import { Payment } from './entities/payment';
import { PaymentEvent } from './entities/payment-event';
import { PaymentService } from './payments/payments.service';
import { PaymentProviderManager } from './payments/providers/payment-provider.manager';
import { TBankSBPProvider } from './payments/providers/tbank-sbp.provider';
import { FakeProvider } from './payments/providers/fake.provider';

/**
 * Конфигурация приложения
 */
const config = {
  port: 3000,
  callbackBaseUrl: process.env.CALLBACK_BASE_URL || 'http://localhost:3000',
  storesDir: process.env.STORES_DIR || './stores',
  // Конфигурация T-Bank СБП
  tbank: {
    terminalId: process.env.TBANK_TERMINAL_ID || 'test_terminal',
    secretKey: process.env.TBANK_SECRET_KEY || 'test_secret_key',
    apiUrl: process.env.TBANK_API_URL // опционально
  }
};

/**
 * Инициализация менеджера хранилищ
 */
const storeManager = new StoreManager();

/**
 * Создание хранилищ
 */
const paymentStore = storeManager.add(
  new Store(Payment, `${config.storesDir}/payments.json`)
);

const eventStore = storeManager.add(
  new Store(PaymentEvent, `${config.storesDir}/events.json`)
);

/**
 * Инициализация всех хранилищ
 */
await storeManager.initialize();

/**
 * Инициализация провайдеров платежей
 */
const providerManager = new PaymentProviderManager();

// Регистрация Fake провайдера (для тестирования)
const fakeProvider = new FakeProvider({
  autoConfirmDelay: 0, // не автоподтверждать
  successRate: 1.0, // всегда успешно
  supportedCurrencies: ['RUB', 'USD', 'EUR']
});
providerManager.register(fakeProvider, true); // true = провайдер по умолчанию

// Регистрация T-Bank СБП
const tbankProvider = new TBankSBPProvider(config.tbank);
providerManager.register(tbankProvider, false);

/**
 * Создание сервиса
 */
const paymentService = new PaymentService(
  paymentStore, 
  eventStore, 
  providerManager,
  config.callbackBaseUrl
);

/**
 * Запуск сервера
 */
const app = createServer(paymentService);

app.listen(config.port);

console.log(`
🚀 Сервер платежей запущен
📍 Порт: ${config.port}
💾 Хранилище платежей: ${config.storesDir}/payments.json
💾 Хранилище событий: ${config.storesDir}/events.json
🔗 Callback URL: ${config.callbackBaseUrl}

📦 Зарегистрированные провайдеры:
${providerManager.getAllProviders().map(p => `  - ${p.name} (${p.id}) - валюты: ${p.supportedCurrencies.join(', ')}`).join('\n')}

API Endpoints:
  POST   /api/payments                  - Создать платёж
  GET    /api/payments/:id              - Получить платёж
  GET    /api/payments/:id/events       - История событий
  POST   /api/payments/webhook/:providerId - Webhook от провайдера
  POST   /api/payments/:id/retry        - Повторная попытка
  POST   /api/payments/:id/cancel       - Отменить платёж
  GET    /health                        - Health check
`);
