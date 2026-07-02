import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PaymentMethod } from '@prisma/client'

@Injectable()
export class BillsService {
  constructor(private prisma: PrismaService) {}

  // Open or retrieve existing open bill for a table session
  async getOrCreateBill(tableSessionId: string, tableId?: string) {
    const existing = await this.prisma.bill.findFirst({
      where: { tableSessionId, status: 'OPEN' },
      include: { orders: { include: { items: { include: { menuItem: true, modifiers: true } } } }, payments: true },
    })
    if (existing) return existing

    // Aggregate from all orders in this session
    const orders = await this.prisma.order.findMany({
      where: { tableSessionId, paymentStatus: 'UNPAID' },
    })

    const subtotal = orders.reduce((s, o) => s + Number(o.subtotal), 0)
    const vatAmount = orders.reduce((s, o) => s + Number(o.vatAmount), 0)
    const discountAmount = orders.reduce((s, o) => s + Number(o.discountAmount), 0)
    const total = subtotal + vatAmount - discountAmount

    return this.prisma.bill.create({
      data: {
        tableSessionId,
        tableId,
        subtotal,
        vatAmount,
        discountAmount,
        total,
        orders: { connect: orders.map(o => ({ id: o.id })) },
      },
      include: { orders: { include: { items: { include: { menuItem: true, modifiers: true } } } }, payments: true },
    })
  }

  async getBill(billId: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: {
        table: true,
        generatedBy: { select: { id: true, name: true } },
        orders: {
          include: {
            items: { include: { menuItem: true, modifiers: { include: { option: true } } } },
            user: { select: { id: true, name: true } },
          },
        },
        payments: { include: { collectedBy: { select: { id: true, name: true } } } },
      },
    })
    if (!bill) throw new NotFoundException('Bill not found')
    return bill
  }

  // Add a payment split to a bill
  async addPayment(billId: string, method: PaymentMethod, amount: number, collectedById: string, reference?: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: { payments: true },
    })
    if (!bill) throw new NotFoundException('Bill not found')
    if (bill.status === 'CLOSED') throw new BadRequestException('Bill already closed')

    const paidSoFar = bill.payments.reduce((s, p) => s + Number(p.amount), 0)
    const remaining = Number(bill.total) - paidSoFar

    if (amount > remaining + 0.01) {
      throw new BadRequestException(`Amount exceeds remaining balance of ${remaining.toFixed(2)}`)
    }

    const payment = await this.prisma.billPayment.create({
      data: { billId, method, amount, reference, collectedById },
    })

    // Auto-close if fully paid
    const newPaid = paidSoFar + amount
    if (newPaid >= Number(bill.total) - 0.01) {
      await this.closeBill(billId, collectedById)
    }

    return payment
  }

  async closeBill(billId: string, staffId: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: { orders: true },
    })
    if (!bill) throw new NotFoundException('Bill not found')

    await this.prisma.$transaction([
      // Close the bill
      this.prisma.bill.update({
        where: { id: billId },
        data: { status: 'CLOSED', closedAt: new Date() },
      }),
      // Mark all linked orders as paid
      this.prisma.order.updateMany({
        where: { billId },
        data: { paymentStatus: 'PAID' },
      }),
      // Set table to DIRTY
      ...(bill.tableId
        ? [this.prisma.restaurantTable.update({ where: { id: bill.tableId }, data: { status: 'DIRTY' } })]
        : []),
    ])

    return { ok: true, billId }
  }

  async voidBill(billId: string, staffId: string, reason?: string) {
    const bill = await this.prisma.bill.findUnique({ where: { id: billId } })
    if (!bill) throw new NotFoundException('Bill not found')
    if (bill.status === 'CLOSED') throw new BadRequestException('Cannot void a closed bill')

    return this.prisma.bill.update({
      where: { id: billId },
      data: { status: 'VOIDED' },
    })
  }

  async incrementPrintCount(billId: string) {
    return this.prisma.bill.update({ where: { id: billId }, data: { printCount: { increment: 1 } } })
  }

  async getTodaysBills() {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    return this.prisma.bill.findMany({
      where: { createdAt: { gte: start } },
      include: {
        table: true,
        payments: true,
        orders: { include: { items: { include: { menuItem: true } }, user: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }
}
