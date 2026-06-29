import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TableStatus } from '@prisma/client'

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

  getAll() {
    return this.prisma.restaurantTable.findMany({ orderBy: { tableNumber: 'asc' } })
  }

  updateStatus(id: string, status: TableStatus) {
    return this.prisma.restaurantTable.update({ where: { id }, data: { status } })
  }

  create(tableNumber: number, capacity = 4) {
    const qrCode = `table-${tableNumber}-${Date.now()}`
    return this.prisma.restaurantTable.create({ data: { tableNumber, capacity, qrCode } })
  }
}
