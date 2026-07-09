import { Module, forwardRef } from '@nestjs/common'
import { OrdersService } from './orders.service'
import { OrdersController } from './orders.controller'
import { WebsocketModule } from '../websocket/websocket.module'
import { PaymentsModule } from '../payments/payments.module'
import { SettingsModule } from '../settings/settings.module'
import { KitchenPrintService } from './kitchen-print.service'
import { BookingsModule } from '../bookings/bookings.module'
import { MailModule } from '../mail/mail.module'

@Module({
  imports: [WebsocketModule, PaymentsModule, SettingsModule, MailModule, forwardRef(() => BookingsModule)],
  providers: [OrdersService, KitchenPrintService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
