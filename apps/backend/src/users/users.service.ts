import { Injectable, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async listStaff() {
    const users = await this.prisma.user.findMany({
      where: { role: { in: ['OWNER', 'MANAGER', 'STAFF'] } },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, avatarUrl: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })
    return users
  }

  async createStaff(dto: { name: string; email: string; password: string; role: string }) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (exists) throw new ConflictException('Email already in use')

    if (!['MANAGER', 'STAFF'].includes(dto.role)) throw new BadRequestException('Role must be MANAGER or STAFF')

    const passwordHash = await bcrypt.hash(dto.password, 10)
    const user = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, passwordHash, role: dto.role as any },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, avatarUrl: true },
    })
    return user
  }

  async updateStaff(id: string, dto: { name?: string; role?: string; isActive?: boolean; password?: string }, requesterId: string) {
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

      const user = await this.prisma.user.update({
        where: { id },
        data,
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, avatarUrl: true },
      })
      return user
    }

    if (target.role === 'OWNER') throw new ForbiddenException('Cannot modify owner accounts')

    const data: any = {}
    if (dto.name !== undefined) {
      const name = dto.name.trim()
      if (!name) throw new BadRequestException('Name is required')
      data.name = name
    }
    if (dto.role !== undefined) {
      if (!['MANAGER', 'STAFF'].includes(dto.role)) throw new BadRequestException('Role must be MANAGER or STAFF')
      data.role = dto.role
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10)

    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, avatarUrl: true },
    })
    return user
  }
}
