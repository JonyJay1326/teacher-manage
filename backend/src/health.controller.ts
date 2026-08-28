import { Controller, Get } from '@nestjs/common';
import { Public } from './common/public.decorator';

/** 健康检查（免鉴权） */
@Controller('health')
export class HealthController {
  /** 返回服务存活状态 */
  @Public()
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
