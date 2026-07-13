import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // Generate or re-generate a DailyReport for a given date (defaults to yesterday)
  async generateDailyReport(date?: Date) {
    const target = date ?? this.yesterday()
    const start = new Date(target); start.setHours(0, 0, 0, 0)
    const end = new Date(target); end.setHours(23, 59, 59, 999)

    const [orders, statusHistory, feedback] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
        include: { items: true },
      }),
      this.prisma.orderStatusHistory.findMany({
        where: { changedAt: { gte: start, lte: end }, toStatus: 'DELIVERED' },
      }),
      this.prisma.feedback.findMany({
        where: { createdAt: { gte: start, lte: end } },
      }),
    ])

    const paid = orders.filter(o => o.paymentStatus === 'PAID')
    const cancelled = await this.prisma.order.count({ where: { createdAt: { gte: start, lte: end }, status: 'CANCELLED' } })

    const grossRevenue = paid.reduce((s, o) => s + Number(o.total), 0)
    const vatCollected = paid.reduce((s, o) => s + Number(o.vatAmount), 0)
    const discountGiven = paid.reduce((s, o) => s + Number(o.discountAmount), 0)
    const netRevenue = grossRevenue - vatCollected
    const cashRevenue = paid.filter(o => o.paymentMethod === 'CASH').reduce((s, o) => s + Number(o.total), 0)
    const cardRevenue = grossRevenue - cashRevenue

    // Average kitchen prep time (PENDING → DELIVERED) in minutes
    let avgPrepTimeMins: number | null = null
    if (statusHistory.length > 0) {
      const pendingTimes = await this.prisma.orderStatusHistory.findMany({
        where: { orderId: { in: statusHistory.map(h => h.orderId) }, fromStatus: null, toStatus: 'PENDING' },
      })
      const pairs = statusHistory.map(delivered => {
        const created = pendingTimes.find(p => p.orderId === delivered.orderId)
        if (!created) return null
        return (delivered.changedAt.getTime() - created.changedAt.getTime()) / 60000
      }).filter(Boolean) as number[]
      if (pairs.length) avgPrepTimeMins = pairs.reduce((a, b) => a + b, 0) / pairs.length
    }

    // Peak hour
    const hourCounts: Record<number, number> = {}
    orders.forEach(o => { const h = o.createdAt.getHours(); hourCounts[h] = (hourCounts[h] ?? 0) + 1 })
    const peakHour = Object.entries(hourCounts).sort((a, b) => +b[1] - +a[1])[0]?.[0]

    // Top item by quantity
    const itemQty: Record<string, number> = {}
    paid.forEach(o => o.items.forEach(i => { itemQty[i.menuItemId] = (itemQty[i.menuItemId] ?? 0) + i.quantity }))
    const topItemId = Object.entries(itemQty).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    const avgRating = feedback.length
      ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length
      : null

    const report = {
      date: start,
      totalOrders: orders.length,
      cancelledOrders: cancelled,
      totalCovers: paid.length,
      grossRevenue,
      vatCollected,
      discountGiven,
      netRevenue,
      cashRevenue,
      cardRevenue,
      avgOrderValue: paid.length ? grossRevenue / paid.length : 0,
      avgPrepTimeMins,
      avgRating,
      peakHour: peakHour ? +peakHour : null,
      topItemId,
    }

    return this.prisma.dailyReport.upsert({
      where: { date: start },
      create: report,
      update: report,
    })
  }

  async getReport(date: Date) {
    const d = new Date(date); d.setHours(0, 0, 0, 0)
    return this.prisma.dailyReport.findUnique({ where: { date: d } })
  }

  async getLast30Days() {
    const since = new Date(); since.setDate(since.getDate() - 30); since.setHours(0, 0, 0, 0)
    return this.prisma.dailyReport.findMany({
      where: { date: { gte: since } },
      orderBy: { date: 'asc' },
    })
  }

  // Live today stats (not from cache — always fresh)
  async todayLive() {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const [totalOrders, paidOrders, cancelledOrders, pendingOrders, feedbackToday] = await Promise.all([
      this.prisma.order.count({ where: { createdAt: { gte: start } } }),
      this.prisma.order.findMany({ where: { createdAt: { gte: start }, paymentStatus: 'PAID' } }),
      this.prisma.order.count({ where: { createdAt: { gte: start }, status: 'CANCELLED' } }),
      this.prisma.order.count({ where: { createdAt: { gte: start }, status: 'PENDING' } }),
      this.prisma.feedback.findMany({ where: { createdAt: { gte: start } } }),
    ])

    const grossRevenue = paidOrders.reduce((s, o) => s + Number(o.total), 0)
    const avgRating = feedbackToday.length
      ? feedbackToday.reduce((s, f) => s + f.rating, 0) / feedbackToday.length
      : null

    return {
      totalOrders,
      cancelledOrders,
      pendingOrders,
      orderCount: paidOrders.length,
      grossRevenue,
      avgRating,
    }
  }

  private yesterday() {
    const d = new Date(); d.setDate(d.getDate() - 1); return d
  }
}
