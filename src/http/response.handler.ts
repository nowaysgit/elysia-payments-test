import { HTTPHeaders, StatusMap } from 'elysia';
import { ElysiaCookie } from 'elysia/dist/cookies';

/**
 * Middleware для автоматической обёртки успешных ответов
 * Если handler возвращает объект без поля success, автоматически оборачивает в { success: true, data: ... }
 */
export const responseHandler = ({ response, set }: {
    response: unknown, 
    set: {
        headers: HTTPHeaders;
        status?: number | keyof StatusMap;
        redirect?: string;
        cookie?: Record<string, ElysiaCookie>;
    }
}) => {
    // Игнорируем ответы с ошибками (уже обработаны error handler)
    const statusCode = typeof set.status === 'number' ? set.status : 200;
    if (statusCode >= 400) {
      return;
    }

    // Пропускаем null/undefined
    if (response === null || response === undefined) {
      return {
        success: true,
      };
    }

    // Оборачиваем объекты и массивы
    return {
      success: true,
      data: response
    };
  };
