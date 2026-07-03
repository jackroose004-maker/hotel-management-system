import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
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

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (exists) throw new ConflictException('Email already in use')

    const passwordHash = await bcrypt.hash(dto.password, 10)
    const user = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, passwordHash, role: dto.role ?? 'GUEST', phone: dto.phone },
    })

    const { passwordHash: _, ...result } = user
    return { user: result, token: this.signToken(user.id, user.email, user.role) }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user) throw new UnauthorizedException('Invalid credentials')

    if (!user.passwordHash) throw new UnauthorizedException('This account uses Google sign-in. Please continue with Google.')

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    if (!user.isActive) throw new UnauthorizedException('This account has been deactivated. Contact your manager.')

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
