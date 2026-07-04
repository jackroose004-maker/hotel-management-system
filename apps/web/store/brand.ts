import { create } from 'zustand'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

const BRAND_HEX = '#f59e0b'
const BRAND_DARK = '#d97706'
const BRAND_LIGHT = '#fffbeb'

interface BrandStore {
  ready: boolean
  logoUrl: string
}

function applyBrand() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--brand',       BRAND_HEX)
  root.style.setProperty('--brand-dark',  BRAND_DARK)
  root.style.setProperty('--brand-light', BRAND_LIGHT)
}

export function applyFavicon(url: string) {
  if (typeof document === 'undefined' || !url) return
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = url
}

export const useBrandStore = create<BrandStore>(() => ({ ready: false, logoUrl: '' }))

export async function initBrand() {
  if (typeof window === 'undefined') return
  applyBrand()
  try {
    const res = await fetch(`${API}/settings`)
    if (res.ok) {
      const data = await res.json()
      const logoUrl = data?.logoUrl ?? data?.data?.logoUrl ?? ''
      if (logoUrl) {
        useBrandStore.setState({ logoUrl })
        applyFavicon(logoUrl)
      }
    }
  } catch {}
  useBrandStore.setState({ ready: true })
}
