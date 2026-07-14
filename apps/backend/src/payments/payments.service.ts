import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Stripe from 'stripe'
import { PrismaService } from '../prisma/prisma.service'
import { OrdersService } from '../orders/orders.service'

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)
  private stripe: Stripe

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private orders: OrdersService,
  ) {
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2026-06-24.dahlia',
    })
  }

  async createIntent(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException('Order not found')
    if (order.paymentStatus === 'PAID') throw new BadRequestException('Order already paid')

    const amountInFils = Math.round(Number(order.total) * 100)
    const intent = await this.stripe.paymentIntents.create({
      amount: amountInFils,
      currency: 'aed',
      metadata: { orderId, orderType: order.type },
      description: `Al Manzil Hotel — Order #${orderId.slice(-6).toUpperCase()}`,
    })

    await this.prisma.order.update({
      where: { id: orderId },
      data: { stripeIntentId: intent.id },
    })

    this.logger.log(`PaymentIntent created: ${intent.id} — orderId=${orderId} amount=${amountInFils}fils`)
    return { clientSecret: intent.client_secret, paymentIntentId: intent.id }
  }

  async confirmPayment(orderId: string, paymentIntentId: string) {
    const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId)
    if (intent.status !== 'succeeded') {
      this.logger.warn(`Payment confirmation failed — orderId=${orderId} intentId=${paymentIntentId} status=${intent.status}`)
      throw new BadRequestException(`Payment not confirmed. Status: ${intent.status}`)
    }

    const existing = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true } })
    if (!existing) throw new NotFoundException('Order not found')

    // Mark payment
    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'PAID', paymentMethod: 'CARD' },
    })

    if (existing.status === 'PRE_ORDER') {
      // Booking pre-payment: guest hasn't arrived yet — stay PRE_ORDER, kitchen fires on check-in
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { menuItem: true } }, table: true },
      })
      this.logger.log(`Pre-order payment confirmed (kitchen on hold): orderId=${orderId}`)
      return { order }
    }

    // Immediate order (TAKEAWAY or DINE_IN walk-in) — accept and fire kitchen
    const order = await this.orders.updateStatus(orderId, { status: 'ACCEPTED' })
    this.logger.log(`Payment confirmed + kitchen fired: orderId=${orderId} total=${order.total}`)
    return { order }
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET')
    if (!webhookSecret) return

    let event: Stripe.Event
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    } catch {
      this.logger.warn('Invalid Stripe webhook signature')
      throw new BadRequestException('Invalid webhook signature')
    }

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Stripe.PaymentIntent
      const orderId = intent.metadata.orderId
      if (orderId) {
        const existing = await this.prisma.order.findUnique({ where: { id: orderId }, select: { paymentStatus: true, status: true } })
        if (existing && existing.paymentStatus !== 'PAID') {
          await this.prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: 'PAID', paymentMethod: 'CARD' },
          })
          // Pre-orders: paid but kitchen waits for check-in
          if (existing.status !== 'PRE_ORDER') {
            await this.orders.updateStatus(orderId, { status: 'ACCEPTED' }).catch(() => {})
          }
          this.logger.log(`Webhook: payment_intent.succeeded — orderId=${orderId} status=${existing.status}`)
        }
      }
    }

    return { received: true }
  }

  // Counter collection: staff marks a single order PAID (takeaway cash/card at counter)
  async collectOrderPayment(orderId: string, method: 'CASH' | 'CARD' = 'CASH', settledById?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { paymentStatus: true } })
    if (!order) throw new NotFoundException('Order not found')
    if (order.paymentStatus === 'PAID') return { ok: true, alreadyPaid: true }
    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'PAID', paymentMethod: method, settledById: settledById ?? null, settledAt: new Date() },
    })
    return { ok: true }
  }

  // Guest selects "Pay Cash" — marks payment method, staff settles later
  async registerCashOrder(orderId: string) {
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentMethod: 'CASH' },
      include: { items: { include: { menuItem: true } }, table: true },
    })
    return order
  }

  // Settle all unpaid orders at a table — staff picks CASH or CARD
  async settleAllCashForTable(tableId: string, method: 'CASH' | 'CARD' = 'CASH', settledById?: string) {
    const unpaid = await this.prisma.order.findMany({
      where: { tableId, paymentStatus: 'UNPAID', status: { notIn: ['CANCELLED', 'PRE_ORDER'] } },
      select: { id: true, total: true },
    })
    if (!unpaid.length) return { settled: 0, total: 0 }

    const now = new Date()
    await this.prisma.$transaction([
      ...unpaid.map(o => this.prisma.order.update({
        where: { id: o.id },
        data: { paymentStatus: 'PAID', paymentMethod: method, settledById: settledById ?? null, settledAt: now },
      })),
      this.prisma.restaurantTable.update({
        where: { id: tableId },
        data: { status: 'DIRTY' },
      }),
    ])

    return { settled: unpaid.length, total: unpaid.reduce((s, o) => s + Number(o.total), 0) }
  }

  // Settle a specific guest session — supports discount, split payment, and tip
  async settleSession(sessionId: string, opts: {
    method: 'CASH' | 'CARD' | 'SPLIT'
    discountAmount?: number
    discountReason?: string
    splitCashAmount?: number
    tipAmount?: number
    settledById?: string
  }) {
    const { method, discountAmount = 0, discountReason, splitCashAmount, tipAmount = 0, settledById } = opts

    const unpaid = await this.prisma.order.findMany({
      where: {
        tableSessionId: sessionId,
        paymentStatus: 'UNPAID',
        // Settle any active order — not just DELIVERED.
        // Pre-orders can be in ACCEPTED/PREPARING/READY when staff settle at the table.
        status: { notIn: ['CANCELLED', 'PRE_ORDER'] },
      },
      select: { id: true, total: true, tableId: true },
    })
    if (!unpaid.length) throw new Error('No unpaid orders found for this session')

    const sessionTotal = unpaid.reduce((s, o) => s + Number(o.total), 0)

    // Distribute discount proportionally across orders (last order absorbs rounding)
    const discountShares = unpaid.map((o, i) => {
      if (discountAmount <= 0 || sessionTotal === 0) return 0
      if (i === unpaid.length - 1) {
        const alreadyAllocated = unpaid.slice(0, i).reduce((s, _, j) => {
          return s + Math.round((Number(unpaid[j].total) / sessionTotal) * discountAmount * 100) / 100
        }, 0)
        return Math.max(0, Math.round((discountAmount - alreadyAllocated) * 100) / 100)
      }
      return Math.round((Number(o.total) / sessionTotal) * discountAmount * 100) / 100
    })

    // Distribute split cash amount proportionally too
    const cashShares = unpaid.map((o, i) => {
      if (method !== 'SPLIT' || !splitCashAmount || sessionTotal === 0) return null
      if (i === unpaid.length - 1) {
        const alreadyAllocated = unpaid.slice(0, i).reduce((s, _, j) => {
          return s + Math.round((Number(unpaid[j].total) / sessionTotal) * splitCashAmount * 100) / 100
        }, 0)
        return Math.max(0, Math.round((splitCashAmount - alreadyAllocated) * 100) / 100)
      }
      return Math.round((Number(o.total) / sessionTotal) * splitCashAmount * 100) / 100
    })

    const settleNow = new Date()
    const tableId = unpaid[0].tableId

    await this.prisma.$transaction(async tx => {
      await Promise.all(unpaid.map((o, i) => tx.order.update({
        where: { id: o.id },
        data: {
          paymentStatus: 'PAID',
          paymentMethod: method as any,
          settledById: settledById ?? null,
          settledAt: settleNow,
          ...(discountShares[i] > 0 ? {
            discountAmount: discountShares[i],
            discountReason: discountReason ?? null,
            total: Math.max(0, Number(o.total) - discountShares[i]),
          } : {}),
          ...(cashShares[i] !== null ? { splitCashAmount: cashShares[i] } : {}),
          // Tip stored on first order only (represents the whole session tip)
          ...(i === 0 && tipAmount > 0 ? { tipAmount } : {}),
        },
      })))

      if (tableId) {
        const remaining = await tx.order.count({
          where: { tableId, status: 'DELIVERED', paymentStatus: 'UNPAID', tableSessionId: { not: sessionId } },
        })
        if (remaining === 0) {
          await tx.restaurantTable.update({ where: { id: tableId }, data: { status: 'DIRTY' } })
        }
      }
    })

    const finalTotal = sessionTotal - discountAmount
    return { settled: unpaid.length, total: finalTotal, tipAmount }
  }

  // Settle a single order (legacy endpoint, kept for compatibility)
  async settleCashPayment(orderId: string, settledById?: string) {
    const order = await this.prisma.$transaction(async tx => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'PAID', settledById: settledById ?? null, settledAt: new Date() },
        include: { items: { include: { menuItem: true } }, table: true },
      })

      if (updated.tableId) {
        const stillUnpaid = await tx.order.count({
          where: { tableId: updated.tableId, id: { not: orderId }, status: 'DELIVERED', paymentStatus: 'UNPAID' },
        })
        if (stillUnpaid === 0) {
          await tx.restaurantTable.update({ where: { id: updated.tableId }, data: { status: 'DIRTY' } })
        }
      }

      return updated
    })

    return { order }
  }
}
