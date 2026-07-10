import { Injectable, Logger } from '@nestjs/common'
import { MailerService } from '@nestjs-modules/mailer'
import { PrismaService } from '../prisma/prisma.service'
import { BookingTicketService } from '../pdf/booking-ticket.service'

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)

  constructor(
    private mailer: MailerService,
    private prisma: PrismaService,
    private pdf: BookingTicketService,
  ) {}

  // ── Shared brand context ──────────────────────────────────────────────────

  private async brand() {
    const s = await this.prisma.restaurantSettings.findFirst()
    const social = (s?.socialLinks ?? {}) as Record<string, string>
    return {
      restaurantName:   s?.restaurantName   ?? 'Al Manzil',
      brandColor:       s?.brandColor       ?? '#c0392b',
      brandColorDark:   s?.brandColor       ? this.darken(s.brandColor) : '#922b21',
      logoUrl:          s?.logoUrl          ?? undefined,
      year:             new Date().getFullYear(),
      supportEmail:     s?.supportEmail     ?? null,
      supportPhone:     s?.supportPhone     ?? null,
      // Social links — only pass keys that are set
      socialInstagram:  social.instagram    ?? null,
      socialWhatsapp:   social.whatsapp     ?? null,
      socialTelegram:   social.telegram     ?? null,
      socialTiktok:     social.tiktok       ?? null,
      socialFacebook:   social.facebook     ?? null,
      socialTwitter:    social.twitter      ?? null,
      hasSocial: Object.keys(social).length > 0,
      _settings: s,
    }
  }

  // ── Fetch template config and merge with global ────────────────────────────

  private async tpl(key: string) {
    const [s, tmpl] = await Promise.all([
      this.prisma.restaurantSettings.findFirst(),
      this.prisma.emailTemplate.findUnique({ where: { key } }),
    ])
    const social = (s?.socialLinks ?? {}) as Record<string, string>

    const fromName    = tmpl?.fromName    ?? s?.emailFromName    ?? s?.restaurantName ?? 'Al Manzil'
    const fromAddr    = s?.emailFromAddress ?? s?.smtpUser ?? undefined
    const replyTo     = tmpl?.replyTo     ?? s?.emailReplyTo     ?? undefined
    const bgColor     = tmpl?.bgColor     ?? '#f0f0f0'
    const cardTheme   = tmpl?.cardTheme   ?? 'light'
    const footerNote  = tmpl?.footerNote  ?? null
    const enabled     = tmpl?.enabled     ?? true
    const footerNoReply   = tmpl?.footerNoReply   ?? 'This is an automated message. Please do not reply.'
    const footerNoReplyAr = tmpl?.footerNoReplyAr ?? 'هذه رسالة آلية. يرجى عدم الرد عليها.'
    const greeting        = tmpl?.greeting        ?? null
    const greetingAr      = tmpl?.greetingAr      ?? null

    const base = {
      restaurantName:   s?.restaurantName   ?? 'Al Manzil',
      brandColor:       s?.brandColor       ?? '#c0392b',
      brandColorDark:   s?.brandColor       ? this.darken(s.brandColor) : '#922b21',
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
      bgColor,
      cardTheme,
      isDark:           cardTheme === 'dark',
      footerNote,
      footerNoReply,
      footerNoReplyAr,
      greeting,
      greetingAr,
    }

    return { base, tmpl, enabled, fromName, fromAddr, replyTo, subject: tmpl?.subject ?? '', _settings: s }
  }

  private buildFrom(fromName: string, fromAddr: string | undefined) {
    const addr = fromAddr ?? process.env.MAIL_USER
    if (!addr) return undefined
    return `"${fromName}" <${addr}>`
  }

  private resolveSubject(template: string, vars: Record<string, string>) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
  }

  private darken(hex: string): string {
    const n = parseInt(hex.replace('#', ''), 16)
    const r = Math.max(0, (n >> 16) - 40)
    const g = Math.max(0, ((n >> 8) & 0xff) - 40)
    const b = Math.max(0, (n & 0xff) - 40)
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
  }

  private localeTag(language?: string) {
    return language === 'ar' ? 'ar-AE' : 'en-AE'
  }

  private isAr(language?: string | null) {
    return language === 'ar'
  }

  private formatBookingContext(booking: any, base: any, settings: any) {
    const locale = this.localeTag(booking.customer?.language ?? booking.language)
    const ref = booking.id.slice(-8).toUpperCase()
    const slotDate = new Date(booking.slotDate).toLocaleDateString(locale, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    const [h, m] = booking.slotTime.split(':').map(Number)
    const slotTime = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
    const graceMin = settings?.noShowGracePeriodOffPeak ?? 20
    const tableNumber = booking.table?.tableNumber ? `Table ${booking.table.tableNumber}` : 'TBD'
    const zone = booking.seatingPreference ?? booking.table?.zone ?? 'Indoor'

    const preOrders: any[] = booking.preOrders ?? []
    const activePreOrder = preOrders.find((o: any) => o.status === 'PRE_ORDER')
    const hasPreOrder = !!activePreOrder
    const preOrderItems = hasPreOrder
      ? (activePreOrder.items ?? []).map((i: any) => ({
          name: i.menuItem?.name ?? i.name ?? 'Item',
          qty: i.quantity,
          amount: (Number(i.unitPrice) * i.quantity).toFixed(2),
          modifiers: (i.modifiers ?? []).map((m: any) => ({ name: m.name, priceAdd: Number(m.priceAdd).toFixed(2) })),
        }))
      : []
    const preOrderTotal = hasPreOrder
      ? preOrders
          .filter((o: any) => o.status === 'PRE_ORDER')
          .reduce((s: number, o: any) => s + Number(o.total), 0)
          .toFixed(2)
      : '0.00'

    return { ref, slotDate, slotTime, graceMin, tableNumber, zone, hasPreOrder, preOrderItems, preOrderTotal }
  }

  // ── Public send methods ───────────────────────────────────────────────────

  async sendOtp(to: string, name: string, code: string, language?: string) {
    const { base, enabled, fromName, fromAddr, replyTo, subject } = await this.tpl('otp')
    if (!enabled) return
    const isArabic = this.isAr(language)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toLocaleTimeString(this.localeTag(language), { hour: '2-digit', minute: '2-digit', hour12: true })
    const resolvedSubject = this.resolveSubject(subject || `Your {{restaurantName}} verification code`, { restaurantName: base.restaurantName })
    try {
      await this.mailer.sendMail({
        to, subject: resolvedSubject,
        from: this.buildFrom(fromName, fromAddr),
        replyTo,
        template: 'otp',
        context: { ...base, isArabic, footerNoReplyText: isArabic ? base.footerNoReplyAr : base.footerNoReply, name, code, expiresAt },
      })
    } catch (err: any) {
      this.logger.error(`OTP email failed → ${to}: ${err?.message}`)
    }
  }

  async sendPasswordResetOtp(to: string, name: string, code: string, expiry: Date) {
    const { base, enabled, fromName, fromAddr, replyTo } = await this.tpl('otp')
    if (!enabled) return
    const expiresAt = expiry.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
    try {
      await Promise.resolve().then(() => this.mailer.sendMail({
        to,
        subject: `Password reset code — ${base.restaurantName}`,
        from: this.buildFrom(fromName, fromAddr),
        replyTo,
        template: 'password-reset',
        context: { ...base, isArabic: false, footerNoReplyText: base.footerNoReply, name, code, expiresAt },
      }))
      this.logger.log(`Password reset OTP email → ${to}`)
    } catch (err: any) {
      this.logger.error(`Password reset OTP email failed → ${to}: ${err?.message}`)
      throw new Error('Failed to send reset email. Please try again.')
    }
  }

  async sendWelcome(to: string, name: string) {
    const { base, enabled, fromName, fromAddr, replyTo, subject } = await this.tpl('welcome')
    if (!enabled) return
    const joinedAt = new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })
    const resolvedSubject = this.resolveSubject(subject || `Welcome to {{restaurantName}} 🎉`, { restaurantName: base.restaurantName })
    try {
      await this.mailer.sendMail({
        to, subject: resolvedSubject,
        from: this.buildFrom(fromName, fromAddr),
        replyTo,
        template: 'welcome',
        context: { ...base, name, email: to, joinedAt, menuUrl: '/menu' },
      })
    } catch (err: any) {
      this.logger.error(`Welcome email failed → ${to}: ${err?.message}`)
    }
  }

  async sendOrderCancellation(to: string, name: string, order: any, cancelledByStaff = false) {
    const { base, enabled, fromName, fromAddr, replyTo, subject } = await this.tpl('order_cancelled')
    if (!enabled) return
    const ref = order.id.slice(-8).toUpperCase()
    const items = (order.items ?? []).map((i: any) => ({
      name: i.menuItem?.name ?? 'Item',
      quantity: i.quantity,
      amount: (Number(i.unitPrice) * i.quantity).toFixed(2),
    }))
    const resolvedSubject = this.resolveSubject(subject || `Your order #{{ref}} has been cancelled — {{restaurantName}}`, { ref, restaurantName: base.restaurantName })
    try {
      await this.mailer.sendMail({
        to, subject: resolvedSubject,
        from: this.buildFrom(fromName, fromAddr),
        replyTo,
        template: 'order-cancelled',
        context: { ...base, isArabic: false, footerNoReplyText: base.footerNoReply, name, ref, items, total: Number(order.total).toFixed(2), cancelReason: order.cancelReason ?? null, cancelledByStaff },
      })
      this.logger.log(`Order cancellation email → ${to} (ref: ${ref})`)
    } catch (err: any) {
      this.logger.error(`Order cancellation email failed → ${to}: ${err?.message}`)
    }
  }

  async sendStaffWelcome(to: string, name: string, tempPassword: string, roleName: string | null, loginUrl: string) {
    const { base, enabled, fromName, fromAddr, replyTo, subject } = await this.tpl('staff_welcome')
    if (!enabled) return
    const resolvedSubject = this.resolveSubject(subject || `Welcome to {{restaurantName}} — Your Staff Account`, { restaurantName: base.restaurantName })
    try {
      await this.mailer.sendMail({
        to,
        subject: resolvedSubject,
        from: this.buildFrom(fromName, fromAddr),
        replyTo,
        template: 'staff-welcome',
        context: { ...base, footerNoReplyText: base.footerNoReply, name, email: to, tempPassword, roleName, loginUrl, year: new Date().getFullYear() },
      })
      this.logger.log(`Staff welcome email → ${to}`)
    } catch (err: any) {
      this.logger.error(`Staff welcome email failed → ${to}: ${err?.message}`)
    }
  }

  async sendBookingCancellation(to: string, name: string, details: { ref: string; slotDate: string; slotTime: string; isStaff: boolean }) {
    const { base, enabled, fromName, fromAddr, replyTo, subject } = await this.tpl('booking_cancelled')
    if (!enabled) return
    const resolvedSubject = this.resolveSubject(subject || `Your booking at {{restaurantName}} has been cancelled — Ref #{{ref}}`, { restaurantName: base.restaurantName, ref: details.ref })
    try {
      await this.mailer.sendMail({
        to, subject: resolvedSubject,
        from: this.buildFrom(fromName, fromAddr),
        replyTo,
        template: 'booking-cancelled',
        context: { ...base, isArabic: false, footerNoReplyText: base.footerNoReply, name, ...details },
      })
      this.logger.log(`Booking cancellation email → ${to} (ref: ${details.ref}, byStaff: ${details.isStaff})`)
    } catch (err: any) {
      this.logger.error(`Booking cancellation email failed → ${to}: ${err?.message}`)
    }
  }

  async sendStaffBookingCancellationAlert(details: { ref: string; guestName: string; guestEmail: string; slotDate: string; slotTime: string }) {
    const base = await this.brand()
    const supportEmail = base.supportEmail
    if (!supportEmail) return
    const subject = `⚠️ Booking Cancelled by Guest — Ref #${details.ref}`
    try {
      await this.mailer.sendMail({
        to: supportEmail,
        subject,
        from: this.buildFrom(base.restaurantName, undefined),
        html: `<p>A guest has cancelled their booking.</p>
          <ul>
            <li><strong>Ref:</strong> #${details.ref}</li>
            <li><strong>Guest:</strong> ${details.guestName} (${details.guestEmail})</li>
            <li><strong>Date:</strong> ${details.slotDate}</li>
            <li><strong>Time:</strong> ${details.slotTime}</li>
          </ul>
          <p>If a pre-order was paid, it has been flagged for refund and will appear in Pending Refunds.</p>`,
      })
      this.logger.log(`Staff booking-cancel alert → ${supportEmail} (ref: ${details.ref})`)
    } catch (err: any) {
      this.logger.error(`Staff cancel alert failed: ${err?.message}`)
    }
  }

  async sendCombinedBookingConfirmation(bookingId: string, tempPassword?: string) {
    const { base, enabled, fromName, fromAddr, replyTo, subject, _settings } = await this.tpl('booking_confirmation')
    if (!enabled) return
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          table: true,
          customer: { select: { name: true, email: true, language: true } },
          preOrders: { where: { status: 'PRE_ORDER' }, include: { items: { include: { menuItem: true, modifiers: true } } } },
        },
      })
      if (!booking?.customer?.email) return

      const { ref, slotDate, slotTime, graceMin, tableNumber, zone, hasPreOrder, preOrderItems, preOrderTotal } =
        this.formatBookingContext(booking, base, _settings)

      const isNewAccount = !!tempPassword
      const resolvedSubject = this.resolveSubject(
        isNewAccount
          ? `Your reservation at {{restaurantName}} — account created`
          : hasPreOrder
            ? `Booking confirmed + pre-order received — {{restaurantName}}`
            : (subject || `Your table at {{restaurantName}} is confirmed — {{slotDate}}`),
        { restaurantName: base.restaurantName, slotDate, ref },
      )

      let pdfBuffer: Buffer | undefined
      try {
        pdfBuffer = await this.pdf.generateBookingTicket({
          ref,
          guestName: booking.customer.name, slotDate, slotTime, tableNumber, zone,
          partySize: booking.partySize, graceMin,
          brandColor: base.brandColor, restaurantName: base.restaurantName, logoUrl: base.logoUrl,
          hasPreOrder, preOrderItems, preOrderTotal,
          // QR encodes the booking UUID so staff-checkin endpoint can look it up directly
          frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
          qrRef: bookingId,
        })
      } catch (pdfErr: any) {
        this.logger.warn(`PDF generation failed for booking ${bookingId}: ${pdfErr?.message}`)
      }

      const isArabic = this.isAr(booking.customer.language)
      const msg: any = {
        to: booking.customer.email,
        subject: resolvedSubject,
        from: this.buildFrom(fromName, fromAddr),
        replyTo,
        template: 'booking-confirmation',
        context: {
          ...base,
          isArabic,
          footerNoReplyText: isArabic ? base.footerNoReplyAr : base.footerNoReply,
          greetingText: isArabic && base.greetingAr ? base.greetingAr : base.greeting,
          name: booking.customer.name,
          email: booking.customer.email,
          ref, slotDate, slotTime, tableNumber, zone,
          partySize: booking.partySize, partySizePlural: booking.partySize !== 1,
          graceMin, hasPreOrder, preOrderItems, preOrderTotal,
          newAccount: isNewAccount,
          tempPassword: tempPassword ?? null,
          loginUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login`,
        },
      }
      if (pdfBuffer) {
        const filename = `${base.restaurantName.replace(/\s+/g, '-')}-Booking-${ref}.png`
        msg.attachments = [{ filename, content: pdfBuffer, contentType: 'image/png' }]
      }

      await this.mailer.sendMail(msg)
      this.logger.log(`Booking confirmation sent → ${booking.customer.email} (ref: ${ref}, newAccount: ${isNewAccount}, hasPreOrder: ${hasPreOrder})`)
    } catch (err: any) {
      this.logger.error(`Combined booking confirmation failed for ${bookingId}: ${err?.message}`, err?.stack)
    }
  }

  // Used by settings to send a test email
  async sendTestEmail(to: string, templateKey: string) {
    const { base, enabled, fromName, fromAddr, replyTo } = await this.tpl(templateKey)
    const sampleCtx = {
      ...base,
      name: 'Test User',
      ref: 'TESTABCD',
      slotDate: 'Thursday, 10 July 2026',
      slotTime: '7:00 PM',
      tableNumber: 'Table 5',
      zone: 'Indoor',
      partySize: 2, partySizePlural: true,
      graceMin: 20,
      hasPreOrder: false, preOrderItems: [], preOrderTotal: '0.00',
      newAccount: false, tempPassword: null, loginUrl: '/login',
      code: '123456', expiresAt: '9:30 PM',
      email: to, joinedAt: 'July 2026', menuUrl: '/menu',
      isStaff: false,
    }
    const templateMap: Record<string, string> = {
      booking_confirmation: 'booking-confirmation',
      booking_cancelled:    'booking-cancelled',
      order_cancelled:      'order-cancelled',
      otp:                  'otp',
      welcome:              'welcome',
    }
    const hbsTemplate = templateMap[templateKey] ?? templateKey
    try {
      await this.mailer.sendMail({
        to, subject: `[TEST] ${templateKey} — ${base.restaurantName}`,
        from: this.buildFrom(fromName, fromAddr),
        replyTo,
        template: hbsTemplate,
        context: sampleCtx,
      })
      this.logger.log(`Test email (${templateKey}) → ${to}`)
      return { ok: true }
    } catch (err: any) {
      this.logger.error(`Test email failed: ${err?.message}`)
      throw err
    }
  }

  // Used by the settings preview endpoint to render a template to HTML
  async previewTemplate(templateKey: string) {
    const { base } = await this.tpl(templateKey)
    return base
  }
}
