import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Stripe from 'stripe'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class PaymentsService {
  private stripe: Stripe

  constructor(private prisma: PrismaService, private config: ConfigService) {
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

    return { clientSecret: intent.client_secret, paymentIntentId: intent.id }
  }

  async confirmPayment(orderId: string, paymentIntentId: string) {
    const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId)
    if (intent.status !== 'succeeded') {
      throw new BadRequestException(`Payment not confirmed. Status: ${intent.status}`)
    }

    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'PAID', paymentMethod: 'CARD', status: 'ACCEPTED' },
      include: { items: { include: { menuItem: true } }, table: true },
    })
    return { order }
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET')
    if (!webhookSecret) return

    let event: Stripe.Event
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    } catch {
      throw new BadRequestException('Invalid webhook signature')
    }

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Stripe.PaymentIntent
      const orderId = intent.metadata.orderId
      if (orderId) {
        await this.prisma.order.update({
          where: { id: orderId },
          data: { paymentStatus: 'PAID', paymentMethod: 'CARD', status: 'ACCEPTED' },
        })
      }
    }

    return { received: true }
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
  async settleAllCashForTable(tableId: string, method: 'CASH' | 'CARD' = 'CASH') {
    const unpaid = await this.prisma.order.findMany({
      where: { tableId, status: 'DELIVERED', paymentStatus: 'UNPAID' },
      select: { id: true, total: true },
    })
    if (!unpaid.length) return { settled: 0, total: 0 }

    await this.prisma.$transaction([
      ...unpaid.map(o => this.prisma.order.update({
        where: { id: o.id },
        data: { paymentStatus: 'PAID', paymentMethod: method },
      })),
      this.prisma.restaurantTable.update({
        where: { id: tableId },
        data: { status: 'DIRTY' },
      }),
    ])

    return { settled: unpaid.length, total: unpaid.reduce((s, o) => s + Number(o.total), 0) }
  }

  // Settle a specific guest session (personal tab) — staff picks CASH or CARD
  async settleSession(sessionId: string, method: 'CASH' | 'CARD' = 'CASH') {
    const unpaid = await this.prisma.order.findMany({
      where: { tableSessionId: sessionId, status: 'DELIVERED', paymentStatus: 'UNPAID' },
      select: { id: true, total: true, tableId: true },
    })
    if (!unpaid.length) return { settled: 0, total: 0 }

    await this.prisma.$transaction(
      unpaid.map(o => this.prisma.order.update({
        where: { id: o.id },
        data: { paymentStatus: 'PAID', paymentMethod: method },
      }))
    )

    const tableId = unpaid[0].tableId
    if (tableId) {
      const remaining = await this.prisma.order.count({
        where: { tableId, status: 'DELIVERED', paymentStatus: 'UNPAID' },
      })
      if (remaining === 0) {
        await this.prisma.restaurantTable.update({ where: { id: tableId }, data: { status: 'DIRTY' } })
      }
    }

    return { settled: unpaid.length, total: unpaid.reduce((s, o) => s + Number(o.total), 0) }
  }

  // Settle a single order (legacy endpoint, kept for compatibility)
  async settleCashPayment(orderId: string) {
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'PAID' },
      include: { items: { include: { menuItem: true } }, table: true },
    })

    if (order.tableId) {
      const stillUnpaid = await this.prisma.order.count({
        where: { tableId: order.tableId, id: { not: orderId }, status: 'DELIVERED', paymentStatus: 'UNPAID' },
      })
      if (stillUnpaid === 0) {
        await this.prisma.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'DIRTY' } })
      }
    }

    return { order }
  }
}
