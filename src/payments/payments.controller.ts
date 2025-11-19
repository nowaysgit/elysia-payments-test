import { Elysia } from 'elysia';
import { PaymentService } from './payments.service';
import { 
  createPaymentSchema, 
  webhookSchema,
  webhookParamSchema,
  retryPaymentSchema,
  cancelPaymentSchema,
  paymentIdParamSchema
} from './payments.schemas';

/**
 * Создание HTTP роутов
 */
export function createPaymentsController(paymentService: PaymentService) {
  return new Elysia({ prefix: '/api' })
    /**
     * POST /api/payments - Создание платежа
     */
    .post('/payments', async ({ body }) => {
      return await paymentService.createPayment(body);
    }, {
      body: createPaymentSchema
    })

    /**
     * GET /api/payments/:id - Получение информации о платеже
     */
    .get('/payments/:id', async ({ params }) => {
      return await paymentService.getPayment(params.id);
    }, {
      params: paymentIdParamSchema
    })

    /**
     * GET /api/payments/:id/events - Получение истории событий платежа
     */
    .get('/payments/:id/events', async ({ params }) => {
      const events = await paymentService.getPaymentEvents(params.id);

      return {
        paymentId: params.id,
        eventsCount: events.length,
        events: events.map(e => ({
          id: e.id,
          type: e.type,
          data: e.data,
          timestamp: e.timestamp
        }))
      };
    }, {
      params: paymentIdParamSchema
    })

    /**
     * POST /api/payments/webhook/:providerId - Обработка webhook от провайдера
     */
    .post('/payments/webhook/:providerId', async ({ params, body }) => {
      await paymentService.processWebhook({
        ...body,
        providerId: params.providerId
      });
      
      return {
        message: 'Webhook обработан успешно'
      };
    }, {
      params: webhookParamSchema,
      body: webhookSchema
    })

    /**
     * POST /api/payments/:id/retry - Повторная попытка оплаты
     */
    .post('/payments/:id/retry', async ({ params, body }) => {
      const result = await paymentService.retryPayment(params.id, body.reason);

      return {
        ...result,
        message: 'Повторная попытка инициирована'
      };
    }, {
      params: paymentIdParamSchema,
      body: retryPaymentSchema
    })

    /**
     * POST /api/payments/:id/cancel - Отмена платежа
     */
    .post('/payments/:id/cancel', async ({ params, body }) => {
      await paymentService.cancelPayment(
        params.id,
        body.reason,
        body.cancelledBy
      );

      return {
        message: 'Платёж отменён'
      };
    }, {
      params: paymentIdParamSchema,
      body: cancelPaymentSchema
    })

    /**
     * GET /api/payments - Получение всех платежей (для отладки)
     */
    .get('/payments', async () => {
      const payments = await paymentService.getAllPayments();
      return {
        count: payments.length,
        payments
      };
    });
}
