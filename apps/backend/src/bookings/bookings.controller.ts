import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common'
import { BookingsService } from './bookings.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'

@Controller('bookings')
export class BookingsController {
  constructor(private bookings: BookingsService) {}

  // Public — anyone can see availability
  @Get('availability')
  getAvailability(@Query('date') date: string) {
    return this.bookings.getAvailability(date)
  }

  // Customer — create booking
  @UseGuards(JwtAuthGuard)
  @Post()
  createBooking(
    @Request() req: any,
    @Body() dto: {
      partySize: number
      slotDate: string
      slotTime: string
      notes?: string
      idempotencyKey: string
    },
  ) {
    return this.bookings.createBooking(req.user.id, dto)
  }

  // Customer — view own bookings
  @UseGuards(JwtAuthGuard)
  @Get('mine')
  getMyBookings(@Request() req: any) {
    return this.bookings.getMyBookings(req.user.id)
  }

  // Customer — cancel own booking
  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  cancelBooking(@Param('id') id: string, @Request() req: any) {
    return this.bookings.cancelBooking(id, req.user.id, false)
  }

  // Staff — today's bookings
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Get('today')
  getTodayBookings() {
    return this.bookings.getTodayBookings()
  }

  // Staff — mark arrived
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Patch(':id/arrived')
  markArrived(@Param('id') id: string) {
    return this.bookings.markArrived(id)
  }

  // Staff — cancel any booking
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Patch(':id/cancel')
  staffCancel(@Param('id') id: string, @Request() req: any) {
    return this.bookings.cancelBooking(id, req.user.id, true)
  }

  // Owner — clear strikes
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Patch('strikes/:customerId/clear')
  clearStrikes(@Param('customerId') customerId: string) {
    return this.bookings.clearStrikes(customerId)
  }
}
