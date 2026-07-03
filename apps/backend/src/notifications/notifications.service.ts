import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationType } from '@prisma/client'

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, type: NotificationType, title: string, body: string, data?: object) {
    return this.prisma.notification.create({ data: { userId, type, title, body, data } })
  }

  async findForUser(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly && { isRead: false }) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
  }

  async markRead(userId: string, ids: string[]) {
    await this.prisma.notification.updateMany({
      where: { id: { in: ids }, userId },
      data: { isRead: true, readAt: new Date() },
    })
    return { ok: true }
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })
    return { ok: true }
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false } })
    return { count }
  }

  async upsertDeviceToken(userId: string, token: string, platform: string, userAgent?: string) {
    return this.prisma.deviceToken.upsert({
      where: { token },
      update: { lastSeenAt: new Date(), userId },
      create: { userId, token, platform, userAgent },
    })
  }

  async getDeviceTokens(userId: string) {
    return this.prisma.deviceToken.findMany({ where: { userId } })
  }

  async removeDeviceToken(token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { token } })
    return { ok: true }
  }
}
