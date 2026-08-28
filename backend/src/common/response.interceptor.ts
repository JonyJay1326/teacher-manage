import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ok, type ApiResponse } from './api';

/** 将控制器返回值包装为统一响应（已是 ApiResponse 则透传） */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  /** 拦截并包装 */
  intercept(_context: ExecutionContext, next: CallHandler): Observable<ApiResponse> {
    return next.handle().pipe(
      map((data: unknown) => {
        if (
          data !== null &&
          typeof data === 'object' &&
          'code' in data &&
          'message' in data &&
          'data' in data
        ) {
          return data as ApiResponse;
        }
        return ok(data);
      }),
    );
  }
}
