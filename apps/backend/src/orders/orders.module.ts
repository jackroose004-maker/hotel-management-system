import { Module, forwardRef } from '@nestjs/common'
import { OrdersService } from './orders.service'
import { OrdersController } from './orders.controller'
import { WebsocketModule } from '../websocket/websocket.module'
import { SettingsModule } from '../settings/settings.module'
import { KitchenPrintService } from './kitchen-print.service'
import { BookingsModule } from '../bookings/bookings.module'
import { MailModule } from '../mail/mail.module'

@Module({
  imports: [WebsocketModule, SettingsModule, MailModule, forwardRef(() => BookingsModule)],
  providers: [OrdersService, KitchenPrintService],
  controllers: [OrdersController],
  exports: [OrdersService, KitchenPrintService],
})
export class OrdersModule {}
