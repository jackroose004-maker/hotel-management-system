import { Module } from '@nestjs/common'
import { OrdersService } from './orders.service'
import { OrdersController } from './orders.controller'
import { WebsocketModule } from '../websocket/websocket.module'
import { PaymentsModule } from '../payments/payments.module'

@Module({
  imports: [WebsocketModule, PaymentsModule],
  providers: [OrdersService],
  controllers: [OrdersController],
})
export class OrdersModule {}
