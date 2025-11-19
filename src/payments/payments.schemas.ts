import { z } from 'zod';

/**
 * Схема для валидации UUID в параметрах маршрута
 */
export const paymentIdParamSchema = z.object({
  id: z.uuid('Некорректный ID платежа')
});

/**
 * Схема для создания платежа
 */
export const createPaymentSchema = z.object({
  amount: z.number().positive('Сумма должна быть положительной'),
  currency: z.enum(['RUB', 'USD', 'EUR'], {
    message: 'Поддерживаемые валюты: RUB, USD, EUR'
  }),
  merchantId: z.uuid('Некорректный ID мерчанта'),
  description: z.string().min(1, 'Описание обязательно').max(500),
  providerId: z.string().optional()
});

/**
 * Схема для параметров webhook URL
 */
export const webhookParamSchema = z.object({
  providerId: z.string().min(1, 'ID провайдера обязателен')
});

/**
 * Схема для webhook
 */
export const webhookSchema = z.object({
  paymentId: z.uuid('Некорректный ID платежа'),
  providerTransactionId: z.string().min(1, 'ID транзакции провайдера обязателен'),
  status: z.string().min(1, 'Статус обязателен'),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()
});

/**
 * Схема для повторной попытки
 */
export const retryPaymentSchema = z.object({
  reason: z.string().min(1, 'Причина обязательна').max(200)
});

/**
 * Схема для отмены платежа
 */
export const cancelPaymentSchema = z.object({
  reason: z.string().min(1, 'Причина обязательна').max(200),
  cancelledBy: z.string().min(1, 'Укажите, кто отменил').max(100)
});
