import { Injectable, ConflictException, UnauthorizedException, BadRequestException, InternalServerErrorException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { MailService } from '../mail/mail.service'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
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
        data: { name: profile.name, email: profile.email, googleId: profile.googleId, avatarUrl: profile.avatar, role: 'USER' },
      })
    }

    const { passwordHash: _, ...result } = user
    return { user: result, token: this.signToken(user.id, user.email, user.role) }
  }

  // Step 1: send OTP — creates an unverified User row (or refreshes the code)
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
        data: { name, email, isVerified: false, otpCode: code, otpExpiry, role: 'GUEST' },
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
      data: { isVerified: true, passwordHash, otpCode: null, otpExpiry: null, name: dto.name, phone: dto.phone },
    })

    this.mail.sendWelcome(updated.email, updated.name).catch(() => {})

    const { passwordHash: _, ...result } = updated
    return { user: result, token: this.signToken(updated.id, updated.email, updated.role) }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user) throw new UnauthorizedException('Invalid credentials')

    if (!user.passwordHash) throw new UnauthorizedException('This account uses Google sign-in. Please continue with Google.')

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    if (!user.isVerified) throw new UnauthorizedException('Please verify your email first')

    const STAFF_ROLES = ['OWNER', 'MANAGER', 'KITCHEN', 'WAITER']
    if (STAFF_ROLES.includes(user.role)) throw new UnauthorizedException('STAFF_PORTAL')

    if (!user.isActive) throw new UnauthorizedException('This account has been deactivated. Contact your manager.')

    const { passwordHash: _, ...result } = user
    return { user: result, token: this.signToken(user.id, user.email, user.role) }
  }

  async staffLogin(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user) throw new UnauthorizedException('Invalid credentials')
    if (!user.passwordHash) throw new UnauthorizedException('This account uses Google sign-in.')
    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Invalid credentials')
    const STAFF_ROLES = ['OWNER', 'MANAGER', 'KITCHEN', 'WAITER']
    if (!STAFF_ROLES.includes(user.role)) throw new UnauthorizedException('No staff account found with this email.')
    if (!user.isActive) throw new UnauthorizedException('This account has been deactivated.')
    const { passwordHash: _, ...result } = user
    return { user: result, token: this.signToken(user.id, user.email, user.role) }
  }

  async updateMe(userId: string, dto: { name?: string; phone?: string; dietaryTags?: string; notifOrderUpdates?: boolean; notifBookingReminders?: boolean }) {
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

  private signToken(sub: string, email: string, role: string) {
    return this.jwt.sign({ sub, email, role }, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRES_IN') || '7d',
    })
  }
}
