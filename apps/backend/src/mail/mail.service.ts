import { Injectable } from '@nestjs/common'
import { MailerService } from '@nestjs-modules/mailer'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class MailService {
  constructor(
    private mailer: MailerService,
    private prisma: PrismaService,
  ) {}

  private async brand() {
    const s = await this.prisma.restaurantSettings.findFirst()
    return {
      restaurantName: s?.restaurantName ?? 'Al Manzil',
      brandColor:     s?.brandColor     ?? '#c0392b',
      brandColorDark: s?.brandColor     ? this.darken(s.brandColor) : '#922b21',
      logoUrl:        s?.logoUrl        ?? undefined,
      year:           new Date().getFullYear(),
    }
  }

  /** Darken a hex color by 20% for gradient use */
  private darken(hex: string): string {
    const n = parseInt(hex.replace('#', ''), 16)
    const r = Math.max(0, (n >> 16) - 40)
    const g = Math.max(0, ((n >> 8) & 0xff) - 40)
    const b = Math.max(0, (n & 0xff) - 40)
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
  }

  async sendOtp(to: string, name: string, code: string) {
    const ctx = await this.brand()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toLocaleTimeString('en-AE', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
    await this.mailer.sendMail({
      to,
      subject: `Your ${ctx.restaurantName} verification code`,
      template: 'otp',
      context: { ...ctx, name, code, expiresAt },
    })
  }

  async sendWelcome(to: string, name: string) {
    const ctx = await this.brand()
    const joinedAt = new Date().toLocaleDateString('en-AE', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
    await this.mailer.sendMail({
      to,
      subject: `Welcome to ${ctx.restaurantName} 🎉`,
      template: 'welcome',
      context: { ...ctx, name, email: to, joinedAt, menuUrl: '/menu' },
    })
  }
}
