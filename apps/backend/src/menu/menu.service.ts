import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateCategoryDto } from './dto/create-category.dto'
import { CreateMenuItemDto, UpdateMenuItemDto } from './dto/create-menu-item.dto'

@Injectable()
export class MenuService {
  constructor(private prisma: PrismaService) {}

  private readonly itemInclude = {
    modifierGroups: {
      orderBy: { sortOrder: 'asc' as const },
      include: { options: { orderBy: { sortOrder: 'asc' as const } } },
    },
  }

  /** Lightweight category list — no nested items (fast initial load). */
  getCategories() {
    return this.prisma.menuCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        nameAr: true,
        sortOrder: true,
        _count: { select: { items: { where: { isAvailable: true } } } },
      },
    }).then(cats =>
      cats.map(({ _count, ...cat }) => ({ ...cat, itemCount: _count.items })),
    )
  }

  /** Cursor-paginated items for one category (infinite scroll). */
  async getCategoryItems(categoryId: string, cursor?: string, limit = 12) {
    const category = await this.prisma.menuCategory.findFirst({
      where: { id: categoryId, isActive: true },
    })
    if (!category) throw new NotFoundException('Category not found')

    const take = Math.min(Math.max(limit, 1), 50)
    const items = await this.prisma.menuItem.findMany({
      where: { categoryId, isAvailable: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: this.itemInclude,
    })

    const hasMore = items.length > take
    const page = hasMore ? items.slice(0, take) : items
    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    }
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
    // Generate a slug ID from the name so it's consistent with seeded categories (e.g. "Falooda" → "falooda")
    const id = dto.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    return this.prisma.menuCategory.create({ data: { id, ...dto } })
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

  getItem(id: string) {
    return this.prisma.menuItem.findUniqueOrThrow({
      where: { id },
      include: { modifierGroups: { include: { options: true } } },
    })
  }

  private async findItemOrThrow(id: string) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } })
    if (!item) throw new NotFoundException('Menu item not found')
    return item
  }
}
