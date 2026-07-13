import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'
import { MailService } from '../mail/mail.service'
import { OrdersService } from '../orders/orders.service'

const BLOCK_AFTER_STRIKES = 3
const BLOCK_DAYS = 14

const DAY_KEYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

type Shift = { openTime: string; closeTime: string }
type DaySchedule = { open: boolean; shifts: Shift[] }

const DEFAULT_SHIFT: Shift = { openTime: '00:00', closeTime: '00:00' }
const DEFAULT_DAY: DaySchedule = { open: true, shifts: [DEFAULT_SHIFT] }

function getDaySchedule(dateStr: string, weeklySchedule: unknown): DaySchedule {
  const sched = (weeklySchedule && typeof weeklySchedule === 'object' ? weeklySchedule : {}) as Record<string, any>
  const dayKey = DAY_KEYS[new Date(dateStr + 'T12:00:00Z').getUTCDay()]
  const day = sched[dayKey]
  if (!day) return DEFAULT_DAY
  // backwards compat: old format had openTime/closeTime directly on day
  if (!day.shifts && day.openTime !== undefined) {
    return { open: !!day.open, shifts: [{ openTime: day.openTime ?? '00:00', closeTime: day.closeTime ?? '00:00' }] }
  }
  return { open: !!day.open, shifts: Array.isArray(day.shifts) && day.shifts.length ? day.shifts : [DEFAULT_SHIFT] }
}

function generateSlotsForShift(openTime: string, closeTime: string, slotDurationMins: number): string[] {
  const slots: string[] = []
  const [openH, openM = 0] = openTime.split(':').map(Number)
  const [closeH, closeM = 0] = closeTime.split(':').map(Number)
  const is24Hr = openH === 0 && openM === 0 && closeH === 0 && closeM === 0
  const endMinutes = is24Hr ? 24 * 60 : closeH * 60 + closeM
  for (let mins = openH * 60 + openM; mins < endMinutes; mins += slotDurationMins) {
    const h = Math.floor(mins / 60) % 24
    const m = mins % 60
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return slots
}

function generateSlots(daySchedule: DaySchedule, slotDurationMins: number): string[] {
  if (!daySchedule.open || !daySchedule.shifts?.length) return []
  const seen = new Set<string>()
  const all: string[] = []
  for (const shift of daySchedule.shifts) {
    for (const slot of generateSlotsForShift(shift.openTime, shift.closeTime, slotDurationMins)) {
      if (!seen.has(slot)) { seen.add(slot); all.push(slot) }
    }
  }
  return all.sort()
}

type PeakRange = { start: string; end: string }

function getPeakRanges(cfg: { peakRanges: unknown }): PeakRange[] {
  return Array.isArray(cfg.peakRanges) ? (cfg.peakRanges as PeakRange[]) : []
}

function isPeakSlot(time: string, cfg: { peakRanges: unknown }): boolean {
  return getPeakRanges(cfg).some(r => time >= r.start && time < r.end)
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name)

  constructor(
    private prisma: PrismaService,
    private settingsService: SettingsService,
    private mail: MailService,
    @Inject(forwardRef(() => OrdersService)) private ordersService: OrdersService,
  ) {}

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

    const bookableTables = await this.prisma.restaurantTable.count({ where: { isReservable: true, isActive: true } })

    const bookedBySlot = await this.prisma.booking.groupBy({
      by: ['slotTime'],
      where: { slotDate: date, status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED'] } },
      _count: { id: true },
    })

    const bookedMap: Record<string, number> = {}
    for (const b of bookedBySlot) bookedMap[b.slotTime] = b._count.id

    const dayScheduleForAvail = getDaySchedule(dateStr, cfg.weeklySchedule)
    const slots = generateSlots(dayScheduleForAvail, cfg.slotDurationMins).map((time) => {
      const [h, m] = time.split(':').map(Number)
      const slotDatetime = new Date(date)
      slotDatetime.setHours(h, m, 0, 0)

      const isPast = slotDatetime <= new Date(now.getTime() + cfg.sameDayCutoffMins * 60_000)
      const peak = cfg.peakHoursEnabled && isPeakSlot(time, cfg)
      const booked = bookedMap[time] ?? 0
      const available = Math.max(0, bookableTables - booked)

      return {
        time,
        available,
        bookableTables,
        isPast,
        isPeak: peak,
        isWalkInOnly: peak,
        isFull: available === 0 || peak,
      }
    })

    const reservableTables = bookableTables  // isReservable count — walk-in split is now per-table
    return { date: dateStr, slots, bookingsEnabled: true, reservableTables, sameDayCutoffMins: cfg.sameDayCutoffMins }
  }

  async createBooking(
    customerId: string,
    dto: { partySize: number; slotDate: string; slotTime: string; notes?: string; seatingPreference?: string; idempotencyKey: string },
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
    if (cfg.peakHoursEnabled && isPeakSlot(dto.slotTime, cfg)) {
      throw new BadRequestException('Online bookings are not available during peak hours. Please walk in.')
    }

    // Same-day cutoff: reject if slot is less than sameDayCutoffMins from now
    const [slotH, slotM] = dto.slotTime.split(':').map(Number)
    const slotDatetimeCheck = new Date(dto.slotDate)
    slotDatetimeCheck.setHours(slotH, slotM, 0, 0)
    const minsUntilSlot = (slotDatetimeCheck.getTime() - Date.now()) / 60_000
    if (minsUntilSlot < cfg.sameDayCutoffMins) {
      throw new BadRequestException(`Bookings must be made at least ${cfg.sameDayCutoffMins} minutes before the slot time.`)
    }

    // Check slot availability — only tables marked isReservable count
    const bookableTables = await this.prisma.restaurantTable.count({ where: { isReservable: true, isActive: true } })
    const booked = await this.prisma.booking.count({
      where: {
        slotDate,
        slotTime: dto.slotTime,
        status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED'] },
      },
    })
    if (booked >= bookableTables) throw new BadRequestException('This time slot is fully booked.')

    // Assign a free table — prefer seating preference zone if specified
    const bookedTableIds = await this.prisma.booking.findMany({
      where: { slotDate, slotTime: dto.slotTime, status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED'] } },
      select: { tableId: true },
    })
    const taken = bookedTableIds.map((b) => b.tableId).filter(Boolean) as string[]
    // Only assign from isReservable tables — walk-in-only tables must never receive bookings
    const baseWhere = { id: { notIn: taken }, capacity: { gte: dto.partySize }, isActive: { not: false }, isReservable: true }

    // Try preferred zone first, fall back to any zone
    let freeTable = dto.seatingPreference
      ? await this.prisma.restaurantTable.findFirst({
          where: { ...baseWhere, zone: dto.seatingPreference },
          orderBy: { capacity: 'asc' },
        })
      : null
    if (!freeTable) {
      freeTable = await this.prisma.restaurantTable.findFirst({
        where: baseWhere,
        orderBy: { capacity: 'asc' },
      })
    }
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
        seatingPreference: dto.seatingPreference,
        status: 'PENDING',
      },
      include: { table: true, customer: { select: { name: true, email: true } } },
    })

    // Email is NOT sent here. The frontend fires it via /bookings/:id/send-confirmation:
    //  - if customer adds a pre-order → combined email fires from orders.service instead
    //  - if customer skips pre-order  → frontend calls send-confirmation for booking-only email
    // This keeps the customer flow atomic (one email per journey), matching the staff flow.

    return booking
  }

  // Called by the customer frontend when they skip pre-ordering (or navigate away from Booked step).
  // Fires booking-only confirmation email so every booking path results in exactly one email.
  async sendConfirmationEmail(bookingId: string, requesterId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { customerId: true },
    })
    if (!booking) throw new NotFoundException('Booking not found')
    if (booking.customerId !== requesterId) throw new ForbiddenException()
    this.mail.sendCombinedBookingConfirmation(bookingId)
    return { ok: true }
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

    const updated = await this.prisma.$transaction(async tx => {
      if (!isStaff && booking.customerId && minsToSlot < 30 && minsToSlot > 0) {
        const current = await tx.customerStrike.findUnique({ where: { customerId: booking.customerId } })
        const cancelCount = (current?.cancelCount24h ?? 0) + 1
        await tx.customerStrike.upsert({
          where: { customerId: booking.customerId },
          update: { cancelCount24h: cancelCount, isFlagged: cancelCount >= 3 },
          create: { customerId: booking.customerId, cancelCount24h: cancelCount, isFlagged: cancelCount >= 3 },
        })
      }

      return tx.booking.update({
        where: { id: bookingId },
        // Clear tableId so the unique index (tableId, slotDate, slotTime) releases the slot
        // for new bookings. Without this, cancelled bookings silently block the slot.
        data: { status: 'CANCELLED', tableId: null },
        include: { customer: { select: { id: true, name: true, email: true } }, table: true },
      })
    })

    const ref = bookingId.slice(-8).toUpperCase()
    const [slotH, slotM2] = booking.slotTime.split(':').map(Number)
    const slotTime = `${slotH % 12 || 12}:${String(slotM2).padStart(2, '0')} ${slotH >= 12 ? 'PM' : 'AM'}`
    const slotDateStr = new Date(booking.slotDate).toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

    // Email customer
    if (updated.customer?.email) {
      this.mail.sendBookingCancellation(updated.customer.email, updated.customer.name, { ref, slotDate: slotDateStr, slotTime, isStaff })
    }

    // When customer cancels: notify staff via support email + auto-refund paid pre-order
    if (!isStaff) {
      this.mail.sendStaffBookingCancellationAlert({
        ref, guestName: updated.customer?.name ?? 'Guest',
        guestEmail: updated.customer?.email ?? '',
        slotDate: slotDateStr, slotTime,
      }).catch(() => {})

      // Auto-request refund for any paid pre-order
      const paidPreOrder = await this.prisma.order.findFirst({
        where: { bookingId, status: 'PRE_ORDER', paymentStatus: 'PAID' },
      })
      if (paidPreOrder) {
        await this.prisma.order.update({
          where: { id: paidPreOrder.id },
          data: {
            status: 'CANCELLED',
            paymentStatus: 'REFUND_REQUESTED',
            cancelledAt: new Date(),
            cancelReason: 'Booking cancelled by customer',
            statusHistory: { create: { fromStatus: 'PRE_ORDER', toStatus: 'CANCELLED', changedById: null, note: 'Auto-cancelled: booking cancelled by customer' } },
          },
        }).catch(e => this.logger.error(`Failed to flag pre-order for refund: ${e?.message}`))
        this.logger.log(`Pre-order ${paidPreOrder.id} flagged REFUND_REQUESTED — booking ${bookingId} cancelled by customer`)
      }
    }

    return updated
  }

  async markArrived(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } })
    if (!booking) throw new NotFoundException('Booking not found')
    if (booking.status === 'CANCELLED') throw new BadRequestException('Booking is cancelled.')
    if (booking.status === 'ARRIVED') return booking  // idempotent
    return this.prisma.booking.update({ where: { id: bookingId }, data: { status: 'ARRIVED' } })
  }

  private async findBookingByIdOrRef(bookingId: string, include?: any) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)
    if (isUuid) {
      return this.prisma.booking.findUnique({ where: { id: bookingId }, include })
    }
    // Short ref: last 8 chars of UUID (uppercased) — match by id ending
    return this.prisma.booking.findFirst({
      where: { id: { endsWith: bookingId.toLowerCase() } },
      include,
    })
  }

  async getPublicBookingDetails(bookingId: string) {
    const booking = await this.findBookingByIdOrRef(bookingId, {
      table: { select: { tableNumber: true, zone: true } },
      customer: { select: { name: true } },
      preOrders: {
        where: { status: 'PRE_ORDER' },
        include: {
          items: {
            include: { menuItem: { select: { name: true, nameAr: true } } },
          },
        },
      },
    })
    if (!booking) throw new NotFoundException('Booking not found')
    const b = booking as any
    const shortRef = booking.id.slice(-8).toUpperCase()
    return {
      ref: shortRef,
      status: booking.status,
      slotDate: booking.slotDate,
      slotTime: booking.slotTime,
      partySize: booking.partySize,
      guestName: b.customer?.name ?? null,
      table: b.table ? { number: b.table.tableNumber, zone: b.table.zone } : null,
      preOrderItems: (booking as any).preOrders?.flatMap((o: any) =>
        o.items.map((i: any) => ({ name: i.menuItem.name, nameAr: i.menuItem.nameAr, quantity: i.quantity }))
      ) ?? [],
    }
  }

  async staffCheckIn(bookingId: string) {
    const booking = await this.findBookingByIdOrRef(bookingId)
    if (!booking) throw new NotFoundException('Booking not found')
    if (booking.status === 'CANCELLED') throw new BadRequestException('Booking is cancelled')
    if (booking.status === 'ARRIVED') throw new BadRequestException('Guest has already checked in')
    if (booking.status === 'NO_SHOW') throw new BadRequestException('Booking was marked no-show')
    // Check if booking date has passed (allow same-day check-in regardless of slot time)
    const today = new Date(); today.setUTCHours(0, 0, 0, 0)
    const slotDay = new Date(booking.slotDate); slotDay.setUTCHours(0, 0, 0, 0)
    if (slotDay < today) throw new BadRequestException('Booking date has passed')
    await this.ordersService.checkInGuest(booking.id)
    await this.prisma.booking.update({ where: { id: booking.id }, data: { status: 'ARRIVED' } })
    return { success: true, bookingId: booking.id, tableId: booking.tableId }
  }

  async getMyBookings(customerId: string) {
    return this.prisma.booking.findMany({
      where: { customerId },
      orderBy: [{ slotDate: 'desc' }, { slotTime: 'desc' }],
      include: { table: true },
    })
  }

  async getTodayBookings(dateStr?: string) {
    // Use noon UTC anchor to match the @db.Date column regardless of server timezone.
    // slotDate is stored as a date-only value (midnight UTC), so comparing with
    // noon ± 12h always lands within the correct calendar day.
    const anchor = dateStr
      ? new Date(dateStr + 'T12:00:00.000Z')
      : (() => { const d = new Date(); d.setUTCHours(12, 0, 0, 0); return d })()
    const start = new Date(anchor); start.setUTCHours(0, 0, 0, 0)
    const end   = new Date(anchor); end.setUTCHours(23, 59, 59, 999)

    return this.prisma.booking.findMany({
      where: { slotDate: { gte: start, lte: end } },
      orderBy: { slotTime: 'asc' },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        table: true,
        preOrders: {
          where: { status: 'PRE_ORDER' },
          include: {
            items: {
              include: {
                menuItem: { select: { name: true } },
                modifiers: true,
              },
            },
          },
        },
      },
    })
  }

  async staffConfirmBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } })
    if (!booking) throw new NotFoundException('Booking not found')
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CONFIRMED' },
      include: { customer: { select: { id: true, name: true, phone: true } }, table: true },
    })
  }

  async staffCreateBooking(dto: {
    guestName: string
    guestEmail: string          // required — guest must have an account
    guestPhone?: string
    partySize: number
    slotDate: string
    slotTime: string
    tableId?: string
    notes?: string
    skipEmail?: boolean         // true when staff will add pre-order next — email sent after that step
  }) {
    if (!dto.guestEmail) throw new BadRequestException('Guest email is required')
    const slotDate = new Date(dto.slotDate)
    if (isNaN(slotDate.getTime())) throw new BadRequestException('Invalid date')

    // ── Validate against restaurant settings (bookingsEnabled is the only bypass) ──
    const cfg = await this.settingsService.get()

    // Check day schedule
    const daySchedule = getDaySchedule(dto.slotDate, cfg.weeklySchedule)
    const dayName = DAY_NAMES[new Date(dto.slotDate + 'T12:00:00Z').getUTCDay()]
    if (!daySchedule.open) {
      throw new BadRequestException(`Restaurant is closed on ${dayName}s.`)
    }

    // Must be a valid slot on this day's operating-hours grid
    const validSlots = generateSlots(daySchedule, cfg.slotDurationMins)
    if (!validSlots.includes(dto.slotTime)) {
      throw new BadRequestException(`Slot ${dto.slotTime} is outside ${dayName} operating hours.`)
    }

    // Peak hours block applies to all channels
    if (cfg.peakHoursEnabled && isPeakSlot(dto.slotTime, cfg)) {
      throw new BadRequestException('This slot falls in peak hours — walk-in only during peak times.')
    }

    // Same-day cutoff applies to all channels
    const [slotH, slotM] = dto.slotTime.split(':').map(Number)
    const slotDatetime = new Date(slotDate)
    slotDatetime.setHours(slotH, slotM, 0, 0)
    const minsUntilSlot = (slotDatetime.getTime() - Date.now()) / 60_000
    if (minsUntilSlot < cfg.sameDayCutoffMins) {
      throw new BadRequestException(`Bookings must be made at least ${cfg.sameDayCutoffMins} minutes before the slot.`)
    }

    // Max days ahead applies to all channels
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const maxDate = new Date(today); maxDate.setDate(maxDate.getDate() + cfg.maxBookingDaysAhead)
    if (slotDate > maxDate) {
      throw new BadRequestException(`Cannot book more than ${cfg.maxBookingDaysAhead} days in advance.`)
    }

    // ── Resolve or create customer (outside tx — bcrypt is CPU-bound) ──────────
    let tempPassword: string | null = null
    let isNewCustomer = false

    const existing = await this.prisma.user.findUnique({ where: { email: dto.guestEmail } })
    let customerId: string
    let customerEmail: string
    let customerName: string

    if (existing) {
      customerId    = existing.id
      customerEmail = existing.email
      customerName  = dto.guestName  // use the name staff entered (may differ)
    } else {
      tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase()
      isNewCustomer = true
      customerEmail = dto.guestEmail
      customerName  = dto.guestName
    }

    // Hash outside the transaction — bcrypt is slow and must not hold a tx open
    const newPasswordHash = isNewCustomer ? await bcrypt.hash(tempPassword!, 10) : null

    // ── Assign table (outside tx — read-only, no need to lock) ──────────────
    let tableId = dto.tableId
    if (!tableId) {
      const bookedTableIds = await this.prisma.booking.findMany({
        where: { slotDate, slotTime: dto.slotTime, status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED'] } },
        select: { tableId: true },
      })
      const taken = bookedTableIds.map(b => b.tableId).filter(Boolean) as string[]
      const freeTable = await this.prisma.restaurantTable.findFirst({
        where: { id: { notIn: taken }, capacity: { gte: dto.partySize }, isActive: { not: false }, isReservable: true },
        orderBy: { capacity: 'asc' },
      })
      tableId = freeTable?.id
    }

    // ── Atomic: upsert customer + create booking together ───────────────────
    let booking: Awaited<ReturnType<typeof this.prisma.booking.create>>
    try { booking = await this.prisma.$transaction(async tx => {
      let resolvedCustomerId = customerId!

      if (isNewCustomer) {
        const created = await tx.user.create({
          data: { name: customerName, email: customerEmail, phone: dto.guestPhone ?? null, passwordHash: newPasswordHash!, role: 'CUSTOMER', isVerified: true },
        })
        resolvedCustomerId = created.id
        customerId = created.id
      } else if (existing && (existing.name !== dto.guestName || (dto.guestPhone && existing.phone !== dto.guestPhone))) {
        await tx.user.update({ where: { id: existing.id }, data: { name: dto.guestName, phone: dto.guestPhone ?? existing.phone } })
      }

      return tx.booking.create({
        data: {
          customerId: resolvedCustomerId,
          tableId: tableId ?? null,
          partySize: dto.partySize,
          slotDate,
          slotTime: dto.slotTime,
          notes: dto.notes,
          status: 'CONFIRMED',
          idempotencyKey: `staff-${Date.now()}-${resolvedCustomerId}-${dto.slotTime}`,
        },
        include: { customer: { select: { id: true, name: true, email: true, phone: true } }, table: true },
      })
    }) } catch (err: any) {
      // P2002 = unique constraint — table already has a booking at that slot
      if (err?.code === 'P2002') throw new ConflictException('This table is already booked for that time slot. Please choose a different table or time.')
      throw err
    }

    // ── Notify customer (fire-and-forget, after tx commits) ──────────────────
    // skipEmail=true → staff is adding pre-order next; combined email fires from createPreOrder.
    // skipEmail=false (or absent) → send now. Always use sendCombinedBookingConfirmation
    // so new-customer credentials and booking details arrive in one email.
    if (!dto.skipEmail) {
      // tempPassword only set for new customers — combined email handles both cases
      this.mail.sendCombinedBookingConfirmation(booking.id, isNewCustomer && tempPassword ? tempPassword : undefined)
    }

    return {
      ...booking,
      isNewCustomer,
      customerCreated: true,
      // Return plaintext temp password ONLY when email is being deferred so
      // the caller can pass it through to the combined email step.
      ...(dto.skipEmail && isNewCustomer && tempPassword ? { tempPassword } : {}),
    }
  }

  async getAvailableTablesForSlot(dateStr: string, slotTime: string, partySize: number) {
    const slotDate = new Date(dateStr)
    if (isNaN(slotDate.getTime())) throw new BadRequestException('Invalid date')

    const bookedTableIds = await this.prisma.booking.findMany({
      where: { slotDate, slotTime, status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED'] } },
      select: { tableId: true },
    })
    const taken = bookedTableIds.map(b => b.tableId).filter(Boolean) as string[]

    return this.prisma.restaurantTable.findMany({
      where: { id: { notIn: taken }, capacity: { gte: partySize }, isActive: true, isReservable: true },
      orderBy: { capacity: 'asc' },
      select: { id: true, tableNumber: true, name: true, capacity: true, zone: true },
    })
  }

  // Returns all reservable tables with enough capacity for the date
  async getTablesForDate(dateStr: string, partySize: number) {
    const slotDate = new Date(dateStr)
    if (isNaN(slotDate.getTime())) throw new BadRequestException('Invalid date')
    const tables = await this.prisma.restaurantTable.findMany({
      where: { capacity: { gte: partySize }, isActive: true, isReservable: true },
      orderBy: { capacity: 'asc' },
      select: { id: true, tableNumber: true, name: true, capacity: true, zone: true },
    })
    const message = tables.length === 0
      ? `No reservable tables available for a party of ${partySize}. Try a different date or party size.`
      : `${tables.length} table${tables.length > 1 ? 's' : ''} available for ${partySize} guest${partySize > 1 ? 's' : ''} on ${dateStr}.`
    return { _data: tables, _message: message }
  }

  // Returns available time slots for a specific table on a given date, grouped by period
  async getSlotsForTable(dateStr: string, tableId: string) {
    const slotDate = new Date(dateStr)
    if (isNaN(slotDate.getTime())) throw new BadRequestException('Invalid date')
    const cfg = await this.settingsService.get()

    const table = await this.prisma.restaurantTable.findUnique({
      where: { id: tableId },
      select: { tableNumber: true, name: true },
    })

    const bookedSlots = await this.prisma.booking.findMany({
      where: { tableId, slotDate, status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED'] } },
      select: { slotTime: true },
    })
    const bookedSet = new Set(bookedSlots.map(b => b.slotTime))

    const tableName = table ? (table.name ?? `Table ${table.tableNumber}`) : 'this table'
    const dayIdx = new Date(dateStr + 'T12:00:00Z').getUTCDay()
    const dayName = DAY_NAMES[dayIdx]

    // Get this day's specific schedule
    const daySchedule = getDaySchedule(dateStr, cfg.weeklySchedule)
    if (!daySchedule.open) {
      return {
        _data: { slots: [], grouped: { morning: [], afternoon: [], evening: [] }, openTime: '00:00', closeTime: '00:00', slotDurationMins: cfg.slotDurationMins },
        _message: `Restaurant is closed on ${dayName}s.`,
      }
    }

    const allSlots = generateSlots(daySchedule, cfg.slotDurationMins)

    // Filter out past slots for today (using same cutoff as public availability)
    const now = new Date()
    const cutoffMs = now.getTime() + cfg.sameDayCutoffMins * 60_000
    const isToday = slotDate.toDateString() === now.toDateString()
    const futureSlots = isToday
      ? allSlots.filter(s => {
          const [h, m] = s.split(':').map(Number)
          const slotDatetime = new Date(slotDate)
          slotDatetime.setHours(h, m, 0, 0)
          return slotDatetime.getTime() > cutoffMs
        })
      : allSlots

    const nonBusySlots = cfg.peakHoursEnabled
      ? futureSlots.filter(s => !isPeakSlot(s, cfg))
      : futureSlots
    const available = nonBusySlots.filter(s => !bookedSet.has(s))

    const grouped = {
      morning:   available.filter(t => parseInt(t) < 12),
      afternoon: available.filter(t => { const h = parseInt(t); return h >= 12 && h < 18 }),
      evening:   available.filter(t => parseInt(t) >= 18),
    }

    const totalAll = futureSlots.length
    const booked = totalAll - available.length

    let message: string
    if (available.length === 0 && totalAll === 0) {
      message = `Restaurant operating hours are not configured. Please check settings.`
    } else if (available.length === 0) {
      message = `${tableName} is fully booked on ${dateStr} (all ${booked} slots taken). Please select a different table or date.`
    } else {
      message = `${available.length} slot${available.length > 1 ? 's' : ''} available for ${tableName} on ${dateStr} (${booked} already booked).`
    }

    const firstShift = daySchedule.shifts?.[0] ?? DEFAULT_SHIFT
    return {
      _data: { slots: available, grouped, openTime: firstShift.openTime, closeTime: firstShift.closeTime, slotDurationMins: cfg.slotDurationMins },
      _message: message,
    }
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
        const peak = cfg.peakHoursEnabled && isPeakSlot(b.slotTime, cfg)
        // Minimum 1 min grace even if peak grace is set to 0 — prevents instant NO_SHOW on CONFIRMED
        const windowMins = Math.max(1, peak ? cfg.noShowGracePeriodPeak : cfg.noShowGracePeriodOffPeak)
        const expiresAt = new Date(slotTime.getTime() + windowMins * 60_000)
        await this.prisma.booking.update({
          where: { id: b.id },
          data: { status: 'CONFIRMED', slotExpiresAt: expiresAt },
        })
      }
    }

    // Expire bookings with slotExpiresAt set
    const expired = await this.prisma.booking.findMany({
      where: { status: 'CONFIRMED', slotExpiresAt: { lt: now } },
      include: { customer: { select: { email: true } } },
    })
    // Also catch CONFIRMED bookings where slotExpiresAt was never set (e.g. manually confirmed)
    // by checking if slot time + default grace has passed
    const confirmedNoExpiry = await this.prisma.booking.findMany({
      where: { status: 'CONFIRMED', slotExpiresAt: null },
      include: { customer: { select: { email: true } } },
    })
    for (const b of confirmedNoExpiry) {
      const [h, m] = b.slotTime.split(':').map(Number)
      const slotTime = new Date(b.slotDate); slotTime.setHours(h, m, 0, 0)
      const peak = cfg.peakHoursEnabled && isPeakSlot(b.slotTime, cfg)
      const windowMins = Math.max(1, peak ? cfg.noShowGracePeriodPeak : cfg.noShowGracePeriodOffPeak)
      if (new Date(slotTime.getTime() + windowMins * 60_000) < now) {
        expired.push(b)
      }
    }
    for (const b of expired) {
      await this.prisma.booking.update({ where: { id: b.id }, data: { status: 'NO_SHOW', tableId: null } })
      if (b.customerId) await this.upsertStrike(b.customerId, true)
      if (b.customerId) this.mail.sendNoShowEmail(b.id).catch(() => {})
    }
  }

  // Daily midnight: reset 24h cancel count
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async resetDailyCancelCount() {
    await this.prisma.customerStrike.updateMany({ data: { cancelCount24h: 0 } })
  }
}
