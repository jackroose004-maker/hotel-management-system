import { Injectable, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'

const STAFF_SELECT = {
  id: true, name: true, email: true, role: true,
  isActive: true, createdAt: true, avatarUrl: true,
  staffRoleId: true,
  staffRole: { select: { id: true, name: true, color: true, permissions: true } },
} as const

const ALLOWED_ROLES = ['STAFF']

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async listStaff() {
    return this.prisma.user.findMany({
      where: { role: { in: ['OWNER', 'STAFF'] } },
      select: STAFF_SELECT,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })
  }

  async createStaff(dto: { name: string; email: string; password: string; role: string }) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (exists) throw new ConflictException('Email already in use')
    if (!ALLOWED_ROLES.includes(dto.role)) throw new BadRequestException('Role must be STAFF')
    const passwordHash = await bcrypt.hash(dto.password, 10)
    return this.prisma.user.create({
      data: { name: dto.name, email: dto.email, passwordHash, role: dto.role as any, isVerified: true },
      select: STAFF_SELECT,
    })
  }

  async updateStaff(id: string, dto: { name?: string; role?: string; isActive?: boolean; password?: string; staffRoleId?: string | null }, requesterId: string) {
    const target = await this.prisma.user.findUnique({ where: { id } })
    if (!target) throw new BadRequestException('User not found')

    if (id === requesterId) {
      if (target.role !== 'OWNER') throw new ForbiddenException('Cannot modify your own account here')
      if (dto.role !== undefined || dto.isActive !== undefined) {
        throw new ForbiddenException('Cannot change your own role or status here')
      }
      const data: any = {}
      if (dto.name !== undefined) {
        const name = dto.name.trim()
        if (!name) throw new BadRequestException('Name is required')
        data.name = name
      }
      if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10)
      return this.prisma.user.update({ where: { id }, data, select: STAFF_SELECT })
    }

    if (target.role === 'OWNER') throw new ForbiddenException('Cannot modify owner accounts')

    const data: any = {}
    if (dto.name !== undefined) {
      const name = dto.name.trim()
      if (!name) throw new BadRequestException('Name is required')
      data.name = name
    }
    if (dto.role !== undefined) {
      if (!ALLOWED_ROLES.includes(dto.role)) throw new BadRequestException('Role must be STAFF')
      data.role = dto.role
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10)
    if ('staffRoleId' in dto) data.staffRoleId = dto.staffRoleId ?? null

    return this.prisma.user.update({ where: { id }, data, select: STAFF_SELECT })
  }

  async lookupByEmail(email: string) {
    if (!email) return null
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, phone: true, role: true, isVerified: true },
    })
    return user ?? null
  }

}
