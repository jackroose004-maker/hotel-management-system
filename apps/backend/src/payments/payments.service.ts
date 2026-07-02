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

    // Amount in fils (AED smallest unit = fils, 100 fils = 1 AED)
    const amountInFils = Math.round(Number(order.total) * 100)

    const intent = await this.stripe.paymentIntents.create({
      amount: amountInFils,
      currency: 'aed',
      metadata: { orderId, orderType: order.type },
      description: `Al Manzil Hotel — Order #${orderId.slice(-6).toUpperCase()}`,
    })

    // Upsert payment record
    await this.prisma.payment.upsert({
      where: { orderId },
      update: { stripeIntentId: intent.id, amount: order.total },
      create: { orderId, stripeIntentId: intent.id, amount: order.total, currency: 'AED', status: 'UNPAID' },
    })

    return { clientSecret: intent.client_secret, paymentIntentId: intent.id }
  }

  async confirmPayment(orderId: string, paymentIntentId: string) {
    const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId)

    if (intent.status !== 'succeeded') {
      throw new BadRequestException(`Payment not confirmed. Status: ${intent.status}`)
    }

    // Update both payment and order in a transaction
    const [payment, order] = await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { orderId },
        data: { status: 'PAID' },
      }),
      this.prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'PAID', paymentMethod: 'CARD', status: 'ACCEPTED' },
        include: { items: { include: { menuItem: true } }, table: true },
      }),
    ])

    return { payment, order }
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
        await this.prisma.$transaction([
          this.prisma.payment.update({ where: { orderId }, data: { status: 'PAID' } }),
          this.prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAID', paymentMethod: 'CARD', status: 'ACCEPTED' } }),
        ])
      }
    }

    return { received: true }
  }

  // Guest selects "Pay Cash" — records intent, keeps order PENDING for manager approval
  async registerCashOrder(orderId: string) {
    const existingOrder = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } })
    await this.prisma.payment.upsert({
      where: { orderId },
      update: { amount: existingOrder.total },
      create: { orderId, amount: existingOrder.total, currency: 'AED', status: 'UNPAID' },
    })
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentMethod: 'CASH' },
      include: { items: { include: { menuItem: true } }, table: true },
    })
    return order
  }

  // Settle every unpaid cash order at a table in one shot (one-tap for staff)
  async settleAllCashForTable(tableId: string) {
    const unpaid = await this.prisma.order.findMany({
      where: { tableId, status: 'DELIVERED', paymentStatus: 'UNPAID', paymentMethod: 'CASH' },
      select: { id: true, total: true },
    })
    if (!unpaid.length) return { settled: 0, total: 0 }

    await this.prisma.$transaction([
      ...unpaid.map(o => this.prisma.payment.upsert({
        where: { orderId: o.id },
        update: { status: 'PAID', amount: o.total },
        create: { orderId: o.id, amount: o.total, currency: 'AED', status: 'PAID' },
      })),
      ...unpaid.map(o => this.prisma.order.update({
        where: { id: o.id },
        data: { paymentStatus: 'PAID' },
      })),
      this.prisma.restaurantTable.update({
        where: { id: tableId },
        data: { status: 'DIRTY' },
      }),
    ])

    const total = unpaid.reduce((s, o) => s + Number(o.total), 0)
    return { settled: unpaid.length, total }
  }

  // Manager settles cash payment after delivery
  async settleCashPayment(orderId: string) {
    const existingOrder = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } })
    const [payment, order] = await this.prisma.$transaction([
      this.prisma.payment.upsert({
        where: { orderId },
        update: { status: 'PAID', amount: existingOrder.total },
        create: { orderId, amount: existingOrder.total, currency: 'AED', status: 'PAID' },
      }),
      this.prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'PAID' },
        include: { items: { include: { menuItem: true } }, table: true },
      }),
    ])

    // After settling, check if any other orders for this table are still unpaid
    if (existingOrder.tableId) {
      const stillUnpaid = await this.prisma.order.count({
        where: {
          tableId: existingOrder.tableId,
          id: { not: orderId },
          status: 'DELIVERED',
          paymentStatus: 'UNPAID',
        },
      })
      if (stillUnpaid === 0) {
        // All bills settled — table is now clearing
        await this.prisma.restaurantTable.update({
          where: { id: existingOrder.tableId },
          data: { status: 'DIRTY' },
        })
      }
    }

    return { payment, order }
  }
}
