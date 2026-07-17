import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { OrdersGateway } from '../websocket/orders.gateway'
import { KitchenPrintService } from './kitchen-print.service'
import { SettingsService } from '../settings/settings.service'
import { MailService } from '../mail/mail.service'
import { PushService } from '../push/push.service'
import { OffersService } from '../offers/offers.service'
import { CreateOrderDto, UpdateOrderStatusDto, AddOrderItemsDto } from './dto/create-order.dto'
import { OrderStatus } from '@prisma/client'
import { randomUUID } from 'crypto'

const VAT_RATE = 0.05

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name)

  constructor(
    private prisma: PrismaService,
    private gateway: OrdersGateway,
    private kitchenPrint: KitchenPrintService,
    private settings: SettingsService,
    private mail: MailService,
    private push: PushService,
    private offers: OffersService,
  ) {}

  // Every 5 minutes: fire PRE_ORDER orders to kitchen when within the lead-time window.
  // The table is NOT marked OCCUPIED here — that only happens when staff explicitly check
  // the guest in via the "Check In" action (which also fires the pre-order if not yet done).
  @Cron(CronExpression.EVERY_5_MINUTES)
  async releasePreOrdersToKitchen() {
    const cfg = await this.settings.get()
    const leadMins = (cfg as any).preOrderLeadMins ?? 30
    const now = new Date()
    const windowEnd = new Date(now.getTime() + leadMins * 60_000)

    const preOrders = await this.prisma.order.findMany({
      where: { status: 'PRE_ORDER', booking: { status: { in: ['CONFIRMED', 'PENDING'] } } },
      include: { booking: { select: { id: true, slotDate: true, slotTime: true } } },
    })

    for (const po of preOrders) {
      if (!po.booking) continue
      const [h, m] = po.booking.slotTime.split(':').map(Number)
      const slotDatetime = new Date(po.booking.slotDate)
      slotDatetime.setHours(h, m, 0, 0)
      if (slotDatetime <= windowEnd) {
        this.logger.log(`Auto-releasing pre-order ${po.id} to kitchen (slot ${po.booking.slotTime}, lead ${leadMins}m)`)
        await this.firePreOrderToKitchen(po.booking.id).catch(e =>
          this.logger.error(`Failed to auto-release pre-order for booking ${po.booking!.id}: ${e?.message}`)
        )
      }
    }
  }

  async create(dto: CreateOrderDto, userId?: string, clientIp?: string, isStaff = false) {
    // Fetch all menu items to calculate prices server-side
    const itemIds = dto.items.map(i => i.menuItemId)
    const menuItems = await this.prisma.menuItem.findMany({ where: { id: { in: itemIds } } })

    if (menuItems.length !== itemIds.length) throw new BadRequestException('One or more menu items not found')
    if (dto.type === 'DINE_IN' && !dto.tableId) throw new BadRequestException('Table number is required for dine-in orders')

    const menuMap = new Map(menuItems.map(m => [m.id, m]))

    // ASP (market-price) items: guests can't self-checkout them; staff must supply a live quote.
    for (const item of dto.items) {
      const menuItem = menuMap.get(item.menuItemId)!
      if (menuItem.isMarketPrice) {
        if (!isStaff) throw new BadRequestException(`${menuItem.name} is priced per market rate — please ask a staff member to add it for you.`)
        if (!item.customPrice || item.customPrice <= 0) throw new BadRequestException(`Enter today's price for ${menuItem.name}`)
      }
    }
    const priceFor = (item: typeof dto.items[number]) => {
      const menuItem = menuMap.get(item.menuItemId)!
      return menuItem.isMarketPrice ? Number(item.customPrice) : Number(menuItem.price)
    }

    // Seasonal offers: best matching discount per line item (base price only, not modifiers).
    // ASP items are excluded — daily market pricing and promo discounts don't mix.
    const activeOffers = await this.offers.getActiveNow()
    const offerByItem = new Map<string, { name: string; amount: number }>()
    if (activeOffers.length) {
      for (const item of dto.items) {
        const menuItem = menuMap.get(item.menuItemId)!
        if (menuItem.isMarketPrice) continue
        const best = OffersService.pickBestOffer(activeOffers as any, item.menuItemId, menuItem.categoryId, priceFor(item))
        if (best) offerByItem.set(item.menuItemId, { name: best.offer.name, amount: Math.round(best.amount * item.quantity * 100) / 100 })
      }
    }

    const subtotal = dto.items.reduce((sum, item) => {
      const price = priceFor(item)
      const modExtra = (item.modifiers ?? []).reduce((ms, m) => ms + Number(m.priceAdd ?? 0), 0)
      const discount = offerByItem.get(item.menuItemId)?.amount ?? 0
      return sum + (price + modExtra) * item.quantity - discount
    }, 0)

    // Flat packing charge on takeaway orders (0 = disabled in settings)
    const cfgForCharge = await this.settings.get()
    const packingCharge = dto.type === 'TAKEAWAY' ? Number((cfgForCharge as any).packingCharge ?? 0) : 0
    const vatAmount = Math.round((subtotal + packingCharge) * VAT_RATE * 100) / 100
    const total = Math.round((subtotal + packingCharge + vatAmount) * 100) / 100

    // Every order gets a sequential daily reference number (used by both dine-in and takeaway)
    const lastOrder = await this.prisma.order.findFirst({
      where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      orderBy: { tokenNumber: 'desc' },
      select: { tokenNumber: true },
    })
    const tokenNumber = (lastOrder?.tokenNumber ?? 0) + 1

    // Each person at a table gets their own tab (tableSessionId).
    // The table is just a delivery location — identity comes from the person, not the table.
    //
    //   Guest  → sends guestTabToken (UUID from sessionStorage on their device)
    //            Same device ordering again = same token = same tab = same bill
    //            Different phone at same table = different token = separate bill
    //
    //   Logged-in customer → find their open tab at this table today, or start a new one
    //            C1 and C2 both logged in at Table 5 → two separate sessions
    //
    //   Staff order → joins the latest active session for the table (no personal token)
    let tableSessionId: string | undefined
    let isNewTableSession = false  // track whether this order starts a brand-new seating
    if (dto.type === 'DINE_IN' && dto.tableId) {
      if (dto.guestTabToken) {
        // Guest scanning QR: device token IS their tab.
        // Check if this token already has active orders — if not, it's a new seating.
        tableSessionId = dto.guestTabToken
        const existingInSession = await this.prisma.order.findFirst({
          where: { tableSessionId: dto.guestTabToken, paymentStatus: 'UNPAID', status: { not: 'CANCELLED' } },
          select: { id: true },
        })
        isNewTableSession = !existingInSession
      } else if (userId) {
        // Logged-in customer: find their open (unsettled) tab at this table today
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const existing = await this.prisma.order.findFirst({
          where: {
            tableId: dto.tableId,
            userId,
            tableSessionId: { not: null },
            createdAt: { gte: today },
            paymentStatus: 'UNPAID',
          },
          orderBy: { createdAt: 'desc' },
          select: { tableSessionId: true },
        })
        isNewTableSession = !existing
        tableSessionId = existing?.tableSessionId ?? randomUUID()
      } else {
        // Staff placing an order — attach to the table's currently OPEN session only.
        // A session with no unpaid orders left is closed/settled — never reuse its
        // token, or old paid orders get pulled back into the new bill's total.
        const existing = await this.prisma.order.findFirst({
          where: { tableId: dto.tableId, tableSessionId: { not: null }, paymentStatus: 'UNPAID', status: { not: 'CANCELLED' } },
          orderBy: { createdAt: 'desc' },
          select: { tableSessionId: true },
        })
        isNewTableSession = !existing
        tableSessionId = existing?.tableSessionId ?? randomUUID()
      }
    }

    // Pre-check table protection window before opening the transaction
    if (dto.type === 'DINE_IN' && dto.tableId && isNewTableSession) {
      const cfg = await this.settings.get()
      if (cfg.tableReleaseWindowMins > 0) {
        const now = new Date()
        const todayDate = new Date(now); todayDate.setHours(0, 0, 0, 0)
        const windowEnd = new Date(now.getTime() + cfg.tableReleaseWindowMins * 60_000)
        const upcomingBooking = await this.prisma.booking.findFirst({
          where: { tableId: dto.tableId, status: { in: ['PENDING', 'CONFIRMED'] }, slotDate: todayDate },
        })
        if (upcomingBooking) {
          const [h, m] = upcomingBooking.slotTime.split(':').map(Number)
          const slotDt = new Date(todayDate); slotDt.setHours(h, m, 0, 0)
          if (slotDt > now && slotDt <= windowEnd) {
            throw new BadRequestException(
              `This table is reserved for a booking at ${upcomingBooking.slotTime}. It cannot be seated within the ${cfg.tableReleaseWindowMins}-minute protection window.`
            )
          }
        }
      }
    }

    // Skip the approval step (PENDING) when:
    //  - staff places the order (they ARE the approval), or
    //  - the same session already has an APPROVED order — first order must be
    //    approved by staff; only then do follow-up orders go straight to kitchen.
    let skipApproval = isStaff
    if (!skipApproval && dto.type === 'DINE_IN' && tableSessionId && !isNewTableSession) {
      const approvedInSession = await this.prisma.order.findFirst({
        where: {
          tableSessionId,
          status: { in: ['ACCEPTED', 'PREPARING', 'READY', 'DELIVERED'] },
          isVoided: false,
        },
        select: { id: true },
      })
      skipApproval = !!approvedInSession
    }

    // Guest cooling hold (Swiggy-style): guest orders wait selfCancelWindowMins before
    // reaching the kitchen/approval queue — during this time the guest can cancel free
    // (card payments auto-refund). Staff orders and booking pre-orders are never held.
    const holdMins = (!isStaff && !dto.bookingId) ? Math.max(0, Number((cfgForCharge as any).selfCancelWindowMins ?? 0)) : 0
    const heldUntil = holdMins > 0 ? new Date(Date.now() + holdMins * 60_000) : null
    if (heldUntil) skipApproval = false // decision re-made at release time

    const order = await this.prisma.$transaction(async tx => {
      const created = await tx.order.create({
        data: {
          type: dto.type,
          tableId: dto.tableId,
          tableSessionId,
          userId,
          tokenNumber,
          subtotal,
          vatAmount,
          packingCharge,
          total,
          heldUntil,
          notes: dto.notes,
          clientIp,
          contactPhone: dto.contactPhone,
          items: {
            create: dto.items.map(item => {
              const offer = offerByItem.get(item.menuItemId)
              return {
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                unitPrice: priceFor(item),
                notes: item.notes,
                ...(offer ? { offerName: offer.name, offerAmount: offer.amount } : {}),
                modifiers: item.modifiers?.length ? {
                  create: item.modifiers.map(m => ({
                    optionId: m.optionId,
                    name: m.name,
                    priceAdd: m.priceAdd,
                  }))
                } : undefined,
              }
            }),
          },
          ...(dto.bookingId
            ? { bookingId: dto.bookingId, status: 'PRE_ORDER' }
            : skipApproval
              ? { status: 'ACCEPTED' }
              : {}),
          statusHistory: { create: { fromStatus: null, toStatus: dto.bookingId ? 'PRE_ORDER' : skipApproval ? 'ACCEPTED' : 'PENDING', changedById: userId } },
        },
        include: { items: { include: { menuItem: true, modifiers: true } }, table: true },
      })

      // Mark table OCCUPIED only for walk-ins (no active booking on this table today).
      // Pre-orders from booking flow keep the table RESERVED until guest physically arrives.
      if (dto.type === 'DINE_IN' && dto.tableId) {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const activeBooking = await tx.booking.findFirst({
          where: { tableId: dto.tableId, slotDate: today, status: { in: ['PENDING', 'CONFIRMED'] } },
          select: { id: true },
        })
        if (!activeBooking) {
          await tx.restaurantTable.update({ where: { id: dto.tableId }, data: { status: 'OCCUPIED' } })
        }
      }

      return created
    })

    this.gateway.emitNewOrder(order)

    // Web push to staff devices — fires even when the staff tab/browser is closed.
    // Held orders alert staff only at release (cooling window may end in a free cancel).
    if (!dto.bookingId && !heldUntil) {
      const where = order.table ? (order.table.name ?? `Table ${order.table.tableNumber}`) : `Takeaway #${tokenNumber}`
      const itemCount = dto.items.reduce((s, i) => s + i.quantity, 0)
      this.push.notifyStaff(
        skipApproval ? '🛎 New Order — In Kitchen' : '🛎 New Order — Needs Approval',
        `${where} · ${itemCount} item${itemCount !== 1 ? 's' : ''} · AED ${total.toFixed(2)}`,
        '/staff/orders',
        `order-${order.id}`,
      )
    }

    // Customer added a pre-order after booking — send combined email with food items.
    if (dto.bookingId) {
      this.mail.sendCombinedBookingConfirmation(dto.bookingId)
    }

    if (dto.paymentMethod === 'CASH') {
      return this.prisma.order.update({
        where: { id: order.id },
        data: { paymentMethod: 'CASH' },
        include: { items: { include: { menuItem: true } }, table: true },
      })
    }
    return order
  }

  async addItems(orderId: string, dto: AddOrderItemsDto, userId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException('Order not found')
    if (['DELIVERED', 'CANCELLED'].includes(order.status))
      throw new BadRequestException('Cannot add items to a completed or cancelled order')

    const itemIds = dto.items.map(i => i.menuItemId)
    const menuItems = await this.prisma.menuItem.findMany({ where: { id: { in: itemIds } } })
    if (menuItems.length !== itemIds.length) throw new BadRequestException('One or more menu items not found')
    const menuMap = new Map(menuItems.map(m => [m.id, m]))

    const activeOffers = await this.offers.getActiveNow()
    // addItems is staff-only (route guarded by @Roles('OWNER','STAFF')) — ASP items
    // require a live customPrice quote, same as the main create() flow.
    for (const item of dto.items) {
      const menuItem = menuMap.get(item.menuItemId)!
      if (menuItem.isMarketPrice && (!item.customPrice || item.customPrice <= 0)) {
        throw new BadRequestException(`Enter today's price for ${menuItem.name}`)
      }
    }
    const priceFor = (item: typeof dto.items[number]) => {
      const menuItem = menuMap.get(item.menuItemId)!
      return menuItem.isMarketPrice ? Number(item.customPrice) : Number(menuItem.price)
    }

    const offerByItem = new Map<string, { name: string; amount: number }>()
    if (activeOffers.length) {
      for (const item of dto.items) {
        const menuItem = menuMap.get(item.menuItemId)!
        if (menuItem.isMarketPrice) continue
        const best = OffersService.pickBestOffer(activeOffers as any, item.menuItemId, menuItem.categoryId, priceFor(item))
        if (best) offerByItem.set(item.menuItemId, { name: best.offer.name, amount: Math.round(best.amount * item.quantity * 100) / 100 })
      }
    }

    const addedSubtotal = dto.items.reduce((sum, item) => {
      const price = priceFor(item)
      const modExtra = (item.modifiers ?? []).reduce((ms, m) => ms + Number(m.priceAdd ?? 0), 0)
      const discount = offerByItem.get(item.menuItemId)?.amount ?? 0
      return sum + (price + modExtra) * item.quantity - discount
    }, 0)

    const newSubtotal  = Math.round((Number(order.subtotal) + addedSubtotal) * 100) / 100
    const newVat       = Math.round(newSubtotal * VAT_RATE * 100) / 100
    const newTotal     = Math.round((newSubtotal + newVat) * 100) / 100

    // If items are added to an order already past PENDING (in kitchen or ready),
    // reset to PENDING so the kitchen knows new work is pending.
    const needsKitchenRefire = ['ACCEPTED', 'PREPARING', 'READY'].includes(order.status as string)
    const statusReset = needsKitchenRefire ? { status: 'PENDING' as const } : {}

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        subtotal: newSubtotal,
        vatAmount: newVat,
        total: newTotal,
        ...statusReset,
        items: {
          create: dto.items.map(item => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            unitPrice: priceFor(item),
            notes: item.notes,
            ...(offerByItem.get(item.menuItemId) ? { offerName: offerByItem.get(item.menuItemId)!.name, offerAmount: offerByItem.get(item.menuItemId)!.amount } : {}),
            modifiers: item.modifiers?.length ? {
              create: item.modifiers.map(m => ({ optionId: m.optionId, name: m.name, priceAdd: m.priceAdd }))
            } : undefined,
          })),
        },
      },
      include: {
        items: { include: { menuItem: true, modifiers: true } },
        table: true,
        approvedBy: { select: { id: true, name: true, role: true } },
      },
    })

    // In thermal mode: fire an add-on KOT with ONLY the new items (not the full order).
    // This prevents the kitchen reprinting food that is already cooked.
    if (needsKitchenRefire) {
      const cfg = await this.settings.get()
      if ((cfg as any).thermalEnabled) {
        const newItems = updated.items.slice(-dto.items.length) // new items are appended at the end
        this.kitchenPrint.printKOT({
          ...updated,
          id: updated.id + '-ADD',
          items: newItems,
          notes: `ADD-ON to #${updated.tokenNumber}${order.notes ? ` | ${order.notes}` : ''}`,
        }).catch(() => {})
        // Advance to PREPARING (same as initial accept flow)
        await this.prisma.order.update({
          where: { id: updated.id },
          data: {
            status: 'PREPARING',
            statusHistory: { create: { fromStatus: 'PENDING', toStatus: 'PREPARING', changedById: userId ?? null } },
          },
        }).catch(() => {})
        this.gateway.emitOrderUpdated({ ...updated, status: 'PREPARING' })
      } else {
        if (needsKitchenRefire) {
          await this.prisma.orderStatusHistory.create({
            data: { orderId: orderId, fromStatus: order.status, toStatus: 'PENDING', changedById: userId ?? null },
          }).catch(() => {})
        }
        this.gateway.emitOrderUpdated(updated)
      }
    } else {
      this.gateway.emitOrderUpdated(updated)
    }

    return updated
  }

  getAll(filter?: { status?: OrderStatus }) {
    return this.prisma.order.findMany({
      where: filter?.status ? { status: filter.status } : {},
      include: { items: { include: { menuItem: true } }, table: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { menuItem: true, modifiers: true } },
        table: true,
        approvedBy:  { select: { id: true, name: true, role: true } },
        cancelledBy: { select: { id: true, name: true, role: true } },
      },
    })
    if (!order) throw new NotFoundException('Order not found')
    return order
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, actingUserId?: string) {
    const order = await this.getById(id)

    const auditData: Record<string, unknown> = {}
    // ACCEPTED or PENDING→READY (skip-kitchen-stages mode) both count as "accepted"
    const isAcceptEvent = dto.status === 'ACCEPTED' || (dto.status === 'READY' && order.status === 'PENDING')
    if (isAcceptEvent) {
      auditData.approvedById = actingUserId ?? null
      auditData.approvedAt   = new Date()
      // Calculate expected ready time from the slowest item in the order
      const fullOrder = await this.prisma.order.findUnique({
        where: { id },
        include: { items: { include: { menuItem: { select: { prepTimeMins: true } } } } },
      })
      const maxPrepMins = fullOrder?.items.reduce((max, i) => Math.max(max, i.menuItem.prepTimeMins ?? 15), 15) ?? 15
      const expectedReadyAt = new Date()
      expectedReadyAt.setMinutes(expectedReadyAt.getMinutes() + maxPrepMins)
      auditData.expectedReadyAt = expectedReadyAt
    }
    if (dto.status === 'CANCELLED') {
      auditData.cancelledById = actingUserId ?? null
      auditData.cancelledAt   = new Date()
      if (dto.cancelReason) auditData.cancelReason = dto.cancelReason
    }

    const updated = await this.prisma.$transaction(async tx => {
      const o = await tx.order.update({
        where: { id },
        data: { status: dto.status as OrderStatus, ...auditData },
        include: {
          items: { include: { menuItem: true } },
          table: true,
          approvedBy:  { select: { id: true, name: true, role: true } },
          cancelledBy: { select: { id: true, name: true, role: true } },
        },
      })
      await tx.orderStatusHistory.create({
        data: { orderId: id, fromStatus: order.status, toStatus: dto.status as OrderStatus, changedById: actingUserId },
      })
      return o
    })

    // When order is delivered, update table status based on payment situation
    if (dto.status === 'DELIVERED' && order.tableId) {
      await this.recalculateTableStatus(order.tableId)
    }

    if (dto.status === 'READY') this.gateway.emitOrderReady(updated)
    else this.gateway.emitOrderUpdated(updated)

    // Push notifications: staff (servers) when food is ready; customer on key status changes
    if (dto.status === 'READY') {
      const where = updated.table ? (updated.table.name ?? `Table ${updated.table.tableNumber}`) : `Takeaway #${updated.tokenNumber}`
      this.push.notifyStaff('✅ Order Ready', `${where} — ready to serve`, '/staff/orders', `ready-${id}`)
      if (order.userId) this.push.notifyUser(order.userId, '🎉 Your Order is Ready!', 'Please collect or wait for your server')
    } else if (dto.status === 'PREPARING' && order.userId) {
      this.push.notifyUser(order.userId, '👨‍🍳 In the Kitchen', 'Chef is preparing your order')
    } else if (dto.status === 'CANCELLED' && order.userId) {
      this.push.notifyUser(order.userId, '❌ Order Cancelled', 'Please speak to a staff member')
    }

    if (isAcceptEvent) {
      const cfg = await this.settings.get()
      if ((cfg as any).thermalEnabled) {
        // Thermal is on: print KOT then auto-advance to PREPARING so it skips the KDS "Start" tap
        this.kitchenPrint.printKOT(updated).catch(() => {})
        await this.prisma.order.update({
          where: { id: updated.id },
          data: {
            status: 'PREPARING',
            statusHistory: { create: { fromStatus: updated.status, toStatus: 'PREPARING', changedById: actingUserId ?? null } },
          },
        }).catch(() => {})
        this.gateway.emitOrderUpdated({ ...updated, status: 'PREPARING' })
      } else {
        this.kitchenPrint.printKOT(updated).catch(() => {})
      }
    }

    // Email customer when staff cancels their order
    if (dto.status === 'CANCELLED' && order.userId) {
      const customer = await this.prisma.user.findUnique({ where: { id: order.userId }, select: { email: true, name: true } })
      if (customer?.email) {
        this.mail.sendOrderCancellation(customer.email, customer.name, updated, true)
      }
    }

    return updated
  }

  // Re-derives a table's status from its actual orders. Called whenever an order that
  // could have driven a table into BILL_PENDING/DIRTY changes state after the fact
  // (e.g. voided) — without this, a table can get stuck showing "awaiting bill" with
  // zero real unpaid orders behind it, and there / was no way to clear it from the UI.
  private async recalculateTableStatus(tableId: string) {
    // Exclude voided orders — they are gone from kitchen even though status isn't CANCELLED
    const remaining = await this.prisma.order.count({
      where: { tableId, status: { notIn: ['DELIVERED', 'CANCELLED'] }, isVoided: false },
    })
    if (remaining > 0) return // guests still actively ordering — leave status alone

    const unpaid = await this.prisma.order.count({
      where: { tableId, paymentStatus: 'UNPAID', status: { notIn: ['CANCELLED', 'PRE_ORDER'] }, isVoided: false },
    })
    const tableStatus = unpaid > 0 ? 'BILL_PENDING' : 'DIRTY'
    await this.prisma.restaurantTable.update({ where: { id: tableId }, data: { status: tableStatus } })
  }

  async voidOrder(id: string, reason: string, actingUserId?: string) {
    const order = await this.getById(id)
    if (!['READY', 'DELIVERED'].includes(order.status)) {
      throw new BadRequestException('Only READY or DELIVERED orders can be voided — cancel PENDING/ACCEPTED/PREPARING orders instead')
    }
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        isVoided: true,
        voidReason: reason,
        voidedById: actingUserId ?? null,
        voidedAt: new Date(),
        paymentStatus: 'VOID',
      },
      include: { items: { include: { menuItem: true } }, table: true },
    })
    if (order.tableId) await this.recalculateTableStatus(order.tableId)
    this.gateway.emitOrderUpdated(updated)
    return updated
  }

  async guestHelp(id: string, message?: string) {
    const order = await this.getById(id)
    const tableLabel = order.type === 'DINE_IN'
      ? ((order.table as any)?.name ?? (order.table ? `Table ${(order.table as any).tableNumber}` : 'Dine-in'))
      : `Takeaway #${order.tokenNumber}`
    this.gateway.emitOrderHelp({
      orderId: id,
      tableLabel,
      message: message || 'Needs help',
    })
    return { ok: true }
  }

  async staffMessage(id: string, message: string, staffName: string) {
    this.gateway.emitOrderMessage({ orderId: id, message, staffName })
    return { ok: true }
  }

  async setRush(id: string, isRush: boolean) {
    const updated = await this.prisma.order.update({
      where: { id },
      data: { isRush },
      include: { items: { include: { menuItem: true } }, table: true },
    })
    this.gateway.emitOrderUpdated(updated)
    return updated
  }

  async guestCancel(id: string, cancelReason?: string) {
    const order = await this.getById(id)
    if (order.status !== 'PENDING') throw new BadRequestException('Order can only be cancelled while pending')

    // Swiggy-style self-service refund: card-paid orders cancelled within the cooling
    // window get an instant automatic Stripe refund — no staff approval needed.
    // Outside the window (or non-card), the cancel goes through the normal
    // cooling → staff-approval flow.
    let selfRefunded = false
    if (order.paymentStatus === 'PAID' && order.paymentMethod === 'CARD' && (order as any).stripeIntentId) {
      const cfg = await this.settings.get()
      const windowMins = Math.max(0, Number((cfg as any).selfCancelWindowMins ?? 5))
      // Still held = always inside the window; otherwise check elapsed time
      const stillHeld = (order as any).heldUntil && new Date((order as any).heldUntil) > new Date()
      const paidRecently = stillHeld || Date.now() - new Date(order.createdAt).getTime() <= windowMins * 60_000
      if (paidRecently) {
        try {
          const Stripe = require('stripe')
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' })
          await stripe.refunds.create({ payment_intent: (order as any).stripeIntentId })
          selfRefunded = true
          this.logger.log(`Self-service refund issued for order ${id} (within ${windowMins}min window)`)
        } catch (err: any) {
          this.logger.error(`Self-refund failed for order ${id}: ${err?.message} — falling back to approval flow`)
        }
      }
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: 'CANCELLED', cancelledAt: new Date(),
        ...(cancelReason ? { cancelReason } : {}),
        ...(selfRefunded ? {
          paymentStatus: 'REFUNDED' as any,
          statusHistory: { create: { fromStatus: 'PENDING', toStatus: 'CANCELLED', note: 'Self-service refund — cancelled within cooling window' } },
        } : {}),
      },
      include: { items: { include: { menuItem: true } }, table: true },
    })
    this.gateway.emitOrderUpdated(updated)
    if (selfRefunded) {
      this.push.notifyStaff('↩️ Order Self-Cancelled & Refunded',
        `${updated.table ? (updated.table.name ?? `Table ${updated.table.tableNumber}`) : `Takeaway #${updated.tokenNumber}`} · AED ${Number(updated.total).toFixed(2)} auto-refunded`,
        '/staff/orders', `selfrefund-${id}`)
    }

    // Email the customer who placed the order
    if (order.userId) {
      const customer = await this.prisma.user.findUnique({ where: { id: order.userId }, select: { email: true, name: true } })
      if (customer?.email) {
        this.mail.sendOrderCancellation(customer.email, customer.name, updated, false)
      }
    }

    return { ...updated, selfRefunded }
  }

  async getPublicReviews(limit = 12) {
    const rows = await this.prisma.feedback.findMany({
      where: { rating: { gte: 4 }, comment: { not: null }, AND: [{ comment: { not: '' } }] },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { name: true } } },
    })
    return rows.map(r => ({
      rating: r.rating,
      comment: r.comment,
      name: r.user?.name ?? 'Verified guest',
      createdAt: r.createdAt,
    }))
  }

  async submitFeedback(orderId: string, data: { rating: number; comment?: string; tags?: string }, userId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException('Order not found')
    return this.prisma.feedback.upsert({
      where: { orderId },
      update: { rating: data.rating, comment: data.comment ?? null, tags: data.tags ?? null },
      create: { orderId, userId: userId ?? null, rating: data.rating, comment: data.comment ?? null, tags: data.tags ?? null },
    })
  }

  // Who actually served this table: prefer whoever settled the bill (the closing
  // interaction guests remember most), falling back to whoever approved the order
  // into the kitchen (the one who greeted/took it). Session-wide, not just this order.
  private async resolveServingStaff(order: { id: string; tableSessionId: string | null; approvedById: string | null; settledById: string | null }) {
    if (order.settledById) return order.settledById
    if (order.approvedById) return order.approvedById
    if (!order.tableSessionId) return null
    const sessionOrder = await this.prisma.order.findFirst({
      where: { tableSessionId: order.tableSessionId, OR: [{ settledById: { not: null } }, { approvedById: { not: null } }] },
      orderBy: { createdAt: 'desc' },
      select: { settledById: true, approvedById: true },
    })
    return sessionOrder?.settledById ?? sessionOrder?.approvedById ?? null
  }

  // Who to show on the "Rate your server" screen — name + role, or null if nobody staffed it
  async getServingStaffForOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, tableSessionId: true, approvedById: true, settledById: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    const staffId = await this.resolveServingStaff(order)
    if (!staffId) return null
    return this.prisma.user.findUnique({ where: { id: staffId }, select: { id: true, name: true } })
  }

  async submitStaffFeedback(orderId: string, data: { rating: number; isComplaint?: boolean; comment?: string }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, tableSessionId: true, approvedById: true, settledById: true, tableId: true, table: { select: { name: true, tableNumber: true } } },
    })
    if (!order) throw new NotFoundException('Order not found')
    const staffId = await this.resolveServingStaff(order)
    if (!staffId) throw new BadRequestException('No staff member found to rate for this order')

    const record = await this.prisma.staffFeedback.create({
      data: { orderId, staffId, rating: data.rating, isComplaint: data.isComplaint ?? false, comment: data.comment ?? null, source: 'SETTLE' },
    })

    if (data.isComplaint) {
      const staff = await this.prisma.user.findUnique({ where: { id: staffId }, select: { name: true } })
      const where = order.table ? (order.table.name ?? `Table ${order.table.tableNumber}`) : 'a takeaway order'
      this.push.notifyStaff(
        '⚠️ Guest Complaint',
        `${staff?.name ?? 'A staff member'} — ${where}${data.comment ? `: "${data.comment}"` : ''}`,
        '/staff/analytics', `complaint-${record.id}`,
      )
    }
    return record
  }

  // Public: staff currently clocked in — lets the guest pick who served them for
  // a live complaint without needing any staff-assignment feature.
  async getOnDutyStaff() {
    const shifts = await this.prisma.shift.findMany({
      where: { clockOut: null },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { clockIn: 'asc' },
    })
    return shifts.map(s => ({ id: s.user.id, name: s.user.name }))
  }

  // Real-time complaint: guest picks who served them from the on-duty list — no
  // waiting for the bill to settle. Always treated as a complaint (rating defaults
  // to 1 if the guest doesn't pick stars) so it surfaces immediately for the owner.
  async submitLiveComplaint(orderId: string, staffId: string, data: { rating?: number; comment?: string }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, tableId: true, tokenNumber: true, table: { select: { name: true, tableNumber: true } } },
    })
    if (!order) throw new NotFoundException('Order not found')
    const staff = await this.prisma.user.findUnique({ where: { id: staffId }, select: { id: true, name: true } })
    if (!staff) throw new BadRequestException('Staff member not found')

    const record = await this.prisma.staffFeedback.create({
      data: { orderId, staffId, rating: data.rating && data.rating >= 1 ? data.rating : 1, isComplaint: true, comment: data.comment ?? null, source: 'LIVE' },
    })

    const where = order.table ? (order.table.name ?? `Table ${order.table.tableNumber}`) : `Takeaway #${order.tokenNumber}`
    this.push.notifyStaff(
      '🚨 Live Guest Complaint',
      `${staff.name} — ${where}${data.comment ? `: "${data.comment}"` : ''}`,
      '/staff/analytics', `live-complaint-${record.id}`,
    )
    return record
  }

  // Per-staff rating leaderboard for the owner Analytics page
  async getStaffRatings(period: string) {
    const now = new Date()
    const days = period === 'today' ? 1 : period === '30d' ? 30 : period === '90d' ? 90 : 7
    const since = new Date(now)
    since.setDate(since.getDate() - (days - 1))
    since.setHours(0, 0, 0, 0)

    const rows = await this.prisma.staffFeedback.findMany({
      where: { createdAt: { gte: since } },
      include: { staff: { select: { id: true, name: true, role: true } } },
    })

    const byStaff = new Map<string, { staffId: string; name: string; role: string; ratings: number[]; complaints: number; comments: { rating: number; comment: string; isComplaint: boolean; createdAt: Date }[] }>()
    for (const r of rows) {
      let entry = byStaff.get(r.staffId)
      if (!entry) {
        entry = { staffId: r.staffId, name: r.staff.name, role: r.staff.role, ratings: [], complaints: 0, comments: [] }
        byStaff.set(r.staffId, entry)
      }
      entry.ratings.push(r.rating)
      if (r.isComplaint) entry.complaints++
      if (r.comment) entry.comments.push({ rating: r.rating, comment: r.comment, isComplaint: r.isComplaint, createdAt: r.createdAt })
    }

    const leaderboard = [...byStaff.values()]
      .map(e => ({
        staffId: e.staffId,
        name: e.name,
        role: e.role,
        avgRating: Math.round((e.ratings.reduce((s, v) => s + v, 0) / e.ratings.length) * 10) / 10,
        ratingCount: e.ratings.length,
        complaints: e.complaints,
        recentComments: e.comments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5),
      }))
      .sort((a, b) => b.avgRating - a.avgRating)

    return { period, leaderboard, totalRatings: rows.length, totalComplaints: rows.filter(r => r.isComplaint).length }
  }

  async getAnalytics(period: string) {
    const now = new Date()
    const days = period === 'today' ? 1 : period === '30d' ? 30 : 7
    const since = new Date(now)
    since.setDate(since.getDate() - (days - 1))
    since.setHours(0, 0, 0, 0)

    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
      include: { items: { include: { menuItem: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    })

    const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0)
    const totalOrders  = orders.length
    const paidOrders   = orders.filter(o => o.paymentStatus === 'PAID').length
    const cashOrders   = orders.filter(o => o.paymentStatus === 'UNPAID').length

    // Revenue & orders by day
    const byDayMap: Record<string, { revenue: number; orders: number }> = {}
    for (let i = 0; i < days; i++) {
      const d = new Date(since)
      d.setDate(d.getDate() + i)
      byDayMap[d.toISOString().split('T')[0]] = { revenue: 0, orders: 0 }
    }
    for (const o of orders) {
      const key = o.createdAt.toISOString().split('T')[0]
      if (byDayMap[key]) {
        byDayMap[key].revenue += Number(o.total)
        byDayMap[key].orders  += 1
      }
    }
    const byDay = Object.entries(byDayMap).map(([date, v]) => ({ date, ...v }))

    // Orders by hour (today only or full period)
    const byHour: Record<number, number> = {}
    for (let h = 0; h < 24; h++) byHour[h] = 0
    for (const o of orders) byHour[o.createdAt.getHours()]++
    const hourly = Object.entries(byHour).map(([h, count]) => ({ hour: Number(h), count }))

    // By type
    const dineIn   = orders.filter(o => o.type === 'DINE_IN').length
    const takeaway = orders.filter(o => o.type === 'TAKEAWAY').length

    // Top items
    const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {}
    for (const o of orders) {
      for (const item of o.items) {
        const k = item.menuItemId
        if (!itemMap[k]) itemMap[k] = { name: item.menuItem.name, qty: 0, revenue: 0 }
        itemMap[k].qty     += item.quantity
        itemMap[k].revenue += Number(item.unitPrice) * item.quantity
      }
    }
    const topItems = Object.values(itemMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8)

    // Average order value
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

    return { totalRevenue, totalOrders, paidOrders, cashOrders, dineIn, takeaway, avgOrderValue, byDay, hourly, topItems, period }
  }

  // End-of-day / shift-close report — cash vs card breakdown for till reconciliation
  async getEodReport(date?: string) {
    const d = date ? new Date(date) : new Date()
    const from = new Date(d); from.setHours(0, 0, 0, 0)
    const to   = new Date(d); to.setHours(23, 59, 59, 999)

    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: from, lte: to }, status: { not: 'CANCELLED' } },
      select: {
        id: true, type: true, status: true, paymentStatus: true, paymentMethod: true,
        subtotal: true, vatAmount: true, discountAmount: true, splitCashAmount: true,
        tipAmount: true,
        total: true, isVoided: true, createdAt: true,
      },
    })

    const paid = orders.filter(o => o.paymentStatus === 'PAID' && !o.isVoided)
    const voided = orders.filter(o => o.isVoided)

    // Cash in till = all CASH orders + split cash portions
    const cashOrders   = paid.filter(o => o.paymentMethod === 'CASH')
    const cardOrders   = paid.filter(o => o.paymentMethod === 'CARD')
    const splitOrders  = paid.filter(o => o.paymentMethod === 'SPLIT')

    const cashTotal       = cashOrders.reduce((s, o) => s + Number(o.total), 0)
    const cardTotal       = cardOrders.reduce((s, o) => s + Number(o.total), 0)
    const splitCashTotal  = splitOrders.reduce((s, o) => s + Number(o.splitCashAmount ?? 0), 0)
    const splitCardTotal  = splitOrders.reduce((s, o) => s + (Number(o.total) - Number(o.splitCashAmount ?? 0)), 0)

    const totalCashInTill    = cashTotal + splitCashTotal
    const totalCardTerminal  = cardTotal + splitCardTotal
    const netRevenue         = paid.reduce((s, o) => s + Number(o.total), 0)
    const discountsGiven     = paid.reduce((s, o) => s + Number(o.discountAmount ?? 0), 0)
    const grossRevenue       = netRevenue + discountsGiven
    const vatCollected       = paid.reduce((s, o) => s + Number(o.vatAmount), 0)
    const voidsTotal         = voided.reduce((s, o) => s + Number(o.total), 0)
    const tipTotal           = paid.reduce((s, o) => s + Number(o.tipAmount ?? 0), 0)

    // Hourly breakdown (for the bar chart)
    const hourlyMap: Record<number, { orders: number; cash: number; card: number }> = {}
    for (let h = 0; h < 24; h++) hourlyMap[h] = { orders: 0, cash: 0, card: 0 }
    for (const o of paid) {
      const h = o.createdAt.getHours()
      hourlyMap[h].orders++
      if (o.paymentMethod === 'CASH') hourlyMap[h].cash += Number(o.total)
      else if (o.paymentMethod === 'CARD') hourlyMap[h].card += Number(o.total)
      else if (o.paymentMethod === 'SPLIT') {
        hourlyMap[h].cash += Number(o.splitCashAmount ?? 0)
        hourlyMap[h].card += Number(o.total) - Number(o.splitCashAmount ?? 0)
      }
    }
    const hourly = Object.entries(hourlyMap)
      .filter(([, v]) => v.orders > 0)
      .map(([h, v]) => ({ hour: Number(h), ...v }))

    return {
      date: from.toISOString().split('T')[0],
      orderCount:       paid.length,
      dineInCount:      paid.filter(o => o.type === 'DINE_IN').length,
      takeawayCount:    paid.filter(o => o.type === 'TAKEAWAY').length,
      cashTotal,
      cardTotal,
      splitCashTotal,
      splitCardTotal,
      totalCashInTill,
      totalCardTerminal,
      netRevenue,
      grossRevenue,
      discountsGiven,
      vatCollected,
      voidsTotal,
      voidCount:        voided.length,
      tipTotal,
      avgOrderValue:    paid.length > 0 ? netRevenue / paid.length : 0,
      hourly,
    }
  }

  async getBySessionToken(token: string) {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return this.prisma.order.findMany({
      where: {
        tableSessionId: token,
        createdAt: { gte: today },
        status: { not: 'CANCELLED' },
      },
      include: {
        items: { include: { menuItem: { select: { id: true, name: true, prepTimeMins: true } } } },
        table: { select: { id: true, tableNumber: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  getByUser(userId: string) {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return this.prisma.order.findMany({
      where: {
        userId,
        createdAt: { gte: today },
        status: { notIn: ['CANCELLED'] },
        paymentStatus: 'UNPAID',
      },
      include: { items: { include: { menuItem: true, modifiers: true } }, table: true, feedback: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
  }

  getActiveOrders() {
    // Include DELIVERED+UNPAID so counter staff can collect cash payment.
    // Exclude PRE_ORDER — those are held and only fire to kitchen on guest arrival.
    // Exclude cooling-hold orders (heldUntil in the future) — guest can still free-cancel.
    return this.prisma.order.findMany({
      where: {
        AND: [
          { OR: [{ heldUntil: null }, { heldUntil: { lte: new Date() } }] },
          { OR: [
            { status: { notIn: ['PRE_ORDER', 'DELIVERED', 'CANCELLED'] } },
            { status: 'DELIVERED', paymentStatus: 'UNPAID' },
          ] },
        ],
      },
      include: {
        items: { include: { menuItem: true, modifiers: true } },
        table: true,
        approvedBy:  { select: { id: true, name: true, role: true } },
        cancelledBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  async getSessionReceipt(sessionId: string) {
    const [bill, settings] = await Promise.all([
      this.getSessionBill(sessionId),
      this.prisma.restaurantSettings.findFirst({
        select: {
          restaurantName: true, restaurantNameAr: true,
          tagline: true, address: true, phone: true,
          logoUrl: true, vatNumber: true, vatRate: true,
          serviceChargeRate: true, currency: true, currencySymbol: true,
          billConfig: true,
        },
      }),
    ])
    return { ...bill, restaurant: settings }
  }

  private buildSessionSummary(orders: any[]) {
    const subtotal    = orders.reduce((s, o) => s + Number(o.subtotal), 0)
    const vatAmount   = orders.reduce((s, o) => s + Number(o.vatAmount), 0)
    const discount    = orders.reduce((s, o) => s + Number(o.discountAmount ?? 0), 0)
    const tipAmount   = orders.reduce((s, o) => s + Number(o.tipAmount ?? 0), 0)
    const packingCharge = orders.reduce((s, o) => s + Number(o.packingCharge ?? 0), 0)
    const total       = orders.reduce((s, o) => s + Number(o.total), 0)
    // Who closed the bill — pick the first settled order's settledBy
    const settledByOrder = orders.find(o => o.settledBy)
    const settledBy = settledByOrder?.settledBy ?? null
    const settledAt = settledByOrder?.settledAt ?? null
    return {
      subtotal, vatAmount, discount, tipAmount, packingCharge, total,
      orderCount: orders.length,
      allPaid:   orders.length > 0 && orders.every(o => o.paymentStatus === 'PAID'),
      anyUnpaid: orders.some(o => o.paymentStatus === 'UNPAID'),
      settledBy,
      settledAt,
    }
  }

  // Active sessions at a specific table — used by staff to pick "who am I ordering for?"
  async getTableSessions(tableId: string) {
    const sessionRows = await this.prisma.order.groupBy({
      by: ['tableSessionId'],
      where: { tableId, tableSessionId: { not: null }, status: { not: 'CANCELLED' }, paymentStatus: 'UNPAID' },
      orderBy: { _min: { createdAt: 'asc' } },
    })
    const tabs = await Promise.all(sessionRows.map(async ({ tableSessionId }, idx) => {
      if (!tableSessionId) return null
      const orders = await this.prisma.order.findMany({
        where: { tableSessionId, status: { not: 'CANCELLED' } },
        include: { items: { include: { menuItem: { select: { name: true } } } }, user: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      })
      const total = orders.reduce((s, o) => s + Number(o.total), 0)
      const allItems = orders.flatMap(o => o.items)
      const itemCount = allItems.reduce((s, i) => s + i.quantity, 0)
      const userName = orders.find(o => o.user)?.user?.name ?? null
      // Deduplicate item names for display (e.g. "Chicken Burger ×2, Pepsi")
      const itemSummary = Object.entries(
        allItems.reduce<Record<string, number>>((acc, i) => {
          acc[i.menuItem.name] = (acc[i.menuItem.name] ?? 0) + i.quantity
          return acc
        }, {})
      ).map(([name, qty]) => (qty > 1 ? `${name} ×${qty}` : name))
      const firstOrderAt = orders[0]?.createdAt ?? null
      return {
        sessionId: tableSessionId,
        label: userName ?? `Guest ${idx + 1}`,
        orderCount: orders.length,
        itemCount,
        total,
        itemSummary,
        firstOrderAt,
      }
    }))
    return tabs.filter(Boolean)
  }

  // Active bills: one entry per table, containing ALL personal tabs (sessions) at that table
  async getActiveBills() {
    const tables = await this.prisma.restaurantTable.findMany({
      where: { status: { in: ['OCCUPIED', 'BILL_PENDING'] } },
      orderBy: { tableNumber: 'asc' },
    })

    const results = await Promise.all(tables.map(async table => {
      // All distinct unpaid sessions at this table (no date filter — active means unpaid, not "today")
      const sessionRows = await this.prisma.order.groupBy({
        by: ['tableSessionId'],
        where: { tableId: table.id, tableSessionId: { not: null }, status: { not: 'CANCELLED' }, paymentStatus: 'UNPAID' },
      })

      const tabs = await Promise.all(sessionRows.map(async ({ tableSessionId }) => {
        if (!tableSessionId) return null
        const orders = await this.prisma.order.findMany({
          where: { tableSessionId, status: { not: 'CANCELLED' } },
          include: { items: { include: { menuItem: true, modifiers: true } }, user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        })
        return { sessionId: tableSessionId, orders, summary: this.buildSessionSummary(orders) }
      }))

      const validTabs = tabs.filter(Boolean).filter((t: any) => t.orders.length > 0)
      if (!validTabs.length) return null

      // Combined totals across all tabs at this table
      const combined = this.buildSessionSummary(validTabs.flatMap((t: any) => t.orders))

      return { table, tabs: validTabs, combined }
    }))

    const valid = results.filter(Boolean) as { table: any; tabs: any[]; combined: any }[]

    // Party Mode: collapse entries whose tables share an open TableGroup into one
    // combined card. Tables in the same group but with no bills yet don't add an
    // entry — the merge is still visible on the Tables page via `mergeGroup`.
    const openGroups = await this.prisma.tableGroup.findMany({
      where: { closedAt: null },
      include: { members: true },
    })
    const groupIdByTable = new Map<string, string>()
    for (const g of openGroups) for (const m of g.members) groupIdByTable.set(m.tableId, g.id)

    const byGroup = new Map<string, typeof valid>()
    const ungrouped: typeof valid = []
    for (const entry of valid) {
      const groupId = groupIdByTable.get(entry.table.id)
      if (!groupId) { ungrouped.push(entry); continue }
      if (!byGroup.has(groupId)) byGroup.set(groupId, [])
      byGroup.get(groupId)!.push(entry)
    }

    const mergedEntries = [...byGroup.entries()].map(([groupId, entries]) => {
      const group = openGroups.find(g => g.id === groupId)!
      const allTabs = entries.flatMap(e => e.tabs)
      const combined = this.buildSessionSummary(allTabs.flatMap((t: any) => t.orders))
      return {
        table: entries[0].table, // primary table shown in the header
        mergedTables: entries.map(e => e.table),
        groupId,
        groupLabel: group.label,
        tabs: allTabs,
        combined,
      }
    })

    return [...ungrouped, ...mergedEntries]
  }

  // Today's closed sessions (tables now EMPTY or DIRTY but had orders today)
  async getClosedBillsToday(dateStr?: string) {
    const today = dateStr ? new Date(dateStr) : new Date(); today.setHours(0, 0, 0, 0)
    const dayEnd = new Date(today); dayEnd.setHours(23, 59, 59, 999)

    // Find all sessions that started today for tables now empty/dirty (closed)
    const sessions = await this.prisma.order.groupBy({
      by: ['tableSessionId'],
      where: {
        tableSessionId: { not: null },
        type: 'DINE_IN',
        createdAt: { gte: today, lte: dayEnd },
      },
    })

    const results = await Promise.all(sessions.map(async ({ tableSessionId }) => {
      if (!tableSessionId) return null
      const orders = await this.prisma.order.findMany({
        where: { tableSessionId, status: { not: 'CANCELLED' } },
        include: {
          items: { include: { menuItem: true, modifiers: true } },
          user: { select: { id: true, name: true } },
          settledBy: { select: { id: true, name: true } },
          table: true,
        },
        orderBy: { createdAt: 'asc' },
      })
      if (!orders.length || !orders[0].table) return null
      // Skip sessions that were never actually paid (e.g. void-only sessions from same device)
      const hasPaidOrders = orders.some(o => o.paymentStatus === 'PAID')
      if (!hasPaidOrders) return null
      const table = orders[0].table
      const closedAt = orders[orders.length - 1].settledAt ?? orders[orders.length - 1].updatedAt
      return { table, sessionId: tableSessionId, orders, summary: this.buildSessionSummary(orders), closedAt }
    }))

    return results.filter(Boolean).sort((a: any, b: any) => b.closedAt - a.closedAt)
  }

  // Orders for a specific session by sessionId
  async getSessionBill(sessionId: string) {
    // Falls back to a single order id — lets pure takeaways (no table session) use the same receipt template
    const orders = await this.prisma.order.findMany({
      where: { OR: [{ tableSessionId: sessionId }, { id: sessionId }], status: { not: 'CANCELLED' } },
      include: {
        items: { include: { menuItem: true, modifiers: true } },
        user: { select: { id: true, name: true } },
        approvedBy: { select: { name: true, role: true } },
        settledBy: { select: { id: true, name: true, role: true } },
        table: true,
      },
      orderBy: { createdAt: 'asc' },
    })
    if (!orders.length) throw new NotFoundException('Session not found')
    return { sessionId, table: orders[0].table, orders, summary: this.buildSessionSummary(orders) }
  }

  // Move an order to a different session (e.g. accidentally placed on wrong table)
  async reassignOrderSession(orderId: string, sessionId: string) {
    const target = await this.prisma.order.findFirst({
      where: { tableSessionId: sessionId },
      select: { tableId: true },
    })
    if (!target) throw new NotFoundException('Session not found')
    return this.prisma.order.update({
      where: { id: orderId },
      data: { tableSessionId: sessionId, tableId: target.tableId },
    })
  }

  // Transfer all orders in a session from one table to another
  async transferSession(sessionId: string, toTableId: string) {
    // Verify session has unpaid orders
    const sessionOrders = await this.prisma.order.findMany({
      where: { tableSessionId: sessionId, paymentStatus: 'UNPAID', status: { not: 'CANCELLED' } },
      select: { id: true, tableId: true },
    })
    if (!sessionOrders.length) throw new NotFoundException('No active orders found for this session')

    const fromTableId = sessionOrders[0].tableId
    if (!fromTableId) throw new BadRequestException('Session is not linked to a table')
    if (fromTableId === toTableId) throw new BadRequestException('Source and destination tables are the same')

    // Verify destination table exists
    const toTable = await this.prisma.restaurantTable.findUnique({ where: { id: toTableId } })
    if (!toTable) throw new NotFoundException('Destination table not found')
    if (toTable.status === 'DIRTY') throw new BadRequestException('Destination table is dirty — clean it first')

    await this.prisma.$transaction(async (tx) => {
      // Move all orders in this session to the new table
      await tx.order.updateMany({
        where: { tableSessionId: sessionId },
        data: { tableId: toTableId },
      })

      // Check if source table still has other active sessions
      const remaining = await tx.order.count({
        where: { tableId: fromTableId, tableSessionId: { not: null }, paymentStatus: 'UNPAID', status: { not: 'CANCELLED' } },
      })
      await tx.restaurantTable.update({
        where: { id: fromTableId },
        data: { status: remaining > 0 ? 'OCCUPIED' : 'DIRTY' },
      })

      // Mark destination table occupied
      await tx.restaurantTable.update({
        where: { id: toTableId },
        data: { status: 'OCCUPIED' },
      })
    })

    return {
      sessionId,
      fromTableId,
      toTableId,
      ordersMoved: sessionOrders.length,
    }
  }

  // Legacy: bill for a table's current session (used by tables page modal)
  async getTableBill(tableId: string) {
    const latestOrder = await this.prisma.order.findFirst({
      where: { tableId, tableSessionId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { tableSessionId: true },
    })
    if (!latestOrder?.tableSessionId) {
      return { tableId, sessionId: null, orders: [], summary: this.buildSessionSummary([]) }
    }
    return this.getSessionBill(latestOrder.tableSessionId)
  }

  async convertSessionToTakeaway(sessionId: string, onlyOrderIds?: string[]) {
    // Find UNPAID dine-in orders for this session — optionally restricted to specific orders
    const orders = await this.prisma.order.findMany({
      where: {
        tableSessionId: sessionId, type: 'DINE_IN', paymentStatus: 'UNPAID', status: { not: 'CANCELLED' },
        ...(onlyOrderIds?.length ? { id: { in: onlyOrderIds } } : {}),
      },
      select: { id: true, tableId: true },
    })
    if (!orders.length) throw new BadRequestException('No active dine-in orders found for this session')

    const orderIds = orders.map(o => o.id)

    // Only change the type — keep tableId and tableSessionId so the bill stays
    // visible in Active Bills and can be settled normally. Kitchen sees the
    // TAKEAWAY type change immediately via socket.
    // Packing charge: applied per converted order (recompute VAT + total).
    const cfg = await this.settings.get()
    const packing = Number((cfg as any).packingCharge ?? 0)
    if (packing > 0) {
      const fullOrders = await this.prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, subtotal: true, packingCharge: true },
      })
      await this.prisma.$transaction(fullOrders.map(o => {
        // Don't double-charge if somehow already has one
        const charge = Number(o.packingCharge) > 0 ? Number(o.packingCharge) : packing
        const sub = Number(o.subtotal)
        const vat = Math.round((sub + charge) * VAT_RATE * 100) / 100
        const tot = Math.round((sub + charge + vat) * 100) / 100
        return this.prisma.order.update({
          where: { id: o.id },
          data: { type: 'TAKEAWAY', packingCharge: charge, vatAmount: vat, total: tot },
        })
      }))
    } else {
      await this.prisma.order.updateMany({
        where: { id: { in: orderIds } },
        data: { type: 'TAKEAWAY' },
      })
    }

    // Emit socket update for each order so kitchen sees the type change
    const updated = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      include: { items: { include: { menuItem: true } }, table: true },
    })
    for (const o of updated) this.gateway.emitOrderUpdated(o as any)

    return { ok: true, converted: orderIds.length }
  }

  // Today's takeaway orders grouped by token (for bills page Takeaway tab)
  async getTakeawayBillsToday(dateStr?: string) {
    const today = dateStr ? new Date(dateStr) : new Date(); today.setHours(0, 0, 0, 0)
    const dayEnd = new Date(today); dayEnd.setHours(23, 59, 59, 999)
    const orders = await this.prisma.order.findMany({
      // tableSessionId: null — converted dine-in→takeaway orders stay on their table's
      // session bill; only pure walk-in takeaways get their own token card here.
      where: { type: 'TAKEAWAY', tableSessionId: null, createdAt: { gte: today, lte: dayEnd }, status: { not: 'CANCELLED' } },
      include: {
        items: { include: { menuItem: true, modifiers: true } },
        user: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { tokenNumber: 'asc' },
    })
    // Group by tokenNumber (each token = one customer visit)
    const grouped = new Map<number, typeof orders>()
    for (const o of orders) {
      const token = o.tokenNumber ?? 0
      if (!grouped.has(token)) grouped.set(token, [])
      grouped.get(token)!.push(o)
    }
    return Array.from(grouped.entries()).map(([token, tokenOrders]) => ({
      tokenNumber: token,
      contactPhone: tokenOrders[0].contactPhone ?? tokenOrders[0].user?.phone ?? null,
      customer: tokenOrders[0].user ?? null,
      orders: tokenOrders,
      summary: this.buildSessionSummary(tokenOrders),
      latestStatus: tokenOrders[tokenOrders.length - 1].status,
      createdAt: tokenOrders[0].createdAt,
    }))
  }

  // Claim guest orders: link orders placed anonymously (by IDs) to a user account.
  // Called after sign-in when localStorage has saved order IDs from guest session.
  async claimGuestOrders(userId: string, orderIds: string[]) {
    if (!orderIds.length) return { claimed: 0 }
    // Only claim orders that are genuinely unowned (userId null) to prevent hijacking
    const result = await this.prisma.order.updateMany({
      where: { id: { in: orderIds }, userId: null },
      data: { userId },
    })
    return { claimed: result.count }
  }

  async refundOrder(orderId: string, reason: string, staffId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException('Order not found')
    if (order.paymentStatus !== 'PAID') throw new BadRequestException('Only paid orders can be refunded')

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'REFUND_REQUESTED',
        statusHistory: {
          create: {
            fromStatus: order.status as any,
            toStatus: order.status as any,
            changedById: staffId,
            note: `REFUND REQUESTED: ${reason}`,
          },
        },
      },
      include: { items: { include: { menuItem: true } }, table: true },
    })

    await this.prisma.activityLog.create({
      data: {
        actorId: staffId,
        action: 'order.refund_requested',
        entityType: 'Order',
        entityId: orderId,
        before: { paymentStatus: 'PAID' },
        after: { paymentStatus: 'REFUND_REQUESTED', reason },
      },
    })

    this.gateway.emitOrderUpdated(updated)
    return updated
  }

  async approveRefund(orderId: string, managerId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException('Order not found')
    if (order.paymentStatus !== 'REFUND_REQUESTED') throw new BadRequestException('No pending refund request')

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'REFUNDED',
        statusHistory: {
          create: {
            fromStatus: order.status as any,
            toStatus: 'CANCELLED',
            changedById: managerId,
            note: 'Refund approved',
          },
        },
      },
      include: { items: { include: { menuItem: true } }, table: true },
    })

    await this.prisma.activityLog.create({
      data: {
        actorId: managerId,
        action: 'order.refund_approved',
        entityType: 'Order',
        entityId: orderId,
        before: { paymentStatus: 'REFUND_REQUESTED' },
        after: { paymentStatus: 'REFUNDED' },
      },
    })

    this.gateway.emitOrderUpdated(updated)
    return updated
  }

  // Every 30s: release guest orders whose cooling hold expired — NOW they reach the
  // kitchen/approval queue. The approval decision is made here (not at creation) so a
  // session approved during the hold still fast-tracks the released order.
  @Cron('*/30 * * * * *')
  async releaseHeldOrders() {
    const due = await this.prisma.order.findMany({
      where: { heldUntil: { not: null, lte: new Date() }, status: 'PENDING' },
      include: { items: { include: { menuItem: true, modifiers: true } }, table: true },
    })
    for (const o of due) {
      // Same rule as create(): follow-up orders skip approval once the session has an approved order
      let skipApproval = false
      if (o.type === 'DINE_IN' && o.tableSessionId) {
        const approved = await this.prisma.order.findFirst({
          where: { tableSessionId: o.tableSessionId, status: { in: ['ACCEPTED', 'PREPARING', 'READY', 'DELIVERED'] }, isVoided: false },
          select: { id: true },
        })
        skipApproval = !!approved
      }
      const updated = await this.prisma.order.update({
        where: { id: o.id },
        data: {
          heldUntil: null,
          ...(skipApproval ? {
            status: 'ACCEPTED',
            statusHistory: { create: { fromStatus: 'PENDING', toStatus: 'ACCEPTED', note: 'Released from cooling hold — session already approved' } },
          } : {}),
        },
        include: { items: { include: { menuItem: true, modifiers: true } }, table: true },
      }).catch(() => null)
      if (!updated) continue
      this.gateway.emitNewOrder(updated)
      const where = updated.table ? (updated.table.name ?? `Table ${updated.table.tableNumber}`) : `Takeaway #${updated.tokenNumber}`
      this.push.notifyStaff(
        skipApproval ? '🛎 New Order — In Kitchen' : '🛎 New Order — Needs Approval',
        `${where} · AED ${Number(updated.total).toFixed(2)}`,
        '/staff/orders',
        `order-${updated.id}`,
      )
    }
    if (due.length) this.logger.log(`Released ${due.length} order(s) from cooling hold`)
  }

  // Every minute: paid orders that were cancelled and finished their cooling window
  // get auto-flagged for refund approval. During the window a mistaken cancel can be
  // sorted out without touching money.
  @Cron(CronExpression.EVERY_MINUTE)
  async autoFlagRefundsAfterCooling() {
    const cfg = await this.settings.get()
    const mins = Math.max(0, Number((cfg as any).refundCoolingMins ?? 10))
    const cutoff = new Date(Date.now() - mins * 60_000)
    const due = await this.prisma.order.findMany({
      where: { paymentStatus: 'PAID', status: 'CANCELLED', cancelledAt: { not: null, lte: cutoff } },
      select: { id: true },
    })
    for (const o of due) {
      await this.prisma.order.update({
        where: { id: o.id },
        data: {
          paymentStatus: 'REFUND_REQUESTED',
          statusHistory: {
            create: { fromStatus: 'CANCELLED', toStatus: 'CANCELLED', note: `Auto-flagged for refund after ${mins}-minute cooling period` },
          },
        },
      }).catch(() => {})
      this.push.notifyStaff('💰 Refund Needs Approval', 'A cancelled paid order finished its cooling period', '/staff/bills', `refund-${o.id}`)
    }
    if (due.length) this.logger.log(`Auto-flagged ${due.length} order(s) for refund after cooling`)
  }

  // Manager keeps the money — cancel was a mistake / resolved with the guest
  async rejectRefund(orderId: string, managerId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException('Order not found')
    if (order.paymentStatus !== 'REFUND_REQUESTED') throw new BadRequestException('No pending refund request')

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'PAID',
        statusHistory: {
          create: {
            fromStatus: order.status as any,
            toStatus: order.status as any,
            changedById: managerId,
            note: `Refund rejected${reason ? `: ${reason}` : ''}`,
          },
        },
      },
      include: { items: { include: { menuItem: true } }, table: true },
    })
    await this.prisma.activityLog.create({
      data: {
        actorId: managerId,
        action: 'order.refund_rejected',
        entityType: 'Order',
        entityId: orderId,
        before: { paymentStatus: 'REFUND_REQUESTED' },
        after: { paymentStatus: 'PAID', reason },
      },
    })
    this.gateway.emitOrderUpdated(updated)
    return updated
  }

  async getPendingRefunds() {
    const [requested, cooling] = await Promise.all([
      this.prisma.order.findMany({
        where: { paymentStatus: 'REFUND_REQUESTED' },
        include: {
          table: { select: { name: true, tableNumber: true } },
          user: { select: { name: true } },
          items: { include: { menuItem: { select: { name: true } } } },
          statusHistory: { orderBy: { changedAt: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      // Orders still in the cooling window — shown with a countdown, no action needed yet
      this.prisma.order.findMany({
        where: { paymentStatus: 'PAID', status: 'CANCELLED', cancelledAt: { not: null } },
        include: {
          table: { select: { name: true, tableNumber: true } },
          user: { select: { name: true } },
          items: { include: { menuItem: { select: { name: true } } } },
        },
        orderBy: { cancelledAt: 'desc' },
      }),
    ])
    const cfg = await this.settings.get()
    const coolingMins = Math.max(0, Number((cfg as any).refundCoolingMins ?? 10))
    return {
      requested,
      cooling: cooling.map(o => ({
        ...o,
        coolingEndsAt: new Date(new Date(o.cancelledAt!).getTime() + coolingMins * 60_000),
      })),
      coolingMins,
    }
  }

  // ── Pre-order: save items against a booking, held until guest arrives ──────

  async createPreOrder(bookingId: string, dto: CreateOrderDto, staffId: string, tempPassword?: string, deferred?: boolean) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { table: true },
    })
    if (!booking) throw new NotFoundException('Booking not found')
    if (['CANCELLED', 'NO_SHOW'].includes(booking.status))
      throw new BadRequestException('Cannot add pre-order to a cancelled/no-show booking')

    const itemIds = dto.items.map(i => i.menuItemId)
    // Deduplicate: the same item can appear multiple times with different modifiers.
    // findMany({ id: { in: [...] } }) returns unique records, so compare against unique IDs.
    const uniqueItemIds = [...new Set(itemIds)]
    const menuItems = await this.prisma.menuItem.findMany({ where: { id: { in: uniqueItemIds } } })
    if (menuItems.length !== uniqueItemIds.length) {
      const foundIds = new Set(menuItems.map(m => m.id))
      const missingIds = uniqueItemIds.filter(id => !foundIds.has(id))
      this.logger.error(`Pre-order validation failed — requested ${uniqueItemIds.length} unique items, found ${menuItems.length}. Missing IDs: [${missingIds.join(', ')}]`)
      throw new BadRequestException(`Menu item(s) no longer available. Please go back and reselect your food items.`)
    }
    const menuMap = new Map(menuItems.map(m => [m.id, m]))

    // Prefetch all modifier options so we can snapshot name + priceAdd at order time
    const allOptionIds = dto.items.flatMap(i => (i.modifiers ?? []).map(m => m.optionId))
    const optionRows = allOptionIds.length
      ? await this.prisma.menuModifierOption.findMany({ where: { id: { in: allOptionIds } } })
      : []
    const optionMap = new Map(optionRows.map(o => [o.id, o]))

    const subtotal = dto.items.reduce((sum, item) => {
      const price = Number(menuMap.get(item.menuItemId)!.price)
      const modExtra = (item.modifiers ?? []).reduce((ms, m) => ms + Number(optionMap.get(m.optionId)?.priceAdd ?? 0), 0)
      return sum + (price + modExtra) * item.quantity
    }, 0)
    const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100
    const total = Math.round((subtotal + vatAmount) * 100) / 100

    let order: any
    try {
      order = await this.prisma.$transaction(async tx => {
        await tx.order.updateMany({ where: { bookingId, status: 'PRE_ORDER' }, data: { status: 'CANCELLED' } })
        return tx.order.create({
          data: {
            type: 'DINE_IN',
            tableId: booking.tableId,
            bookingId,
            userId: booking.customerId ?? undefined,
            status: 'PRE_ORDER',
            subtotal,
            vatAmount,
            total,
            notes: dto.notes,
            items: {
              create: dto.items.map(item => ({
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                unitPrice: menuMap.get(item.menuItemId)!.price,
                notes: item.notes,
                modifiers: item.modifiers?.length ? {
                  create: item.modifiers.map(m => {
                    const opt = optionMap.get(m.optionId)
                    if (!opt) throw new BadRequestException(`Modifier option ${m.optionId} not found`)
                    return { optionId: m.optionId, name: opt.name, priceAdd: opt.priceAdd }
                  })
                } : undefined,
              })),
            },
            statusHistory: { create: { fromStatus: null, toStatus: 'PRE_ORDER', changedById: staffId } },
          },
          include: { items: { include: { menuItem: true, modifiers: true } } },
        })
      })
    } catch (err: any) {
      // deferred=true means this pre-order was called immediately after staff-create with skipEmail:true.
      // On failure we MUST delete the booking (not cancel — @@unique([tableId, slotDate, slotTime])
      // applies to all statuses, so even a CANCELLED row blocks the slot on retry).
      if (deferred) {
        this.logger.warn(`Pre-order failed for booking ${bookingId} (${err?.message}) — deleting booking so slot is freed for retry`)
        const customerId = booking.customerId
        await this.prisma.booking.delete({ where: { id: bookingId } })
          .catch(e => this.logger.error(`Failed to delete booking ${bookingId} during rollback: ${e?.message}`))
        // If this was a brand-new customer with no other bookings, clean them up too
        if (customerId && tempPassword) {
          const others = await this.prisma.booking.count({ where: { customerId, id: { not: bookingId } } }).catch(() => 1)
          if (others === 0) {
            await this.prisma.user.delete({ where: { id: customerId } })
              .catch(e => this.logger.error(`Failed to delete new customer ${customerId} during rollback: ${e?.message}`))
          }
        }
      }
      throw err
    }

    // Send ONE combined email: booking details + food items + temp password if new customer.
    // Email is only sent here (never at booking creation) when staff deferred it.
    this.mail.sendCombinedBookingConfirmation(bookingId, tempPassword)

    return order
  }

  async getPreOrder(bookingId: string) {
    return this.prisma.order.findFirst({
      where: { bookingId, status: 'PRE_ORDER' },
      include: { items: { include: { menuItem: true, modifiers: true } } },
    })
  }

  // Called by bookings.service.markArrived — fires held pre-order to kitchen
  async firePreOrderToKitchen(bookingId: string) {
    this.logger.log(`firePreOrderToKitchen called for booking ${bookingId}`)
    const preOrder = await this.prisma.order.findFirst({
      where: { bookingId, status: 'PRE_ORDER' },
      include: { items: { include: { menuItem: true, modifiers: true } }, table: true },
    })
    if (!preOrder) {
      this.logger.log(`No PRE_ORDER found for booking ${bookingId}`)
      return null
    }
    this.logger.log(`Found pre-order ${preOrder.id} with ${preOrder.items.length} items — firing to kitchen`)

    const lastOrder = await this.prisma.order.findFirst({
      where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }, status: { not: 'PRE_ORDER' } },
      orderBy: { tokenNumber: 'desc' },
      select: { tokenNumber: true },
    })
    const tokenNumber = (lastOrder?.tokenNumber ?? 0) + 1

    // Find or create a table session for this arrival
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const existingSession = await this.prisma.order.findFirst({
      where: { tableId: preOrder.tableId!, tableSessionId: { not: null }, createdAt: { gte: today }, paymentStatus: 'UNPAID' },
      orderBy: { createdAt: 'desc' },
      select: { tableSessionId: true },
    })
    const tableSessionId = existingSession?.tableSessionId ?? randomUUID()

    const fired = await this.prisma.$transaction(async tx => {
      const updated = await tx.order.update({
        where: { id: preOrder.id },
        data: {
          // Skip PENDING — guest already confirmed pre-order, fire straight to kitchen as ACCEPTED
          status: 'ACCEPTED',
          tokenNumber,
          tableSessionId,
          statusHistory: { create: { fromStatus: 'PRE_ORDER', toStatus: 'ACCEPTED', changedById: null } },
        },
        include: { items: { include: { menuItem: true, modifiers: true } }, table: true },
      })

      // Table stays EMPTY (Reserved badge computed from upcomingBooking) until
      // staff explicitly check in the guest via the Check In action.
      return updated
    })

    this.logger.log(`Pre-order ${fired.id} → ACCEPTED (token #${tokenNumber}) | table ${fired.table?.tableNumber ?? 'N/A'} | ${fired.items.length} item(s)`)

    this.gateway.emitNewOrder(fired)

    // Mirror the thermal-printer flow from updateStatus: if thermal is enabled, print the KOT
    // and auto-advance to PREPARING so the kitchen display doesn't sit waiting for a "Start" tap.
    const cfg = await this.settings.get()
    if ((cfg as any).thermalEnabled) {
      this.kitchenPrint.printKOT(fired).catch(() => {})
      await this.prisma.order.update({
        where: { id: fired.id },
        data: {
          status: 'PREPARING',
          statusHistory: { create: { fromStatus: 'ACCEPTED', toStatus: 'PREPARING', changedById: null } },
        },
      }).catch(() => {})
      this.logger.log(`Pre-order ${fired.id} → PREPARING (thermal KOT printed)`)
    }

    return fired
  }

  // Called when staff taps "Check In Guest" on a Reserved table card.
  // Marks the table OCCUPIED and fires the pre-order to kitchen if it hasn't been sent yet.
  async checkInGuest(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, tableId: true, status: true },
    })
    if (!booking) throw new NotFoundException('Booking not found')
    if (!booking.tableId) throw new BadRequestException('Booking has no table assigned')
    if (['CANCELLED', 'NO_SHOW'].includes(booking.status)) {
      throw new BadRequestException('Cannot check in a cancelled/no-show booking')
    }

    // Fire pre-order to kitchen if it hasn't been sent yet (still in PRE_ORDER status)
    const pendingPreOrder = await this.prisma.order.findFirst({
      where: { bookingId, status: 'PRE_ORDER' },
      select: { id: true },
    })
    if (pendingPreOrder) {
      await this.firePreOrderToKitchen(bookingId)
    }

    // Mark table as OCCUPIED — guest is now physically seated
    await this.prisma.restaurantTable.update({
      where: { id: booking.tableId },
      data: { status: 'OCCUPIED' },
    })

    this.logger.log(`Guest checked in for booking ${bookingId} — table ${booking.tableId} → OCCUPIED`)
    return { success: true, bookingId, tableId: booking.tableId }
  }
}
