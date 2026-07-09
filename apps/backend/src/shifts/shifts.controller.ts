import { Controller, Post, Patch, Get, UseGuards, Request } from '@nestjs/common'
import { ShiftsService } from './shifts.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'

@Controller('shifts')
@UseGuards(JwtAuthGuard)
export class ShiftsController {
  constructor(private shifts: ShiftsService) {}

  @Post('clock-in')
  clockIn(@Request() req) {
    return this.shifts.clockIn(req.user.id, req.user.role)
  }

  @Patch('clock-out')
  clockOut(@Request() req) {
    return this.shifts.clockOut(req.user.id)
  }

  @Get('my')
  getMyShift(@Request() req) {
    return this.shifts.getMyShift(req.user.id)
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Get('active')
  getActiveShifts() {
    return this.shifts.getActiveShifts()
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Get('today')
  getTodayShifts() {
    return this.shifts.getTodayShifts()
  }
}
