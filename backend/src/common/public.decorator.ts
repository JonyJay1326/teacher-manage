import { SetMetadata } from '@nestjs/common';

/** 标记公开接口（无需登录） */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
