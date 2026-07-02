import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'

// Tables in DIRTY status for longer than this are auto-cleared to EMPTY
const AUTO_CLEAR_MINUTES = 15

@Injectable()
export class TableCleanupService {
  private readonly logger = new Logger(TableCleanupService.name)

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async autoClearTables() {
    const threshold = new Date(Date.now() - AUTO_CLEAR_MINUTES * 60 * 1000)

    // Find tables that have been DIRTY for > 15 min with no active orders
    const dirtySince = await this.prisma.restaurantTable.findMany({
      where: { status: 'DIRTY', updatedAt: { lt: threshold } },
      select: { id: true, tableNumber: true },
    })

    if (dirtySince.length === 0) return

    for (const table of dirtySince) {
      // Double-check no active or pending orders exist for this table
      const activeOrders = await this.prisma.order.count({
        where: {
          tableId: table.id,
          status: { notIn: ['DELIVERED', 'CANCELLED'] },
        },
      })

      if (activeOrders === 0) {
        await this.prisma.restaurantTable.update({
          where: { id: table.id },
          data: { status: 'EMPTY' },
        })
        this.logger.log(`Table ${table.tableNumber} auto-cleared to Available after ${AUTO_CLEAR_MINUTES}min`)
      }
    }
  }
}
