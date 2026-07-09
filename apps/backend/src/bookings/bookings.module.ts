import { Module, forwardRef } from '@nestjs/common'
import { BookingsController } from './bookings.controller'
import { BookingsService } from './bookings.service'
import { PrismaModule } from '../prisma/prisma.module'
import { SettingsModule } from '../settings/settings.module'
import { MailModule } from '../mail/mail.module'
import { OrdersModule } from '../orders/orders.module'

@Module({
  imports: [PrismaModule, SettingsModule, MailModule, forwardRef(() => OrdersModule)],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
