import { Controller, Post, Body, Param, Headers, Req } from '@nestjs/common'
import { PaymentsService } from './payments.service'

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

  // Manager settles cash payment (called when guest pays at counter/checkout)
  @Post('cash-settle/:orderId')
  settleCash(@Param('orderId') orderId: string) {
    return this.payments.settleCashPayment(orderId)
  }

  // Settle ALL unpaid cash orders for a table in one tap
  @Post('table/:tableId/settle-all-cash')
  settleTableCash(@Param('tableId') tableId: string) {
    return this.payments.settleAllCashForTable(tableId)
  }
}
