import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'

const BLOCK_AFTER_STRIKES = 3
const BLOCK_DAYS = 14

function generateSlots(openTime: string, closeTime: string, slotDurationMins: number): string[] {
  const slots: string[] = []
  const [openH] = openTime.split(':').map(Number)
  const [closeH] = closeTime.split(':').map(Number)
  for (let h = openH; h < closeH; h++) {
    for (let m = 0; m < 60; m += slotDurationMins) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return slots
}

function isPeakSlot(time: string, peakStart: string, peakEnd: string): boolean {
  return time >= peakStart && time < peakEnd
}

@Injectable()
export class BookingsService {
  constructor(private prisma: PrismaService, private settingsService: SettingsService) {}

  async getAvailability(dateStr: string) {
    const cfg = await this.settingsService.get()
    if (!cfg.bookingsEnabled) return { date: dateStr, slots: [], bookingsEnabled: false }

    const date = new Date(dateStr)
    if (isNaN(date.getTime())) throw new BadRequestException('Invalid date')

    const now = new Date()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const maxDate = new Date(today)
    maxDate.setDate(maxDate.getDate() + cfg.maxBookingDaysAhead)
    if (date > maxDate) throw new BadRequestException(`Date too far ahead (max ${cfg.maxBookingDaysAhead} days)`)

    const totalTables = await this.prisma.restaurantTable.count()
    const bookableTables = Math.max(0, totalTables - cfg.walkInBuffer)

    const bookedBySlot = await this.prisma.booking.groupBy({
      by: ['slotTime'],
      where: { slotDate: date, status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED'] } },
      _count: { id: true },
    })

    const bookedMap: Record<string, number> = {}
    for (const b of bookedBySlot) bookedMap[b.slotTime] = b._count.id

    const slots = generateSlots(cfg.openTime, cfg.closeTime, cfg.slotDurationMins).map((time) => {
      const [h, m] = time.split(':').map(Number)
      const slotDatetime = new Date(date)
      slotDatetime.setHours(h, m, 0, 0)

      const isPast = slotDatetime <= new Date(now.getTime() + 30 * 60_000)
      const peak = cfg.peakHoursEnabled && isPeakSlot(time, cfg.peakStart, cfg.peakEnd)
      const booked = bookedMap[time] ?? 0
      const available = Math.max(0, bookableTables - booked)

      return {
        time,
        available,
        bookableTables,
        totalTables,
        isPast,
        isPeak: peak,
        isWalkInOnly: peak,
        isFull: available === 0 || peak,
      }
    })

    return { date: dateStr, slots, bookingsEnabled: true, walkInBuffer: cfg.walkInBuffer }
  }

  async createBooking(
    customerId: string,
    dto: { partySize: number; slotDate: string; slotTime: string; notes?: string; idempotencyKey: string },
  ) {
    // Idempotency check
    const existing = await this.prisma.booking.findUnique({ where: { idempotencyKey: dto.idempotencyKey } })
    if (existing) return existing

    // Check customer not blocked
    const strike = await this.prisma.customerStrike.findUnique({ where: { customerId } })
    if (strike?.blockedUntil && strike.blockedUntil > new Date()) {
      throw new ForbiddenException(
        `Booking access suspended until ${strike.blockedUntil.toLocaleDateString('en-AE')} due to repeated no-shows.`,
      )
    }

    const slotDate = new Date(dto.slotDate)
    if (isNaN(slotDate.getTime())) throw new BadRequestException('Invalid date')

    // One active booking per customer per day
    const alreadyBooked = await this.prisma.booking.findFirst({
      where: {
        customerId,
        slotDate,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    })
    if (alreadyBooked) throw new BadRequestException('You already have an active booking for this date.')

    // Check peak hour block
    const cfg = await this.settingsService.get()
    if (cfg.peakHoursEnabled && isPeakSlot(dto.slotTime, cfg.peakStart, cfg.peakEnd)) {
      throw new BadRequestException('Online bookings are not available during peak hours. Please walk in.')
    }

    // Check slot availability
    const totalTables = await this.prisma.restaurantTable.count()
    const bookableTables = Math.max(0, totalTables - cfg.walkInBuffer)
    const booked = await this.prisma.booking.count({
      where: {
        slotDate,
        slotTime: dto.slotTime,
        status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED'] },
      },
    })
    if (booked >= bookableTables) throw new BadRequestException('This time slot is fully booked.')

    // Assign a free table
    const bookedTableIds = await this.prisma.booking.findMany({
      where: { slotDate, slotTime: dto.slotTime, status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED'] } },
      select: { tableId: true },
    })
    const taken = bookedTableIds.map((b) => b.tableId).filter(Boolean) as string[]
    const freeTable = await this.prisma.restaurantTable.findFirst({
      where: { id: { notIn: taken }, capacity: { gte: dto.partySize } },
      orderBy: { capacity: 'asc' },
    })
    if (!freeTable) throw new BadRequestException('No suitable table available for your party size.')

    const booking = await this.prisma.booking.create({
      data: {
        customerId,
        tableId: freeTable.id,
        partySize: dto.partySize,
        slotDate,
        slotTime: dto.slotTime,
        idempotencyKey: dto.idempotencyKey,
        notes: dto.notes,
        status: 'PENDING',
      },
      include: { table: true },
    })

    return booking
  }

  async cancelBooking(bookingId: string, requesterId: string, isStaff: boolean) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } })
    if (!booking) throw new NotFoundException('Booking not found')
    if (!isStaff && booking.customerId !== requesterId) throw new ForbiddenException()
    if (['ARRIVED', 'NO_SHOW', 'CANCELLED'].includes(booking.status)) {
      throw new BadRequestException('Booking cannot be cancelled.')
    }

    // Cancelling within 30 min of slot = soft warning (no strike)
    const [h, m] = booking.slotTime.split(':').map(Number)
    const slotDatetime = new Date(booking.slotDate)
    slotDatetime.setHours(h, m, 0, 0)
    const minsToSlot = (slotDatetime.getTime() - Date.now()) / 60_000

    if (!isStaff && minsToSlot < 30 && minsToSlot > 0) {
      await this.upsertStrike(booking.customerId, false, true)
    }

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
    })
  }

  async markArrived(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } })
    if (!booking) throw new NotFoundException('Booking not found')
    if (booking.status === 'CANCELLED') throw new BadRequestException('Booking is cancelled.')
    return this.prisma.booking.update({ where: { id: bookingId }, data: { status: 'ARRIVED' } })
  }

  async getMyBookings(customerId: string) {
    return this.prisma.booking.findMany({
      where: { customerId },
      orderBy: [{ slotDate: 'desc' }, { slotTime: 'desc' }],
      include: { table: true },
    })
  }

  async getTodayBookings() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    return this.prisma.booking.findMany({
      where: { slotDate: { gte: today, lt: tomorrow } },
      orderBy: { slotTime: 'asc' },
      include: { customer: { select: { id: true, name: true, phone: true } }, table: true },
    })
  }

  async clearStrikes(customerId: string) {
    return this.prisma.customerStrike.update({
      where: { customerId },
      data: { noShowCount: 0, blockedUntil: null, isFlagged: false },
    })
  }

  private async upsertStrike(customerId: string, isNoShow: boolean, isLateCancellation = false) {
    const current = await this.prisma.customerStrike.findUnique({ where: { customerId } })
    const noShowCount = isNoShow ? (current?.noShowCount ?? 0) + 1 : (current?.noShowCount ?? 0)
    const cancelCount = isLateCancellation ? (current?.cancelCount24h ?? 0) + 1 : (current?.cancelCount24h ?? 0)
    const blockedUntil =
      noShowCount >= BLOCK_AFTER_STRIKES
        ? new Date(Date.now() + BLOCK_DAYS * 24 * 60 * 60 * 1000)
        : current?.blockedUntil ?? null
    const isFlagged = cancelCount >= 3

    await this.prisma.customerStrike.upsert({
      where: { customerId },
      update: {
        noShowCount,
        cancelCount24h: cancelCount,
        blockedUntil,
        isFlagged,
        ...(isNoShow ? { lastNoShowAt: new Date() } : {}),
      },
      create: {
        customerId,
        noShowCount,
        cancelCount24h: cancelCount,
        blockedUntil,
        isFlagged,
        ...(isNoShow ? { lastNoShowAt: new Date() } : {}),
      },
    })
  }

  // Every 5 min: PENDING → CONFIRMED when slot time reached (set expires_at from settings)
  // Every 5 min: CONFIRMED → NO_SHOW when window expires
  @Cron('*/5 * * * *')
  async expireNoShows() {
    const now = new Date()
    const cfg = await this.settingsService.get()

    // Activate pending slots first
    const pending = await this.prisma.booking.findMany({ where: { status: 'PENDING' } })
    for (const b of pending) {
      const [h, m] = b.slotTime.split(':').map(Number)
      const slotTime = new Date(b.slotDate)
      slotTime.setHours(h, m, 0, 0)
      if (slotTime <= now) {
        const peak = cfg.peakHoursEnabled && isPeakSlot(b.slotTime, cfg.peakStart, cfg.peakEnd)
        const windowMins = peak ? cfg.noShowWindowPeak : cfg.noShowWindowOffPeak
        const expiresAt = new Date(slotTime.getTime() + windowMins * 60_000)
        await this.prisma.booking.update({
          where: { id: b.id },
          data: { status: 'CONFIRMED', slotExpiresAt: expiresAt },
        })
      }
    }

    const expired = await this.prisma.booking.findMany({
      where: { status: 'CONFIRMED', slotExpiresAt: { lt: now } },
    })
    for (const b of expired) {
      await this.prisma.booking.update({ where: { id: b.id }, data: { status: 'NO_SHOW' } })
      await this.upsertStrike(b.customerId, true)
    }
  }

  // Daily midnight: reset 24h cancel count
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async resetDailyCancelCount() {
    await this.prisma.customerStrike.updateMany({ data: { cancelCount24h: 0 } })
  }
}
