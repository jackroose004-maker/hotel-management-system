import { Injectable } from '@nestjs/common'
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

  getAll() {
    return this.prisma.restaurantTable.findMany({ orderBy: { tableNumber: 'asc' } })
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

  create(tableNumber: number, capacity = 4, name?: string) {
    const qrCode = `table-${tableNumber}-${Date.now()}`
    const autoName = name ?? TABLE_NAMES[tableNumber - 1] ?? `Table ${tableNumber}`
    return this.prisma.restaurantTable.create({ data: { tableNumber, name: autoName, capacity, qrCode } })
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
