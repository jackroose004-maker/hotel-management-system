import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Permission } from '../common/permissions'

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.staffRole.findMany({ orderBy: { createdAt: 'asc' } })
  }

  async create(dto: { name: string; color?: string; permissions: Permission[] }) {
    const existing = await this.prisma.staffRole.findUnique({ where: { name: dto.name } })
    if (existing) throw new ConflictException(`Role "${dto.name}" already exists`)
    return this.prisma.staffRole.create({
      data: { name: dto.name, color: dto.color ?? '#6b7280', permissions: dto.permissions },
    })
  }

  async update(id: string, dto: { name?: string; color?: string; permissions?: Permission[] }) {
    await this.findOne(id)
    return this.prisma.staffRole.update({ where: { id }, data: dto })
  }

  async remove(id: string) {
    const role = await this.findOne(id)
    if (role.isSystem) throw new ConflictException('Cannot delete a system role')
    // Unassign role from all users first
    await this.prisma.user.updateMany({ where: { staffRoleId: id }, data: { staffRoleId: null } })
    return this.prisma.staffRole.delete({ where: { id } })
  }

  async assignToUser(userId: string, staffRoleId: string | null) {
    if (staffRoleId) await this.findOne(staffRoleId)
    return this.prisma.user.update({
      where: { id: userId },
      data: { staffRoleId },
      include: { staffRole: true },
    })
  }

  private async findOne(id: string) {
    const role = await this.prisma.staffRole.findUnique({ where: { id } })
    if (!role) throw new NotFoundException('Role not found')
    return role
  }
}
