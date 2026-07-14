import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as webpush from 'web-push'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name)
  private enabled = false

  constructor(private prisma: PrismaService, config: ConfigService) {
    const pub = config.get<string>('VAPID_PUBLIC_KEY')
    const priv = config.get<string>('VAPID_PRIVATE_KEY')
    const subject = config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@almanzil.ae'
    if (pub && priv) {
      webpush.setVapidDetails(subject, pub, priv)
      this.enabled = true
    } else {
      this.logger.warn('VAPID keys not set — web push disabled')
    }
  }

  async subscribe(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userId?: string, role = 'STAFF') {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userId: userId ?? null, role },
      update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, userId: userId ?? null, role },
    })
    return { ok: true }
  }

  async unsubscribe(endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } })
    return { ok: true }
  }

  // Send to all staff devices. Fire-and-forget — never blocks the caller.
  notifyStaff(title: string, body: string, url = '/staff/orders', tag = 'almanzil-staff') {
    if (!this.enabled) return
    this.send({ role: 'STAFF' }, { title, body, url, tag }).catch(() => {})
  }

  // Send to a specific customer's devices
  notifyUser(userId: string, title: string, body: string, url = '/menu/orders', tag = 'almanzil') {
    if (!this.enabled || !userId) return
    this.send({ userId }, { title, body, url, tag }).catch(() => {})
  }

  private async send(where: { role?: string; userId?: string }, payload: { title: string; body: string; url: string; tag: string }) {
    const subs = await this.prisma.pushSubscription.findMany({ where })
    if (!subs.length) return
    const json = JSON.stringify(payload)
    await Promise.allSettled(subs.map(async s => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json,
        )
      } catch (err: any) {
        // 404/410 = subscription expired — clean it up
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {})
        }
      }
    }))
  }
}
