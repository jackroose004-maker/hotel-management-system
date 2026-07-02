import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { BillsService } from './bills.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { RolesGuard } from '../common/guards/roles.guard'
import { PaymentMethod } from '@prisma/client'

@Controller('bills')
export class BillsController {
  constructor(private svc: BillsService) {}

  @Get('today')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  getTodaysBills() {
    return this.svc.getTodaysBills()
  }

  @Post('session/:tableSessionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  getOrCreate(@Param('tableSessionId') sessionId: string, @Body('tableId') tableId?: string) {
    return this.svc.getOrCreateBill(sessionId, tableId)
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getBill(@Param('id') id: string) {
    return this.svc.getBill(id)
  }

  @Post(':id/payment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  addPayment(
    @Param('id') id: string,
    @Req() req,
    @Body() body: { method: PaymentMethod; amount: number; reference?: string },
  ) {
    return this.svc.addPayment(id, body.method, body.amount, req.user.id, body.reference)
  }

  @Patch(':id/close')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  close(@Param('id') id: string, @Req() req) {
    return this.svc.closeBill(id, req.user.id)
  }

  @Patch(':id/void')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  void(@Param('id') id: string, @Req() req, @Body('reason') reason?: string) {
    return this.svc.voidBill(id, req.user.id, reason)
  }

  @Patch(':id/print')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  print(@Param('id') id: string) {
    return this.svc.incrementPrintCount(id)
  }
}
