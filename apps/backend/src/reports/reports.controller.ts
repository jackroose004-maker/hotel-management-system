import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { RolesGuard } from '../common/guards/roles.guard'

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
export class ReportsController {
  constructor(private svc: ReportsService) {}

  @Get('today')
  todayLive() {
    return this.svc.todayLive()
  }

  @Get('last-30-days')
  last30() {
    return this.svc.getLast30Days()
  }

  @Get('daily')
  getDay(@Query('date') date: string) {
    return this.svc.getReport(new Date(date))
  }

  @Post('generate')
  @Roles('OWNER')
  generate(@Query('date') date?: string) {
    return this.svc.generateDailyReport(date ? new Date(date) : undefined)
  }
}
