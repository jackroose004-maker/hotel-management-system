import { Module } from '@nestjs/common'
import { BookingsController } from './bookings.controller'
import { BookingsService } from './bookings.service'
import { PrismaModule } from '../prisma/prisma.module'
import { SettingsModule } from '../settings/settings.module'

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
