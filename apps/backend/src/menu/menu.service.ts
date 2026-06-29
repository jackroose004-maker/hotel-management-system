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
      include: { items: { where: { isAvailable: true }, orderBy: { name: 'asc' } } },
    })
  }

  getAllItems(includeUnavailable = false) {
    return this.prisma.menuItem.findMany({
      where: includeUnavailable ? {} : { isAvailable: true },
      include: { category: true },
      orderBy: { name: 'asc' },
    })
  }

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.menuCategory.create({ data: dto })
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
