import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { OrdersGateway } from '../websocket/orders.gateway'
import { KitchenPrintService } from './kitchen-print.service'
import { SettingsService } from '../settings/settings.service'
import { MailService } from '../mail/mail.service'
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

  async create(dto: CreateOrderDto, userId?: string, clientIp?: string) {
    // Fetch all menu items to calculate prices server-side
    const itemIds = dto.items.map(i => i.menuItemId)
    const menuItems = await this.prisma.menuItem.findMany({ where: { id: { in: itemIds } } })

    if (menuItems.length !== itemIds.length) throw new BadRequestException('One or more menu items not found')
    if (dto.type === 'DINE_IN' && !dto.tableId) throw new BadRequestException('Table number is required for dine-in orders')
    if (dto.type === 'TAKEAWAY' && dto.paymentMethod === 'CASH') {
      throw new BadRequestException('Takeaway orders require card payment')
    }

    const menuMap = new Map(menuItems.map(m => [m.id, m]))

    const subtotal = dto.items.reduce((sum, item) => {
      const price = Number(menuMap.get(item.menuItemId)!.price)
      const modExtra = (item.modifiers ?? []).reduce((ms, m) => ms + Number(m.priceAdd ?? 0), 0)
      return sum + (price + modExtra) * item.quantity
    }, 0)

    const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100
    const total = Math.round((subtotal + vatAmount) * 100) / 100

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
        // Staff placing an order — attach to latest active session
        const existing = await this.prisma.order.findFirst({
          where: { tableId: dto.tableId, tableSessionId: { not: null } },
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
          total,
          notes: dto.notes,
          clientIp,
          contactPhone: dto.contactPhone,
          items: {
            create: dto.items.map(item => ({
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              unitPrice: menuMap.get(item.menuItemId)!.price,
              notes: item.notes,
              modifiers: item.modifiers?.length ? {
                create: item.modifiers.map(m => ({
                  optionId: m.optionId,
                  name: m.name,
                  priceAdd: m.priceAdd,
                }))
              } : undefined,
            })),
          },
          statusHistory: { create: { fromStatus: null, toStatus: 'PENDING', changedById: userId } },
        },
        include: { items: { include: { menuItem: true, modifiers: true } }, table: true },
      })

      // Auto-mark table OCCUPIED atomically with the order creation
      if (dto.type === 'DINE_IN' && dto.tableId) {
        await tx.restaurantTable.update({ where: { id: dto.tableId }, data: { status: 'OCCUPIED' } })
      }

      return created
    })

    this.gateway.emitNewOrder(order)

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

    const addedSubtotal = dto.items.reduce((sum, item) => {
      const price = Number(menuMap.get(item.menuItemId)!.price)
      const modExtra = (item.modifiers ?? []).reduce((ms, m) => ms + Number(m.priceAdd ?? 0), 0)
      return sum + (price + modExtra) * item.quantity
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
            unitPrice: menuMap.get(item.menuItemId)!.price,
            notes: item.notes,
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
        items: { include: { menuItem: true } },
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
    const remaining = await this.prisma.order.count({
      where: { tableId, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
    })
    if (remaining > 0) return // guests still actively ordering — leave status alone

    const unpaid = await this.prisma.order.count({
      where: { tableId, paymentStatus: 'UNPAID', status: { notIn: ['CANCELLED', 'PRE_ORDER'] } },
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
    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), ...(cancelReason ? { cancelReason } : {}) },
      include: { items: { include: { menuItem: true } }, table: true },
    })
    this.gateway.emitOrderUpdated(updated)

    // Email the customer who placed the order
    if (order.userId) {
      const customer = await this.prisma.user.findUnique({ where: { id: order.userId }, select: { email: true, name: true } })
      if (customer?.email) {
        this.mail.sendOrderCancellation(customer.email, customer.name, updated, false)
      }
    }

    return updated
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
      include: { items: { include: { menuItem: true } }, table: true, feedback: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
  }

  getActiveOrders() {
    // Include DELIVERED+UNPAID so counter staff can collect cash payment.
    // Exclude PRE_ORDER — those are held and only fire to kitchen on guest arrival.
    return this.prisma.order.findMany({
      where: {
        OR: [
          { status: { notIn: ['PRE_ORDER', 'DELIVERED', 'CANCELLED'] } },
          { status: 'DELIVERED', paymentStatus: 'UNPAID' },
        ],
      },
      include: {
        items: { include: { menuItem: true } },
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
    const total       = orders.reduce((s, o) => s + Number(o.total), 0)
    // Who closed the bill — pick the first settled order's settledBy
    const settledByOrder = orders.find(o => o.settledBy)
    const settledBy = settledByOrder?.settledBy ?? null
    const settledAt = settledByOrder?.settledAt ?? null
    return {
      subtotal, vatAmount, discount, tipAmount, total,
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
          include: { items: { include: { menuItem: true } }, user: { select: { id: true, name: true } } },
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

    return results.filter(Boolean)
  }

  // Today's closed sessions (tables now EMPTY or DIRTY but had orders today)
  async getClosedBillsToday() {
    const today = new Date(); today.setHours(0, 0, 0, 0)

    // Find all sessions that started today for tables now empty/dirty (closed)
    const sessions = await this.prisma.order.groupBy({
      by: ['tableSessionId'],
      where: {
        tableSessionId: { not: null },
        type: 'DINE_IN',
        createdAt: { gte: today },
        table: { status: { in: ['EMPTY', 'DIRTY'] } },
      },
    })

    const results = await Promise.all(sessions.map(async ({ tableSessionId }) => {
      if (!tableSessionId) return null
      const orders = await this.prisma.order.findMany({
        where: { tableSessionId, status: { not: 'CANCELLED' } },
        include: {
          items: { include: { menuItem: true } },
          user: { select: { id: true, name: true } },
          settledBy: { select: { id: true, name: true } },
          table: true,
        },
        orderBy: { createdAt: 'asc' },
      })
      if (!orders.length || !orders[0].table) return null
      const table = orders[0].table
      const closedAt = orders[orders.length - 1].settledAt ?? orders[orders.length - 1].updatedAt
      return { table, sessionId: tableSessionId, orders, summary: this.buildSessionSummary(orders), closedAt }
    }))

    return results.filter(Boolean).sort((a: any, b: any) => b.closedAt - a.closedAt)
  }

  // Orders for a specific session by sessionId
  async getSessionBill(sessionId: string) {
    const orders = await this.prisma.order.findMany({
      where: { tableSessionId: sessionId, status: { not: 'CANCELLED' } },
      include: {
        items: { include: { menuItem: true } },
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

  // Today's takeaway orders grouped by token (for bills page Takeaway tab)
  async getTakeawayBillsToday() {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const orders = await this.prisma.order.findMany({
      where: { type: 'TAKEAWAY', createdAt: { gte: today }, status: { not: 'CANCELLED' } },
      include: {
        items: { include: { menuItem: true } },
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

  async getPendingRefunds() {
    return this.prisma.order.findMany({
      where: { paymentStatus: 'REFUND_REQUESTED' },
      include: {
        table: { select: { name: true, tableNumber: true } },
        user: { select: { name: true } },
        items: { include: { menuItem: { select: { name: true } } } },
        statusHistory: { orderBy: { changedAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    })
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
