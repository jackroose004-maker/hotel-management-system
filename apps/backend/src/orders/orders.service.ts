import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OrdersGateway } from '../websocket/orders.gateway'
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto'
import { OrderStatus } from '@prisma/client'

const VAT_RATE = 0.05

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService, private gateway: OrdersGateway) {}

  async create(dto: CreateOrderDto, userId?: string) {
    // Fetch all menu items to calculate prices server-side
    const itemIds = dto.items.map(i => i.menuItemId)
    const menuItems = await this.prisma.menuItem.findMany({ where: { id: { in: itemIds } } })

    if (menuItems.length !== itemIds.length) throw new BadRequestException('One or more menu items not found')

    const menuMap = new Map(menuItems.map(m => [m.id, m]))

    const subtotal = dto.items.reduce((sum, item) => {
      const price = Number(menuMap.get(item.menuItemId)!.price)
      return sum + price * item.quantity
    }, 0)

    const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100
    const total = Math.round((subtotal + vatAmount) * 100) / 100

    // Get next token for takeaway
    let tokenNumber: number | undefined
    if (dto.type === 'TAKEAWAY') {
      const lastOrder = await this.prisma.order.findFirst({
        where: { type: 'TAKEAWAY', createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        orderBy: { tokenNumber: 'desc' },
      })
      tokenNumber = (lastOrder?.tokenNumber ?? 0) + 1
    }

    const order = await this.prisma.order.create({
      data: {
        type: dto.type,
        tableId: dto.tableId,
        userId,
        tokenNumber,
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
          })),
        },
      },
      include: { items: { include: { menuItem: true } }, table: true },
    })

    this.gateway.emitNewOrder(order)
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
      include: { items: { include: { menuItem: true } }, table: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    return order
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.getById(id)
    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: dto.status as OrderStatus },
      include: { items: { include: { menuItem: true } }, table: true },
    })

    if (dto.status === 'READY') this.gateway.emitOrderReady(updated)
    else this.gateway.emitOrderUpdated(updated)

    return updated
  }

  getActiveOrders() {
    return this.prisma.order.findMany({
      where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } },
      include: { items: { include: { menuItem: true } }, table: true },
      orderBy: { createdAt: 'asc' },
    })
  }
}
