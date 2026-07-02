import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Role } from '@prisma/client'

interface LogParams {
  actorId?: string
  actorRole?: Role
  action: string
  entityType: string
  entityId: string
  before?: object
  after?: object
  ipAddress?: string
  userAgent?: string
}

@Injectable()
export class ActivityLogService {
  constructor(private prisma: PrismaService) {}

  async log(params: LogParams) {
    return this.prisma.activityLog.create({ data: params })
  }

  async findAll(filters: { entityType?: string; entityId?: string; actorId?: string; limit?: number }) {
    return this.prisma.activityLog.findMany({
      where: {
        ...(filters.entityType && { entityType: filters.entityType }),
        ...(filters.entityId && { entityId: filters.entityId }),
        ...(filters.actorId && { actorId: filters.actorId }),
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 100,
      include: { actor: { select: { id: true, name: true, role: true } } },
    })
  }
}
