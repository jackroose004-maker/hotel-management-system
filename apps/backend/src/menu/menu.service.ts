import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateCategoryDto } from './dto/create-category.dto'
import { CreateMenuItemDto, UpdateMenuItemDto } from './dto/create-menu-item.dto'

@Injectable()
export class MenuService {
  constructor(private prisma: PrismaService) {}

  getCategories() {
    return this.prisma.menuCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: { isAvailable: true },
          orderBy: { name: 'asc' },
          include: {
            modifierGroups: {
              orderBy: { sortOrder: 'asc' },
              include: { options: { orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
      },
    })
  }

  getAllCategories() {
    return this.prisma.menuCategory.findMany({ orderBy: { sortOrder: 'asc' } })
  }

  getAllItems(includeUnavailable = false) {
    return this.prisma.menuItem.findMany({
      where: includeUnavailable ? {} : { isAvailable: true },
      include: {
        category: true,
        modifierGroups: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
      },
      orderBy: { name: 'asc' },
    })
  }

  // ─── Modifier Groups ──────────────────────────────────────────────────────

  async createModifierGroup(menuItemId: string, data: { name: string; required?: boolean; minSelect?: number; maxSelect?: number }) {
    await this.findItemOrThrow(menuItemId)
    return this.prisma.menuModifierGroup.create({
      data: { menuItemId, name: data.name, required: data.required ?? false, minSelect: data.minSelect ?? 0, maxSelect: data.maxSelect ?? 1 },
      include: { options: true },
    })
  }

  async updateModifierGroup(id: string, data: { name?: string; required?: boolean; minSelect?: number; maxSelect?: number }) {
    return this.prisma.menuModifierGroup.update({ where: { id }, data, include: { options: true } })
  }

  async deleteModifierGroup(id: string) {
    return this.prisma.menuModifierGroup.delete({ where: { id } })
  }

  // ─── Modifier Options ─────────────────────────────────────────────────────

  async createModifierOption(groupId: string, data: { name: string; priceAdd?: number; isDefault?: boolean }) {
    return this.prisma.menuModifierOption.create({
      data: { groupId, name: data.name, priceAdd: data.priceAdd ?? 0, isDefault: data.isDefault ?? false },
    })
  }

  async updateModifierOption(id: string, data: { name?: string; priceAdd?: number; isDefault?: boolean }) {
    return this.prisma.menuModifierOption.update({ where: { id }, data })
  }

  async deleteModifierOption(id: string) {
    return this.prisma.menuModifierOption.delete({ where: { id } })
  }

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.menuCategory.create({ data: dto })
  }

  async reorderCategories(ids: string[]) {
    await Promise.all(ids.map((id, i) => this.prisma.menuCategory.update({ where: { id }, data: { sortOrder: i } })))
    return { ok: true }
  }

  createItem(dto: CreateMenuItemDto) {
    return this.prisma.menuItem.create({ data: dto })
  }

  async updateItem(id: string, dto: UpdateMenuItemDto) {
    await this.findItemOrThrow(id)
    return this.prisma.menuItem.update({ where: { id }, data: dto })
  }

  async toggleAvailability(id: string) {
    const item = await this.findItemOrThrow(id)
    return this.prisma.menuItem.update({
      where: { id },
      data: { isAvailable: !item.isAvailable },
    })
  }

  async deleteItem(id: string) {
    await this.findItemOrThrow(id)
    return this.prisma.menuItem.delete({ where: { id } })
  }

  private async findItemOrThrow(id: string) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } })
    if (!item) throw new NotFoundException('Menu item not found')
    return item
  }
}
