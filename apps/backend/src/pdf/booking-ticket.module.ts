import { Module } from '@nestjs/common'
import { BookingTicketService } from './booking-ticket.service'

@Module({
  providers: [BookingTicketService],
  exports: [BookingTicketService],
})
export class BookingTicketModule {}
