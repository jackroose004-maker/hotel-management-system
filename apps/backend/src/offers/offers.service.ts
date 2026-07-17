import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface OfferDto {
  name: string
  nameAr?: string
  scope: 'ALL' | 'CATEGORY' | 'ITEM'
  categoryIds?: string[]
  itemIds?: string[]
  type: 'PERCENT' | 'FIXED'
  value: number
  startsAt: string
  endsAt: string
  isActive?: boolean
  bannerText?: string
  bannerTextAr?: string
}

@Injectable()
export class OffersService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.offer.findMany({ orderBy: { startsAt: 'desc' } })
  }

  // Offers live right now — used by menu/order pricing and the guest banner
  async getActiveNow() {
    const now = new Date()
    return this.prisma.offer.findMany({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async create(dto: OfferDto) {
    this.validate(dto)
    return this.prisma.offer.create({
      data: {
        name: dto.name, nameAr: dto.nameAr,
        scope: dto.scope, categoryIds: dto.categoryIds ?? [], itemIds: dto.itemIds ?? [],
        type: dto.type, value: dto.value,
        startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt),
        isActive: dto.isActive ?? true,
        bannerText: dto.bannerText, bannerTextAr: dto.bannerTextAr,
      },
    })
  }

  async update(id: string, dto: Partial<OfferDto>) {
    const existing = await this.prisma.offer.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Offer not found')
    if (dto.type && dto.value !== undefined) this.validate(dto as OfferDto)
    return this.prisma.offer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
        ...(dto.categoryIds !== undefined ? { categoryIds: dto.categoryIds } : {}),
        ...(dto.itemIds !== undefined ? { itemIds: dto.itemIds } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: new Date(dto.startsAt) } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: new Date(dto.endsAt) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.bannerText !== undefined ? { bannerText: dto.bannerText } : {}),
        ...(dto.bannerTextAr !== undefined ? { bannerTextAr: dto.bannerTextAr } : {}),
      },
    })
  }

  async remove(id: string) {
    await this.prisma.offer.delete({ where: { id } }).catch(() => { throw new NotFoundException('Offer not found') })
    return { ok: true }
  }

  private validate(dto: OfferDto) {
    if (dto.type === 'PERCENT' && (dto.value <= 0 || dto.value > 100)) {
      throw new BadRequestException('Percent offers must be between 1 and 100')
    }
    if (dto.type === 'FIXED' && dto.value <= 0) {
      throw new BadRequestException('Fixed offers must be a positive amount')
    }
    if (dto.scope === 'CATEGORY' && !(dto.categoryIds?.length)) {
      throw new BadRequestException('Select at least one category')
    }
    if (dto.scope === 'ITEM' && !(dto.itemIds?.length)) {
      throw new BadRequestException('Select at least one item')
    }
    if (new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException('End date must be after start date')
    }
  }

  // Best matching offer for a given menu item (used at order-create time).
  // "Best" = greatest discount amount for that item's price; ties broken by most specific scope (ITEM > CATEGORY > ALL).
  static pickBestOffer(offers: Array<{ scope: string; categoryIds: string[]; itemIds: string[]; type: string; value: any; name: string }>, itemId: string, categoryId: string, price: number) {
    const specificity = (s: string) => (s === 'ITEM' ? 3 : s === 'CATEGORY' ? 2 : 1)
    const matching = offers.filter(o =>
      o.scope === 'ALL' ||
      (o.scope === 'CATEGORY' && o.categoryIds.includes(categoryId)) ||
      (o.scope === 'ITEM' && o.itemIds.includes(itemId))
    )
    if (!matching.length) return null
    const withAmount = matching.map(o => {
      const amount = o.type === 'PERCENT' ? Math.round(price * (Number(o.value) / 100) * 100) / 100 : Math.min(Number(o.value), price)
      return { offer: o, amount }
    })
    withAmount.sort((a, b) => b.amount - a.amount || specificity(b.offer.scope) - specificity(a.offer.scope))
    return withAmount[0]
  }
}
