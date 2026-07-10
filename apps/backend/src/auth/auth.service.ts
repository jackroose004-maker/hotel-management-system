import { Injectable, ConflictException, UnauthorizedException, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { MailService } from '../mail/mail.service'
import { OrdersGateway } from '../websocket/orders.gateway'
import { ActivityLogService } from '../activity-log/activity-log.service'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
    private gateway: OrdersGateway,
    private activityLog: ActivityLogService,
  ) {}

  async findOrCreateGoogleUser(profile: { googleId: string; email: string; name: string; avatar?: string }) {
    // Try by googleId first, then email (links existing account)
    let user = await this.prisma.user.findUnique({ where: { googleId: profile.googleId } })

    if (!user && profile.email) {
      user = await this.prisma.user.findUnique({ where: { email: profile.email } })
      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId: profile.googleId, avatarUrl: profile.avatar },
        })
      }
    }

    if (!user) {
      user = await this.prisma.user.create({
        data: { name: profile.name, email: profile.email, googleId: profile.googleId, avatarUrl: profile.avatar, role: 'CUSTOMER' },
      })
    }

    const { passwordHash: _, ...result } = user
    return { user: result, token: this.signToken(user.id, user.email, user.role) }
  }

  // Step 1: send OTP — creates an unverified User row (or refreshes the code)
  async checkEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { isVerified: true } })
    return { exists: !!user?.isVerified }
  }

  async sendOtp(email: string, name: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } })
    if (existing?.isVerified) throw new ConflictException('Email already in use')

    const code    = String(Math.floor(100000 + Math.random() * 900000))
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000)

    if (existing) {
      // Refresh code on the pending (unverified) row
      await this.prisma.user.update({ where: { email }, data: { otpCode: code, otpExpiry, name } })
    } else {
      await this.prisma.user.create({
        data: { name, email, isVerified: false, otpCode: code, otpExpiry, role: 'CUSTOMER' },
      })
    }

    try {
      await this.mail.sendOtp(email, name, code)
    } catch (err: any) {
      // Roll back the OTP we just wrote so the user can retry cleanly
      await this.prisma.user.update({ where: { email }, data: { otpCode: null, otpExpiry: null } })
      throw new InternalServerErrorException(
        err?.message?.includes('credentials') || err?.message?.includes('535')
          ? 'Email service is not configured. Contact the administrator.'
          : 'Failed to send verification email. Please try again.'
      )
    }
    return { message: 'OTP sent' }
  }

  // Step 2: verify OTP + set password → account is now active
  async register(dto: RegisterDto & { otp: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user || user.isVerified) throw new BadRequestException('Start verification first')
    if (user.otpCode !== dto.otp)  throw new BadRequestException('Invalid verification code')
    if (!user.otpExpiry || user.otpExpiry < new Date()) throw new BadRequestException('Verification code expired')

    const passwordHash = await bcrypt.hash(dto.password, 10)
    const updated = await this.prisma.user.update({
      where: { email: dto.email },
      data: { isVerified: true, passwordHash, otpCode: null, otpExpiry: null, name: dto.name, phone: dto.phone, role: 'CUSTOMER' },
    })

    this.mail.sendWelcome(updated.email, updated.name).catch(() => {})

    const { passwordHash: _, ...result } = updated
    return { user: result, token: this.signToken(updated.id, updated.email, updated.role) }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email }, include: { staffRole: true } })
    if (!user) throw new UnauthorizedException('Invalid credentials')

    if (!user.passwordHash) throw new UnauthorizedException('This account uses Google sign-in. Please continue with Google.')

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) {
      this.logger.warn(`Failed login attempt for ${dto.email}`)
      throw new UnauthorizedException('Invalid credentials')
    }

    if (!user.isVerified) throw new UnauthorizedException('Please verify your email first')

    const STAFF_ROLES = ['OWNER', 'STAFF']
    if (STAFF_ROLES.includes(user.role)) throw new UnauthorizedException('STAFF_PORTAL')

    if (!user.isActive) throw new UnauthorizedException('This account has been deactivated. Contact your manager.')

    this.logger.log(`Customer login: ${user.email} (${user.id})`)
    const { passwordHash: _, ...result } = user
    const token = this.signToken(user.id, user.email, user.role)
    // Owners and managers may use multiple devices simultaneously
    if (!['OWNER', 'MANAGER'].includes(user.role)) this.gateway.emitForceLogout(user.id)
    this.activityLog.log({ actorId: user.id, actorRole: user.role as any, action: 'LOGIN', entityType: 'User', entityId: user.id, after: { email: user.email, role: user.role } }).catch(() => {})
    return { user: result, token }
  }

  async staffLogin(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email }, include: { staffRole: true } })
    if (!user) throw new UnauthorizedException('Invalid credentials')
    if (!user.passwordHash) throw new UnauthorizedException('This account uses Google sign-in.')
    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) {
      this.logger.warn(`Failed staff login attempt for ${dto.email}`)
      this.activityLog.log({ action: 'LOGIN_FAILED', entityType: 'User', entityId: dto.email, after: { email: dto.email, reason: 'invalid_password' } }).catch(() => {})
      throw new UnauthorizedException('Invalid credentials')
    }
    const STAFF_ROLES = ['OWNER', 'STAFF']
    if (!STAFF_ROLES.includes(user.role)) throw new UnauthorizedException('No staff account found with this email.')
    if (!user.isActive) throw new UnauthorizedException('This account has been deactivated.')
    this.logger.log(`Staff login: ${user.email} role=${user.role} (${user.id})`)
    const { passwordHash: _, ...result } = user
    const token = this.signToken(user.id, user.email, user.role)
    // Owners and managers may use multiple devices simultaneously
    if (!['OWNER', 'MANAGER'].includes(user.role)) this.gateway.emitForceLogout(user.id)
    this.activityLog.log({ actorId: user.id, actorRole: user.role as any, action: 'STAFF_LOGIN', entityType: 'User', entityId: user.id, after: { email: user.email, role: user.role } }).catch(() => {})
    return { user: result, token, mustChangePassword: user.mustChangePassword ?? false }
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return null
    const { passwordHash: _, ...result } = user
    return result
  }

  async updateMe(userId: string, dto: { name?: string; phone?: string; dietaryTags?: string; notifOrderUpdates?: boolean; notifBookingReminders?: boolean; language?: string; avatarUrl?: string }) {
    if (dto.language !== undefined && !['en', 'ar'].includes(dto.language)) {
      throw new Error('Unsupported language')
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    })
    const { passwordHash: _, ...result } = user
    return result
  }

  async getFavorites(userId: string) {
    const favs = await this.prisma.userFavorite.findMany({
      where: { userId },
      include: { menuItem: true },
      orderBy: { createdAt: 'desc' },
    })
    return favs.map(f => f.menuItem)
  }

  async toggleFavorite(userId: string, menuItemId: string) {
    const existing = await this.prisma.userFavorite.findUnique({
      where: { userId_menuItemId: { userId, menuItemId } },
    })
    if (existing) {
      await this.prisma.userFavorite.delete({ where: { userId_menuItemId: { userId, menuItemId } } })
      return { action: 'removed', menuItemId }
    }
    await this.prisma.userFavorite.create({ data: { userId, menuItemId } })
    return { action: 'added', menuItemId }
  }

  // ── Password reset ────────────────────────────────────────────────────────

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    // Always return the same message — don't leak whether email exists
    const safe = { message: 'If that email is registered, a reset code has been sent.' }
    if (!user || !user.isVerified) return safe

    // Rate-limit: max 3 OTP requests per calendar day
    const MAX_DAILY = 5
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const sameDay = user.resetAttemptsDate && user.resetAttemptsDate >= today
    const attempts = sameDay ? user.resetAttemptsToday : 0
    if (attempts >= MAX_DAILY) {
      throw new BadRequestException(`Too many reset requests. Try again tomorrow.`)
    }

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expiry = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    await this.prisma.user.update({
      where: { email },
      data: {
        resetOtpCode: code,
        resetOtpExpiry: expiry,
        resetAttemptsToday: attempts + 1,
        resetAttemptsDate: new Date(),
      },
    })

    try {
      await this.mail.sendPasswordResetOtp(email, user.name, code, expiry)
    } catch (err: any) {
      await this.prisma.user.update({ where: { email }, data: { resetOtpCode: null, resetOtpExpiry: null, resetAttemptsToday: attempts } })
      throw new InternalServerErrorException(
        err?.message?.includes('credentials') || err?.message?.includes('535')
          ? 'Email service is not configured. Contact the administrator.'
          : 'Failed to send reset email. Please try again.'
      )
    }
    this.logger.log(`Password reset OTP sent → ${email} (attempt ${attempts + 1}/${MAX_DAILY})`)
    this.activityLog.log({ actorId: user.id, actorRole: user.role as any, action: 'PASSWORD_RESET_REQUESTED', entityType: 'User', entityId: user.id, after: { email, attempt: attempts + 1, maxPerDay: MAX_DAILY } }).catch(() => {})
    return safe
  }

  async verifyResetOtp(email: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || !user.resetOtpCode) throw new BadRequestException('No reset request found. Request a new code.')
    if (user.resetOtpCode !== code) {
      this.activityLog.log({ actorId: user.id, actorRole: user.role as any, action: 'PASSWORD_RESET_OTP_FAILED', entityType: 'User', entityId: user.id, after: { email, reason: 'invalid_code' } }).catch(() => {})
      throw new BadRequestException('Invalid code.')
    }
    if (!user.resetOtpExpiry || user.resetOtpExpiry < new Date()) {
      this.activityLog.log({ actorId: user.id, actorRole: user.role as any, action: 'PASSWORD_RESET_OTP_FAILED', entityType: 'User', entityId: user.id, after: { email, reason: 'expired' } }).catch(() => {})
      throw new BadRequestException('Code has expired. Request a new one.')
    }

    const resetToken = this.jwt.sign(
      { sub: user.id, email: user.email, purpose: 'password_reset' },
      { secret: this.config.get('JWT_SECRET'), expiresIn: '10m' },
    )
    await this.prisma.user.update({
      where: { email },
      data: { resetOtpCode: null, resetOtpExpiry: null },
    })
    this.activityLog.log({ actorId: user.id, actorRole: user.role as any, action: 'PASSWORD_RESET_OTP_VERIFIED', entityType: 'User', entityId: user.id, after: { email } }).catch(() => {})
    return { resetToken }
  }

  async resetPassword(resetToken: string, newPassword: string) {
    let payload: { sub: string; purpose: string }
    try {
      payload = this.jwt.verify(resetToken, { secret: this.config.get('JWT_SECRET') }) as any
    } catch {
      throw new BadRequestException('Reset session expired. Start over.')
    }
    if (payload.purpose !== 'password_reset') throw new BadRequestException('Invalid token.')

    if (newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters.')
    const current = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { passwordHash: true } })
    if (current?.passwordHash && await bcrypt.compare(newPassword, current.passwordHash)) {
      throw new BadRequestException('New password must be different from your current password.')
    }
    const passwordHash = await bcrypt.hash(newPassword, 10)
    const user = await this.prisma.user.update({
      where: { id: payload.sub },
      data: { passwordHash, resetOtpCode: null, resetOtpExpiry: null },
    })
    this.logger.log(`Password reset completed for user ${payload.sub}`)
    this.activityLog.log({ actorId: user.id, actorRole: user.role as any, action: 'PASSWORD_RESET_COMPLETED', entityType: 'User', entityId: user.id, after: { email: user.email } }).catch(() => {})
    return { message: 'Password updated. You can now log in.' }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (!currentPassword || !newPassword) throw new BadRequestException('Both current and new password are required.')
    if (newPassword.length < 8) throw new BadRequestException('New password must be at least 8 characters.')
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, email: true, role: true } })
    if (!user?.passwordHash) throw new BadRequestException('Account does not use password authentication.')
    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) throw new BadRequestException('Current password is incorrect.')
    if (await bcrypt.compare(newPassword, user.passwordHash)) throw new BadRequestException('New password must be different from your current password.')
    const passwordHash = await bcrypt.hash(newPassword, 10)
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } })
    this.activityLog.log({ actorId: userId, actorRole: user.role as any, action: 'PASSWORD_RESET_COMPLETED' as any, entityType: 'User', entityId: userId, after: { email: user.email } }).catch(() => {})
    return { message: 'Password changed successfully.' }
  }

  private signToken(sub: string, email: string, role: string) {
    return this.jwt.sign({ sub, email, role }, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRES_IN') || '7d',
    })
  }
}
