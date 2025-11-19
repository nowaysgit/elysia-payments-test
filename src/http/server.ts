import { Elysia } from 'elysia';
import { createPaymentsController } from '../payments/payments.controller';
import { PaymentService } from '../payments/payments.service';
import { errorHandler } from './error.handler';
import { responseHandler } from './response.handler';

/**
 * Создание и настройка HTTP сервера
 */
export function createServer(paymentService: PaymentService) {
  return new Elysia()    
    // Глобальная обработка ошибок
    .onError(({ code, error, set }) => errorHandler({ code, error, set }))
    // Автоматическая обёртка ответов
    .onAfterHandle(({ response, set }) => responseHandler({ response, set }))
    
    // Health check
    .get('/health', () => ({
      status: 'ok',
      timestamp: new Date().toISOString()
    }))
    
    // Подключение роутов
    .use(createPaymentsController(paymentService));
}
