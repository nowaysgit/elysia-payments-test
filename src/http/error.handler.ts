import { ElysiaCustomStatusResponse, HTTPHeaders, InternalServerError, InvalidCookieSignature, InvalidFileType, NotFoundError as ElysiaNotFoundError, ParseError, StatusMap, ValidationError as ElysiaValidationError } from 'elysia';
import { ElysiaCookie } from 'elysia/dist/cookies';
import { isAppError } from './errors.types';

export const errorHandler = ({ code, error, set }: {
   code: number | "NOT_FOUND" | "INTERNAL_SERVER_ERROR" | "VALIDATION" | "UNKNOWN" | "PARSE" | "INVALID_COOKIE_SIGNATURE" | "INVALID_FILE_TYPE"
   error: Readonly<Error> | Readonly<ElysiaValidationError> | Readonly<ElysiaNotFoundError> | Readonly<ParseError> | Readonly<InternalServerError> | Readonly<InvalidCookieSignature> | Readonly<InvalidFileType> | Readonly<ElysiaCustomStatusResponse<number, number, number>>
   set: {
    headers: HTTPHeaders;
    status?: number | keyof StatusMap;
    redirect?: string;
    cookie?: Record<string, ElysiaCookie>;
} & {
    headers: HTTPHeaders;
    status?: number | keyof StatusMap;
    redirect?: string;
    cookie?: Record<string, ElysiaCookie>;
}
}) => {
    if(typeof code ==='number' && code >= 500 || code === 'INTERNAL_SERVER_ERROR' || code === 'UNKNOWN' || code === 'PARSE') {
      console.error('❌ Ошибка сервера:', { code, error });
    }

    // Обработка наших кастомных ошибок
    if (isAppError(error)) {
      set.status = error.statusCode;
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      };
    }

    // Обработка ошибок валидации Elysia/Zod
    if (code === 'VALIDATION') {
      set.status = 422;
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'message' in error ? error.message : 'Ошибка валидации',
          details: 'all' in error ? error.all : undefined
        }
      };
    }

    // Обработка 404 от Elysia
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Ресурс не найден'
        }
      };
    }

    // Все остальные ошибки
    set.status = 500;
    return {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: process.env.NODE_ENV === 'production' 
          ? 'Внутренняя ошибка сервера' 
          : (error instanceof Error ? error.message : 'Внутренняя ошибка сервера')
      }
    };
  };
