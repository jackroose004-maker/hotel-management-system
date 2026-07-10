import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get() {
    let settings = await this.prisma.restaurantSettings.findFirst()
    if (!settings) {
      settings = await this.prisma.restaurantSettings.create({ data: {} })
    }
    return settings
  }

  async getBrand() {
    const s = await this.get()
    return {
      restaurantName: s.restaurantName,
      restaurantNameAr: s.restaurantNameAr,
      tagline: s.tagline,
      taglineAr: s.taglineAr,
      logoUrl: s.logoUrl,
      brandColor: s.brandColor,
      showLanguageToggle: s.showLanguageToggle,
      loginBg: s.loginDesktopImage,
    }
  }

  async getUserEmail(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    return u?.email ?? 'test@example.com'
  }

  async getEmailTemplates() {
    return this.prisma.emailTemplate.findMany({ orderBy: { key: 'asc' } })
  }

  async updateEmailTemplate(id: string, dto: {
    subject?: string; fromName?: string | null; replyTo?: string | null
    enabled?: boolean; localeEnabled?: boolean
    bgColor?: string; cardTheme?: string
    footerNote?: string | null
    footerNoReply?: string | null; footerNoReplyAr?: string | null
    greeting?: string | null; greetingAr?: string | null
  }) {
    return this.prisma.emailTemplate.update({ where: { id }, data: dto })
  }

  async previewEmailTemplate(key: string): Promise<string> {
    const [s, tmpl] = await Promise.all([
      this.prisma.restaurantSettings.findFirst(),
      this.prisma.emailTemplate.findUnique({ where: { key } }),
    ])
    const social = (s?.socialLinks ?? {}) as Record<string, string>
    const brandColor = s?.brandColor ?? '#c0392b'
    const darken = (hex: string) => {
      const n = parseInt(hex.replace('#', ''), 16)
      const r = Math.max(0, (n >> 16) - 40)
      const g = Math.max(0, ((n >> 8) & 0xff) - 40)
      const b = Math.max(0, (n & 0xff) - 40)
      return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
    }
    const ctx = {
      restaurantName:   s?.restaurantName   ?? 'Al Manzil',
      brandColor,
      brandColorDark:   darken(brandColor),
      logoUrl:          s?.logoUrl          ?? undefined,
      year:             new Date().getFullYear(),
      supportEmail:     s?.supportEmail     ?? null,
      supportPhone:     s?.supportPhone     ?? null,
      socialInstagram:  social.instagram    ?? null,
      socialWhatsapp:   social.whatsapp     ?? null,
      socialTelegram:   social.telegram     ?? null,
      socialTiktok:     social.tiktok       ?? null,
      socialFacebook:   social.facebook     ?? null,
      socialTwitter:    social.twitter      ?? null,
      hasSocial:        Object.keys(social).length > 0,
      bgColor:          tmpl?.bgColor       ?? '#f0f0f0',
      cardTheme:        tmpl?.cardTheme     ?? 'light',
      isDark:           tmpl?.cardTheme === 'dark',
      footerNote:       tmpl?.footerNote    ?? null,
      footerNoReply:    tmpl?.footerNoReply   ?? 'This is an automated message. Please do not reply.',
      footerNoReplyAr:  tmpl?.footerNoReplyAr ?? 'هذه رسالة آلية. يرجى عدم الرد عليها.',
      footerNoReplyText: tmpl?.footerNoReply  ?? 'This is an automated message. Please do not reply.',
      greeting:         tmpl?.greeting      ?? null,
      greetingAr:       tmpl?.greetingAr    ?? null,
      greetingText:     tmpl?.greeting      ?? null,
      isArabic:         false,
      // Sample data
      name:             'Fatima Al Rashidi',
      email:            'fatima@example.com',
      ref:              'PREVIEW1',
      slotDate:         'Thursday, 10 July 2026',
      slotTime:         '7:30 PM',
      tableNumber:      'Table 5',
      zone:             'Outdoor Terrace',
      partySize:        3, partySizePlural: true,
      graceMin:         20,
      hasPreOrder:      false,
      preOrderItems:    [],
      preOrderTotal:    '0.00',
      newAccount:       false,
      tempPassword:     null,
      loginUrl:         '/login',
      code:             '847291',
      expiresAt:        '9:30 PM',
      joinedAt:         'July 2026',
      menuUrl:          '/menu',
      isStaff:          false,
      cancelledByStaff: false,
      items:            [],
      total:            '0.00',
      cancelReason:     null,
    }
    // Render via mailer's handlebars compiler
    const templateMap: Record<string, string> = {
      booking_confirmation: 'booking-confirmation',
      booking_cancelled:    'booking-cancelled',
      order_cancelled:      'order-cancelled',
      otp:                  'otp',
      welcome:              'welcome',
    }
    const hbsKey = templateMap[key] ?? key
    // Use raw Handlebars compile from template file
    const fs = await import('fs/promises')
    const path = await import('path')
    const Handlebars = await import('handlebars')
    const tplPath = path.join(__dirname, '..', 'mail', 'templates', `${hbsKey}.hbs`)
    const src = await fs.readFile(tplPath, 'utf8')
    const compiled = Handlebars.default.compile(src)
    return compiled(ctx)
  }

  async update(dto: Partial<{
    restaurantName: string
    restaurantNameAr: string
    tagline: string
    taglineAr: string
    loginDesktopImage: string
    loginMobileImage: string
    heroConfig: Record<string, any>
    phone: string
    address: string
    logoUrl: string
    openTime: string
    closeTime: string
    weeklySchedule: Record<string, { open: boolean; shifts: { openTime: string; closeTime: string }[] }>
    timezone: string
    defaultCapacity: number
    vatRate: number
    currency: string
    defaultPrepTimeMins: number
    bookingsEnabled: boolean
    slotDurationMins: number
    peakHoursEnabled: boolean
    peakRanges: Array<{ start: string; end: string }>
    expectedDiningMins: number
    tableReleaseWindowMins: number
    sameDayCutoffMins: number
    noShowGracePeriodOffPeak: number
    noShowGracePeriodPeak: number
    maxBookingDaysAhead: number
    requireLoginToBook: boolean
    remindersEnabled: boolean
    reminderMinsBefore: number
    brandPreset: string
    brandColor: string
    showLanguageToggle: boolean
    vatNumber: string
    billConfig: Record<string, any>
    kdsEnabled: boolean
    thermalEnabled: boolean
    preOrderLeadMins: number
    thermalPrinterIp: string
    thermalPrinterPort: number
    kotConfig: Record<string, any>
    splitPaymentEnabled: boolean
    tipEnabled: boolean
    discountEnabled: boolean
    preOrderEnabled: boolean
    // Email config
    smtpHost: string; smtpPort: number; smtpSecure: boolean
    smtpUser: string; smtpPass: string
    emailFromName: string; emailFromAddress: string; emailReplyTo: string
    supportEmail: string; supportPhone: string
    socialLinks: Record<string, string>
  }>) {
    const current = await this.get()
    return this.prisma.restaurantSettings.update({
      where: { id: current.id },
      data: dto,
    })
  }
}
