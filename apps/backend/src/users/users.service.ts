import { Injectable, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../mail/mail.service'

import { ActivityLogService } from '../activity-log/activity-log.service'

const STAFF_SELECT = {
  id: true, name: true, email: true, role: true,
  isActive: true, createdAt: true, avatarUrl: true,
  staffRoleId: true, mustChangePassword: true,
  staffRole: { select: { id: true, name: true, color: true, permissions: true } },
} as const

const ALLOWED_ROLES = ['STAFF']

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private activityLog: ActivityLogService,
  ) {}

  async listStaff() {
    return this.prisma.user.findMany({
      where: { role: { in: ['OWNER', 'STAFF'] } },
      select: STAFF_SELECT,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })
  }

  async createStaff(
    dto: { name: string; email: string; password: string; role: string; staffRoleId?: string },
    actorId?: string,
  ) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (exists) throw new ConflictException('Email already in use')
    if (!ALLOWED_ROLES.includes(dto.role)) throw new BadRequestException('Role must be STAFF')

    const passwordHash = await bcrypt.hash(dto.password, 10)

    let staffRole: { name: string } | null = null
    if (dto.staffRoleId) {
      staffRole = await this.prisma.staffRole.findUnique({ where: { id: dto.staffRoleId }, select: { name: true } })
    }

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role as any,
        isVerified: true,
        mustChangePassword: true,
        staffRoleId: dto.staffRoleId ?? undefined,
      },
      select: STAFF_SELECT,
    })

    // Send welcome email (non-blocking)
    const loginUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/staff/login`
    this.mail.sendStaffWelcome(dto.email, dto.name, dto.password, staffRole?.name ?? null, loginUrl).catch(() => {})

    this.activityLog.log({
      actorId: actorId ?? undefined,
      actorRole: 'OWNER' as any,
      action: 'STAFF_CREATED' as any,
      entityType: 'User',
      entityId: user.id,
      after: { name: dto.name, email: dto.email, staffRoleId: dto.staffRoleId ?? null },
    }).catch(() => {})

    return user
  }

  async updateStaff(
    id: string,
    dto: { name?: string; email?: string; role?: string; isActive?: boolean; password?: string; staffRoleId?: string | null },
    requesterId: string,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id }, select: STAFF_SELECT })
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
    let newEmailTempPassword: string | null = null
    if (dto.email !== undefined && dto.email.trim() && dto.email.trim() !== target.email) {
      const newEmail = dto.email.trim().toLowerCase()
      const conflict = await this.prisma.user.findUnique({ where: { email: newEmail } })
      if (conflict) throw new ConflictException('That email is already in use')
      newEmailTempPassword = randomBytes(6).toString('hex') // 12-char hex temp password
      data.email = newEmail
      data.passwordHash = await bcrypt.hash(newEmailTempPassword, 10)
      data.mustChangePassword = true
    }
    if (dto.role !== undefined) {
      if (!ALLOWED_ROLES.includes(dto.role)) throw new BadRequestException('Role must be STAFF')
      data.role = dto.role
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10)
    if ('staffRoleId' in dto) data.staffRoleId = dto.staffRoleId ?? null

    const updated = await this.prisma.user.update({ where: { id }, data, select: STAFF_SELECT })

    // Send welcome email to new address if email was changed
    if (newEmailTempPassword && data.email) {
      const staffRole = updated.staffRole?.name ?? null
      const loginUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/staff/login`
      this.mail.sendStaffWelcome(data.email, updated.name, newEmailTempPassword, staffRole, loginUrl).catch(() => {})
    }

    // Determine action for activity log
    const action = dto.isActive === false ? 'STAFF_DEACTIVATED'
      : dto.isActive === true ? 'STAFF_REACTIVATED'
      : 'STAFF_UPDATED'

    this.activityLog.log({
      actorId: requesterId,
      actorRole: 'OWNER' as any,
      action: action as any,
      entityType: 'User',
      entityId: id,
      before: { name: target.name, isActive: target.isActive, staffRoleId: target.staffRoleId },
      after: { name: updated.name, isActive: updated.isActive, staffRoleId: updated.staffRoleId },
    }).catch(() => {})

    return updated
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
