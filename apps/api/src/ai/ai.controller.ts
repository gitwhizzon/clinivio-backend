import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles, TenantId } from '@mediflow/shared';
import { AiService } from './ai.service';

@Controller('patients')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AiController {
  constructor(private readonly svc: AiService) {}

  /**
   * GET /patients/:id/ai-summary
   * Returns a de-identified AI-generated clinical summary.
   * Only DOCTOR and ADMIN roles can access.
   * Cached 24 h in Redis; pass ?refresh=true to force regeneration.
   */
  @Get(':id/ai-summary')
  @Roles('ADMIN', 'DOCTOR')
  getSummary(
    @Param('id') patientId: string,
    @TenantId() tenantId: string,
    @Request() req: any,
    @Query('refresh') refresh?: string,
  ) {
    return this.svc.getSummary(
      patientId,
      tenantId,
      req.user?.sub ?? req.user?.id,
      refresh === 'true',
    );
  }

  /**
   * POST /patients/:id/ai-summary/invalidate
   * Clears the cached summary (e.g., after a new consultation is saved).
   */
  @Post(':id/ai-summary/invalidate')
  @Roles('ADMIN', 'DOCTOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  invalidate(@Param('id') patientId: string, @TenantId() tenantId: string) {
    return this.svc.invalidateCache(patientId, tenantId);
  }
}
