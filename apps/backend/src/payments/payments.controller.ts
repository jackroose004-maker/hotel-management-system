import { Controller, Post, Body, Param, Headers, Req, Request, UseGuards } from '@nestjs/common'
import { PaymentsService } from './payments.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'

@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Post('create-intent/:orderId')
  createIntent(@Param('orderId') orderId: string) {
    return this.payments.createIntent(orderId)
  }

  @Post('confirm/:orderId')
  confirmPayment(@Param('orderId') orderId: string, @Body('paymentIntentId') piId: string) {
    return this.payments.confirmPayment(orderId, piId)
  }

  @Post('webhook')
  webhook(@Req() req: any, @Headers('stripe-signature') sig: string) {
    return this.payments.handleWebhook(req.rawBody, sig)
  }

  // Guest selects "Pay Cash" — records intent, keeps PENDING for manager approval
  @Post('cash/:orderId')
  registerCash(@Param('orderId') orderId: string) {
    return this.payments.registerCashOrder(orderId)
  }

  // Counter collection: staff marks a single order PAID (takeaway pickup)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Post('order/:orderId/collect')
  collectOrder(@Param('orderId') orderId: string, @Body('method') method: string, @Req() req: any) {
    return this.payments.collectOrderPayment(orderId, (method === 'CARD' ? 'CARD' : 'CASH'), req.user?.id)
  }

  // Settle ALL unpaid orders for a table
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Post('table/:tableId/settle-all-cash')
  settleTableCash(@Param('tableId') tableId: string, @Body('method') method: string, @Req() req: any) {
    return this.payments.settleAllCashForTable(tableId, method as 'CASH' | 'CARD' | undefined, req.user?.id)
  }

  // Settle a specific session (personal tab) — supports discount + split payment
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Post('session/:sessionId/settle')
  settleSession(
    @Param('sessionId') sessionId: string,
    @Body('method') method?: string,
    @Body('discountAmount') discountAmount?: number,
    @Body('discountReason') discountReason?: string,
    @Body('splitCashAmount') splitCashAmount?: number,
    @Body('tipAmount') tipAmount?: number,
    @Req() req?: any,
  ) {
    return this.payments.settleSession(sessionId, {
      method: (method ?? 'CASH') as 'CASH' | 'CARD' | 'SPLIT',
      discountAmount: discountAmount ? Number(discountAmount) : 0,
      discountReason,
      splitCashAmount: splitCashAmount ? Number(splitCashAmount) : undefined,
      tipAmount: tipAmount ? Number(tipAmount) : 0,
      settledById: req?.user?.id,
    })
  }
}
