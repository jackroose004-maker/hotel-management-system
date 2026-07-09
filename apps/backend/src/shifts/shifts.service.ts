import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ShiftsService {
  constructor(private prisma: PrismaService) {}

  async clockIn(userId: string, role: string) {
    const open = await this.prisma.shift.findFirst({
      where: { userId, clockOut: null },
    })
    if (open) throw new BadRequestException('Already clocked in')
    return this.prisma.shift.create({ data: { userId, role } })
  }

  async clockOut(userId: string) {
    const open = await this.prisma.shift.findFirst({
      where: { userId, clockOut: null },
      orderBy: { clockIn: 'desc' },
    })
    if (!open) throw new BadRequestException('Not clocked in')
    return this.prisma.shift.update({
      where: { id: open.id },
      data: { clockOut: new Date() },
    })
  }

  getActiveShifts() {
    return this.prisma.shift.findMany({
      where: { clockOut: null },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { clockIn: 'asc' },
    })
  }

  getMyShift(userId: string) {
    return this.prisma.shift.findFirst({
      where: { userId, clockOut: null },
      orderBy: { clockIn: 'desc' },
    })
  }

  getTodayShifts() {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return this.prisma.shift.findMany({
      where: { clockIn: { gte: start } },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { clockIn: 'asc' },
    })
  }
}
