import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import * as XLSX from 'xlsx'

export interface ImportRow {
  category: string
  categoryAr?: string
  itemName: string
  itemNameAr?: string
  description?: string
  descriptionAr?: string
  price: number
  prepTimeMins: number
  imageUrl?: string
  videoUrl?: string
  groupName?: string
  groupNameAr?: string
  groupRequired?: boolean
  groupMinSelect?: number
  groupMaxSelect?: number
  optionName?: string
  optionNameAr?: string
  optionPriceAdd?: number
  optionIsDefault?: boolean
}

export interface ImportPreview {
  rows: ImportRow[]
  summary: {
    categories: number
    items: number
    groups: number
    options: number
    errors: string[]
  }
}

const TEMPLATE_HEADERS = [
  'category', 'category_ar', 'item_name', 'item_name_ar',
  'description', 'description_ar', 'price', 'prep_time_mins',
  'image_url', 'video_url',
  'group_name', 'group_name_ar', 'group_required', 'group_min_select', 'group_max_select',
  'option_name', 'option_name_ar', 'option_price_add', 'option_is_default',
]

function normalise(val: unknown): string {
  if (val === null || val === undefined) return ''
  return String(val).trim()
}

function toBool(val: unknown): boolean {
  const s = normalise(val).toLowerCase()
  return s === 'true' || s === '1' || s === 'yes'
}

function toNum(val: unknown, fallback = 0): number {
  const n = Number(val)
  return isFinite(n) ? n : fallback
}

@Injectable()
export class MenuImportService {
  constructor(private prisma: PrismaService) {}

  parseFile(buffer: Buffer, mimetype: string): ImportPreview {
    let workbook: XLSX.WorkBook
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' })
    } catch {
      throw new BadRequestException('Could not parse file. Upload a valid .xlsx or .csv file.')
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    if (!raw.length) throw new BadRequestException('Sheet is empty.')

    const errors: string[] = []
    const rows: ImportRow[] = []

    raw.forEach((r, idx) => {
      const lineNum = idx + 2
      const category = normalise(r['category'] ?? r['Category'])
      const itemName = normalise(r['item_name'] ?? r['Item Name'] ?? r['name'] ?? r['Name'])
      const price = toNum(r['price'] ?? r['Price'])

      if (!category) { errors.push(`Row ${lineNum}: missing category`); return }
      if (!itemName) { errors.push(`Row ${lineNum}: missing item_name`); return }
      if (price <= 0) { errors.push(`Row ${lineNum}: price must be > 0 (got "${r['price']}")`); return }

      rows.push({
        category,
        categoryAr:       normalise(r['category_ar'] ?? r['Category AR']) || undefined,
        itemName,
        itemNameAr:       normalise(r['item_name_ar'] ?? r['Item Name AR']) || undefined,
        description:      normalise(r['description'] ?? r['Description']) || undefined,
        descriptionAr:    normalise(r['description_ar'] ?? r['Description AR']) || undefined,
        price,
        prepTimeMins:     toNum(r['prep_time_mins'] ?? r['Prep Time (mins)'], 15),
        imageUrl:         normalise(r['image_url'] ?? r['Image URL']) || undefined,
        videoUrl:         normalise(r['video_url'] ?? r['Video URL']) || undefined,
        groupName:        normalise(r['group_name'] ?? r['Group Name']) || undefined,
        groupNameAr:      normalise(r['group_name_ar'] ?? r['Group Name AR']) || undefined,
        groupRequired:    toBool(r['group_required'] ?? r['Group Required']),
        groupMinSelect:   toNum(r['group_min_select'] ?? r['Group Min Select'], 0),
        groupMaxSelect:   toNum(r['group_max_select'] ?? r['Group Max Select'], 1),
        optionName:       normalise(r['option_name'] ?? r['Option Name']) || undefined,
        optionNameAr:     normalise(r['option_name_ar'] ?? r['Option Name AR']) || undefined,
        optionPriceAdd:   toNum(r['option_price_add'] ?? r['Option Price Add'], 0),
        optionIsDefault:  toBool(r['option_is_default'] ?? r['Option Is Default']),
      })
    })

    const catSet  = new Set(rows.map(r => r.category))
    const itemSet = new Set(rows.map(r => `${r.category}|${r.itemName}`))
    const grpSet  = new Set(rows.filter(r => r.groupName).map(r => `${r.category}|${r.itemName}|${r.groupName}`))
    const optCnt  = rows.filter(r => r.optionName).length

    return {
      rows,
      summary: {
        categories: catSet.size,
        items: itemSet.size,
        groups: grpSet.size,
        options: optCnt,
        errors,
      },
    }
  }

  async bulkImport(rows: ImportRow[], mode: 'merge' | 'replace' = 'merge') {
    return this.prisma.$transaction(async (tx) => {
      const catCache  = new Map<string, string>()  // name → id
      const itemCache = new Map<string, string>()  // `cat|item` → id
      const grpCache  = new Map<string, string>()  // `cat|item|group` → id

      let catSortOrder = await tx.menuCategory.count()

      for (const row of rows) {
        // ── Category ──
        let catId = catCache.get(row.category)
        if (!catId) {
          const existing = await tx.menuCategory.findFirst({ where: { name: row.category } })
          if (existing) {
            catId = existing.id
          } else {
            const created = await tx.menuCategory.create({
              data: { name: row.category, nameAr: row.categoryAr, sortOrder: catSortOrder++ },
            })
            catId = created.id
          }
          catCache.set(row.category, catId)
        }

        // ── MenuItem ──
        const itemKey = `${row.category}|${row.itemName}`
        let itemId = itemCache.get(itemKey)
        if (!itemId) {
          const existing = await tx.menuItem.findFirst({
            where: { categoryId: catId, name: row.itemName },
          })
          if (existing) {
            if (mode === 'replace') {
              await tx.menuItem.update({
                where: { id: existing.id },
                data: {
                  nameAr: row.itemNameAr,
                  description: row.description,
                  descriptionAr: row.descriptionAr,
                  price: row.price,
                  prepTimeMins: row.prepTimeMins,
                  imageUrl: row.imageUrl,
                  videoUrl: row.videoUrl,
                },
              })
            }
            itemId = existing.id
          } else {
            const created = await tx.menuItem.create({
              data: {
                categoryId: catId,
                name: row.itemName,
                nameAr: row.itemNameAr,
                description: row.description,
                descriptionAr: row.descriptionAr,
                price: row.price,
                prepTimeMins: row.prepTimeMins,
                imageUrl: row.imageUrl,
                videoUrl: row.videoUrl,
              },
            })
            itemId = created.id
          }
          itemCache.set(itemKey, itemId)
        }

        // ── Modifier Group ──
        if (!row.groupName) continue
        const grpKey = `${row.category}|${row.itemName}|${row.groupName}`
        let grpId = grpCache.get(grpKey)
        if (!grpId) {
          const existing = await tx.menuModifierGroup.findFirst({
            where: { menuItemId: itemId, name: row.groupName },
          })
          if (existing) {
            grpId = existing.id
          } else {
            const grpCount = await tx.menuModifierGroup.count({ where: { menuItemId: itemId } })
            const created = await tx.menuModifierGroup.create({
              data: {
                menuItemId: itemId,
                name: row.groupName,
                nameAr: row.groupNameAr,
                required: row.groupRequired ?? false,
                minSelect: row.groupMinSelect ?? 0,
                maxSelect: row.groupMaxSelect ?? 1,
                sortOrder: grpCount,
              },
            })
            grpId = created.id
          }
          grpCache.set(grpKey, grpId)
        }

        // ── Modifier Option ──
        if (!row.optionName) continue
        const optExists = await tx.menuModifierOption.findFirst({
          where: { groupId: grpId, name: row.optionName },
        })
        if (!optExists) {
          const optCount = await tx.menuModifierOption.count({ where: { groupId: grpId } })
          await tx.menuModifierOption.create({
            data: {
              groupId: grpId,
              name: row.optionName,
              nameAr: row.optionNameAr,
              priceAdd: row.optionPriceAdd ?? 0,
              isDefault: row.optionIsDefault ?? false,
              sortOrder: optCount,
            },
          })
        }
      }

      return {
        imported: {
          categories: catCache.size,
          items: itemCache.size,
          groups: grpCache.size,
          options: rows.filter(r => r.optionName).length,
        },
      }
    }, { timeout: 30000 })
  }

  async exportToXlsx(): Promise<Buffer> {
    const categories = await this.prisma.menuCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            modifierGroups: {
              orderBy: { sortOrder: 'asc' },
              include: { options: { orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
      },
    })

    const sheetRows: Record<string, unknown>[] = []

    for (const cat of categories) {
      for (const item of cat.items) {
        const baseRow = {
          category:         cat.name,
          category_ar:      cat.nameAr ?? '',
          item_name:        item.name,
          item_name_ar:     item.nameAr ?? '',
          description:      item.description ?? '',
          description_ar:   item.descriptionAr ?? '',
          price:            Number(item.price),
          prep_time_mins:   item.prepTimeMins,
          image_url:        item.imageUrl ?? '',
          video_url:        item.videoUrl ?? '',
          group_name:       '',
          group_name_ar:    '',
          group_required:   '',
          group_min_select: '',
          group_max_select: '',
          option_name:      '',
          option_name_ar:   '',
          option_price_add: '',
          option_is_default:'',
        }

        if (!item.modifierGroups.length) {
          sheetRows.push(baseRow)
          continue
        }

        for (const grp of item.modifierGroups) {
          if (!grp.options.length) {
            sheetRows.push({
              ...baseRow,
              group_name:       grp.name,
              group_name_ar:    grp.nameAr ?? '',
              group_required:   grp.required,
              group_min_select: grp.minSelect,
              group_max_select: grp.maxSelect,
            })
            continue
          }
          for (const opt of grp.options) {
            sheetRows.push({
              ...baseRow,
              group_name:        grp.name,
              group_name_ar:     grp.nameAr ?? '',
              group_required:    grp.required,
              group_min_select:  grp.minSelect,
              group_max_select:  grp.maxSelect,
              option_name:       opt.name,
              option_name_ar:    opt.nameAr ?? '',
              option_price_add:  Number(opt.priceAdd),
              option_is_default: opt.isDefault,
            })
          }
        }
      }
    }

    // Add a blank template row if menu is empty
    if (!sheetRows.length) {
      sheetRows.push(Object.fromEntries(TEMPLATE_HEADERS.map(h => [h, ''])))
    }

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(sheetRows, { header: TEMPLATE_HEADERS })

    // Column widths
    ws['!cols'] = [
      { wch: 20 }, { wch: 20 }, { wch: 28 }, { wch: 28 },
      { wch: 40 }, { wch: 40 }, { wch: 8 }, { wch: 12 },
      { wch: 40 }, { wch: 40 },
      { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 24 }, { wch: 24 }, { wch: 16 }, { wch: 16 },
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Menu')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    return buf
  }
}
