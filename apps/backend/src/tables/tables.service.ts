import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TableStatus } from '@prisma/client'

const TABLE_NAMES = [
  'Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta',
  'Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi',
  'Rho','Sigma','Tau','Upsilon',
]

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

  async getAll(includeInactive = false) {
    const tables = await this.prisma.restaurantTable.findMany({
      where: includeInactive ? undefined : { isActive: { not: false } },
      orderBy: { tableNumber: 'asc' },
    })

    // Attach today's active booking (PENDING / CONFIRMED) to each table
    // so the floor plan can show a "Reserved" overlay without a separate API call
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999)

    const bookings = await this.prisma.booking.findMany({
      where: {
        slotDate: { gte: todayStart, lte: todayEnd },
        status:   { in: ['PENDING', 'CONFIRMED'] },
        tableId:  { not: null },
      },
      select: {
        id: true, tableId: true, slotTime: true, status: true, partySize: true,
        customer: { select: { name: true } },
      },
    })

    const byTable: Record<string, typeof bookings[0][]> = {}
    for (const b of bookings) {
      if (!b.tableId) continue
      if (!byTable[b.tableId]) byTable[b.tableId] = []
      byTable[b.tableId].push(b)
    }

    return tables.map(t => ({
      ...t,
      // next upcoming booking today (earliest slot time)
      upcomingBooking: (byTable[t.id] ?? [])
        .sort((a, b) => a.slotTime.localeCompare(b.slotTime))[0] ?? null,
    }))
  }

  getAvailable() {
    return this.prisma.restaurantTable.findMany({
      where: { status: 'EMPTY' },
      orderBy: { tableNumber: 'asc' },
    })
  }

  getByQrCode(qrCode: string) {
    return this.prisma.restaurantTable.findUnique({ where: { qrCode } })
  }

  getById(id: string) {
    return this.prisma.restaurantTable.findUnique({ where: { id } })
  }

  updateStatus(id: string, status: TableStatus) {
    return this.prisma.restaurantTable.update({ where: { id }, data: { status } })
  }

  updateName(id: string, name: string) {
    return this.prisma.restaurantTable.update({ where: { id }, data: { name } })
  }

  regenerateQr(id: string) {
    const qrCode = `table-${id.slice(0, 8)}-${Date.now()}`
    return this.prisma.restaurantTable.update({ where: { id }, data: { qrCode } })
  }

  create(tableNumber: number, capacity = 4, name?: string, zone = 'Indoor') {
    const qrCode = `table-${tableNumber}-${Date.now()}`
    const autoName = name ?? TABLE_NAMES[tableNumber - 1] ?? `Table ${tableNumber}`
    return this.prisma.restaurantTable.create({ data: { tableNumber, name: autoName, capacity, zone, qrCode } })
  }

  update(id: string, data: { name?: string; capacity?: number; zone?: string }) {
    const patch: Record<string, any> = {}
    if (data.name !== undefined) patch.name = data.name
    if (data.capacity !== undefined) patch.capacity = Number(data.capacity)
    if (data.zone !== undefined) patch.zone = data.zone
    return this.prisma.restaurantTable.update({ where: { id }, data: patch })
  }

  setActive(id: string, isActive: boolean) {
    return this.prisma.restaurantTable.update({ where: { id }, data: { isActive } })
  }

  async remove(id: string) {
    const table = await this.prisma.restaurantTable.findUnique({ where: { id } })
    if (!table) throw new NotFoundException('Table not found')
    if (table.status !== 'EMPTY') throw new BadRequestException('Can only delete empty tables — mark it clean first')
    // Block hard-delete if this table has any order history (paid, cancelled, or active).
    // Historical orders reference tableId for reports — use isActive=false to retire a table instead.
    const anyOrders = await this.prisma.order.count({ where: { tableId: id } })
    if (anyOrders > 0) {
      throw new BadRequestException(
        'This table has order history and cannot be deleted — set it inactive instead to remove it from service.',
      )
    }
    const anyBookings = await this.prisma.booking.count({ where: { tableId: id } })
    if (anyBookings > 0) {
      throw new BadRequestException(
        'This table has booking history and cannot be deleted — set it inactive instead.',
      )
    }
    return this.prisma.restaurantTable.delete({ where: { id } })
  }

  setReservable(id: string, isReservable: boolean) {
    return this.prisma.restaurantTable.update({ where: { id }, data: { isReservable } })
  }

  async seedDefaultNames() {
    const tables = await this.prisma.restaurantTable.findMany({ orderBy: { tableNumber: 'asc' } })
    for (const t of tables) {
      if (!t.name) {
        const name = TABLE_NAMES[t.tableNumber - 1] ?? `Table ${t.tableNumber}`
        await this.prisma.restaurantTable.update({ where: { id: t.id }, data: { name } })
      }
    }
  }
}
