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
      seatingPreference?: string
      idempotencyKey: string
    },
  ) {
    return this.bookings.createBooking(req.user.id, dto)
  }

  // Public — fetch booking details for QR ticket display (no auth required)
  @Get(':id/public')
  getPublicDetails(@Param('id') id: string) {
    return this.bookings.getPublicBookingDetails(id)
  }

  // Public — mark booking ARRIVED (idempotent)
  @Post(':id/arrive')
  arriveByQr(@Param('id') id: string) {
    return this.bookings.markArrived(id)
  }

  // Staff — full automated check-in: ARRIVED + table OCCUPIED + fire kitchen
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'OWNER')
  @Post(':id/staff-checkin')
  staffCheckIn(@Param('id') id: string) {
    return this.bookings.staffCheckIn(id)
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
  @Roles('OWNER', 'STAFF')
  @Get('today')
  getTodayBookings(@Query('date') date?: string) {
    return this.bookings.getTodayBookings(date)
  }

  // Staff — available reservable tables for a given slot + party size
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Get('available-tables')
  getAvailableTables(
    @Query('date') date: string,
    @Query('time') time: string,
    @Query('partySize') partySize: string,
  ) {
    return this.bookings.getAvailableTablesForSlot(date, time, parseInt(partySize, 10))
  }

  // Staff — all reservable tables for a date + party size (wizard step 3)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Get('tables-for-date')
  getTablesForDate(
    @Query('date') date: string,
    @Query('partySize') partySize: string,
  ) {
    return this.bookings.getTablesForDate(date, parseInt(partySize, 10))
  }

  // Staff — available slots for a specific table on a date (wizard step 4)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Get('slots-for-table')
  getSlotsForTable(
    @Query('date') date: string,
    @Query('tableId') tableId: string,
  ) {
    return this.bookings.getSlotsForTable(date, tableId)
  }

  // Staff — mark arrived
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Patch(':id/arrived')
  markArrived(@Param('id') id: string) {
    return this.bookings.markArrived(id)
  }

  // Staff — cancel any booking
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Patch(':id/cancel')
  staffCancel(@Param('id') id: string, @Request() req: any) {
    return this.bookings.cancelBooking(id, req.user.id, true)
  }

  // Staff — create booking for a walk-in guest
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Post('staff-create')
  staffCreate(@Body() dto: {
    guestName: string
    guestEmail: string
    guestPhone?: string
    partySize: number
    slotDate: string
    slotTime: string
    tableId?: string
    notes?: string
    skipEmail?: boolean
  }) {
    return this.bookings.staffCreateBooking(dto)
  }

  // Staff — confirm a pending booking
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Patch(':id/confirm')
  confirmBooking(@Param('id') id: string) {
    return this.bookings.staffConfirmBooking(id)
  }

  // Owner — clear strikes
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Patch('strikes/:customerId/clear')
  clearStrikes(@Param('customerId') customerId: string) {
    return this.bookings.clearStrikes(customerId)
  }
}
