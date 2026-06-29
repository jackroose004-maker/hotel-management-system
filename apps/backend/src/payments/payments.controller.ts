import { Controller, Post, Body, Param, Headers, Req, UseGuards } from '@nestjs/common'
import { PaymentsService } from './payments.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'

@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  // Guest creates payment intent after order is placed
  @Post('create-intent/:orderId')
  createIntent(@Param('orderId') orderId: string) {
    return this.payments.createIntent(orderId)
  }

  // Called by frontend after stripe.confirmPayment() succeeds
  @Post('confirm/:orderId')
  confirmPayment(@Param('orderId') orderId: string, @Body('paymentIntentId') piId: string) {
    return this.payments.confirmPayment(orderId, piId)
  }

  // Stripe webhook — raw body needed for signature verification
  @Post('webhook')
  webhook(@Req() req: any, @Headers('stripe-signature') sig: string) {
    return this.payments.handleWebhook(req.rawBody, sig)
  }

  // Staff marks an order as cash paid
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Post('cash/:orderId')
  cashPaid(@Param('orderId') orderId: string) {
    return this.payments.markCashPaid(orderId)
  }
}
