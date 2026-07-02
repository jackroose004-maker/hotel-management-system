import { create } from 'zustand'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

// Gold accent — used for buttons, active states, and status badges only.
// Page/card backgrounds are neutral and not brand-driven.
const BRAND_HEX = '#f59e0b'
const BRAND_DARK = '#d97706'
const BRAND_LIGHT = '#fffbeb'

interface BrandStore {
  ready: boolean
}

function applyBrand() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--brand',       BRAND_HEX)
  root.style.setProperty('--brand-dark',  BRAND_DARK)
  root.style.setProperty('--brand-light', BRAND_LIGHT)
}

export const useBrandStore = create<BrandStore>(() => ({ ready: false }))

export async function initBrand() {
  if (typeof window === 'undefined') return
  applyBrand()
  useBrandStore.setState({ ready: true })
}
