import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppException, ErrorCodes } from './api';

/** 统一异常过滤器，输出 { code, message, data } */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /** 处理异常 */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof AppException) {
      response.status(exception.statusHttp).json({
        code: exception.code,
        message: exception.message,
        data: null,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      let message = exception.message;
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const raw = (body as { message: string | string[] }).message;
        message = Array.isArray(raw) ? raw.join('; ') : String(raw);
      }
      const code =
        status === HttpStatus.UNAUTHORIZED
          ? ErrorCodes.UNAUTHORIZED
          : status === HttpStatus.FORBIDDEN
            ? ErrorCodes.FORBIDDEN
            : status === HttpStatus.BAD_REQUEST
              ? ErrorCodes.VALIDATION
              : ErrorCodes.SYSTEM;
      response.status(status).json({ code, message, data: null });
      return;
    }

    this.logger.error(exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: ErrorCodes.SYSTEM,
      message: '系统错误',
      data: null,
    });
  }
}
