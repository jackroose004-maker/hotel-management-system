import { apiGet } from './client'
import { toNum } from './decimal'
import type { MenuCategory, MenuItem } from './types'

// GET /menu/categories is intentionally slim — it returns `itemCount` per category, not
// nested items (confirmed against apps/backend/src/menu/menu.service.ts). Items must be
// fetched per-category via getCategoryItems below. The mobile menu screen was originally
// written assuming nested items came back for free, which silently rendered an empty grid.
export function getCategories() {
  return apiGet<MenuCategory[]>('/menu/categories')
}

export interface CategoryItemsResponse {
  items: MenuItem[]
  nextCursor: string | null
  hasMore: boolean
}

// price and modifierGroups[].options[].priceAdd are Prisma Decimal fields — see decimal.ts
// for why these arrive as strings and need coercing before the rest of the app treats them
// as numbers (typed as `number` in api/types.ts, but not actually numbers at runtime).
function normalizeItem(item: MenuItem): MenuItem {
  return {
    ...item,
    price: toNum(item.price),
    modifierGroups: item.modifierGroups?.map((g) => ({
      ...g,
      options: g.options.map((o) => ({ ...o, priceAdd: toNum(o.priceAdd) })),
    })),
  }
}

export async function getCategoryItems(categoryId: string, cursor?: string, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) })
  const res = await apiGet<CategoryItemsResponse>(`/menu/categories/${categoryId}/items?${params.toString()}`)
  return { ...res, items: res.items.map(normalizeItem) }
}

export async function getItem(id: string) {
  return normalizeItem(await apiGet<MenuItem>(`/menu/items/${id}`))
}
