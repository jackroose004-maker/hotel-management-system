import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common'
import { ActivityLogService } from './activity-log.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { RolesGuard } from '../common/guards/roles.guard'

@Controller('activity-log')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
export class ActivityLogController {
  constructor(private svc: ActivityLogService) {}

  @Get()
  findAll(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorId') actorId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.findAll({ entityType, entityId, actorId, limit: limit ? +limit : 100 })
  }
}
