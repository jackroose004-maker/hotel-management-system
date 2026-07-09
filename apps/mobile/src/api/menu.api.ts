import { apiGet } from './client'
import type { MenuCategory, MenuItem } from './types'

export function getCategories() {
  return apiGet<MenuCategory[]>('/menu/categories')
}

export function getItem(id: string) {
  return apiGet<MenuItem>(`/menu/items/${id}`)
}
