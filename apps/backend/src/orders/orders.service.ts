import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OrdersGateway } from '../websocket/orders.gateway'
import { PaymentsService } from '../payments/payments.service'
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto'
import { OrderStatus } from '@prisma/client'
import { randomUUID } from 'crypto'

const VAT_RATE = 0.05

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private gateway: OrdersGateway,
    private payments: PaymentsService,
  ) {}

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
      return sum + price * item.quantity
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
    if (dto.type === 'DINE_IN' && dto.tableId) {
      if (dto.guestTabToken) {
        // Guest: device token IS their tab — use directly
        tableSessionId = dto.guestTabToken
      } else if (userId) {
        // Logged-in customer: find their tab at this table today
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const existing = await this.prisma.order.findFirst({
          where: { tableId: dto.tableId, userId, tableSessionId: { not: null }, createdAt: { gte: today } },
          orderBy: { createdAt: 'desc' },
          select: { tableSessionId: true },
        })
        tableSessionId = existing?.tableSessionId ?? randomUUID()
      } else {
        // Staff placing an order without a guest token — attach to latest active session
        const existing = await this.prisma.order.findFirst({
          where: { tableId: dto.tableId, tableSessionId: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { tableSessionId: true },
        })
        tableSessionId = existing?.tableSessionId ?? randomUUID()
      }
    }

    const order = await this.prisma.order.create({
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
          })),
        },
        statusHistory: { create: { fromStatus: null, toStatus: 'PENDING', changedById: userId } },
      },
      include: { items: { include: { menuItem: true } }, table: true },
    })

    // Auto-mark table as OCCUPIED when a dine-in order is placed
    if (dto.type === 'DINE_IN' && dto.tableId) {
      await this.prisma.restaurantTable.update({ where: { id: dto.tableId }, data: { status: 'OCCUPIED' } })
    }

    this.gateway.emitNewOrder(order)

    if (dto.paymentMethod === 'CASH') {
      return this.payments.registerCashOrder(order.id)
    }
    return order
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
    if (dto.status === 'ACCEPTED') {
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
      const remaining = await this.prisma.order.count({
        where: { tableId: order.tableId, status: { notIn: ['DELIVERED', 'CANCELLED'] }, id: { not: id } },
      })
      if (remaining === 0) {
        // If any delivered orders still unpaid, guest is seated waiting for bill
        const unpaid = await this.prisma.order.count({
          where: { tableId: order.tableId, status: 'DELIVERED', paymentStatus: 'UNPAID' },
        })
        const tableStatus = unpaid > 0 ? 'BILL_PENDING' : 'DIRTY'
        await this.prisma.restaurantTable.update({ where: { id: order.tableId }, data: { status: tableStatus } })
      }
    }

    if (dto.status === 'READY') this.gateway.emitOrderReady(updated)
    else this.gateway.emitOrderUpdated(updated)

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
    return updated
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
    return this.prisma.order.findMany({
      where: { userId },
      include: { items: { include: { menuItem: true } }, table: true, feedback: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
  }

  getActiveOrders() {
    // Include DELIVERED+UNPAID so counter staff can collect cash payment
    return this.prisma.order.findMany({
      where: {
        OR: [
          { status: { notIn: ['DELIVERED', 'CANCELLED'] } },
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
    const subtotal  = orders.reduce((s, o) => s + Number(o.subtotal), 0)
    const vatAmount = orders.reduce((s, o) => s + Number(o.vatAmount), 0)
    const total     = orders.reduce((s, o) => s + Number(o.total), 0)
    return {
      subtotal, vatAmount, total,
      orderCount: orders.length,
      allPaid:   orders.length > 0 && orders.every(o => o.paymentStatus === 'PAID'),
      anyUnpaid: orders.some(o => o.paymentStatus === 'UNPAID'),
    }
  }

  // Active sessions at a specific table — used by staff to pick "who am I ordering for?"
  async getTableSessions(tableId: string) {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const sessionRows = await this.prisma.order.groupBy({
      by: ['tableSessionId'],
      where: { tableId, tableSessionId: { not: null }, createdAt: { gte: today }, status: { not: 'CANCELLED' } },
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
    const today = new Date(); today.setHours(0, 0, 0, 0)

    const tables = await this.prisma.restaurantTable.findMany({
      where: { status: { in: ['OCCUPIED', 'BILL_PENDING'] } },
      orderBy: { tableNumber: 'asc' },
    })

    const results = await Promise.all(tables.map(async table => {
      // All distinct sessions (personal tabs) active at this table today
      const sessionRows = await this.prisma.order.groupBy({
        by: ['tableSessionId'],
        where: { tableId: table.id, tableSessionId: { not: null }, createdAt: { gte: today }, status: { not: 'CANCELLED' } },
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
          table: true,
        },
        orderBy: { createdAt: 'asc' },
      })
      if (!orders.length || !orders[0].table) return null
      const table = orders[0].table
      const closedAt = orders[orders.length - 1].updatedAt
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
}
