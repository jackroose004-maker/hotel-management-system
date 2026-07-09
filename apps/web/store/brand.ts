import { create } from 'zustand'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

const DEFAULT_COLOR = '#9B2335'
const CACHE_KEY = 'brand_cache'
const CACHE_VERSION = 2

interface BrandStore {
  ready: boolean
  logoUrl: string
  restaurantName: string
  restaurantNameAr: string
  tagline: string
  taglineAr: string
  brandColor: string
  showLanguageToggle: boolean
  loginBg: string
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function darken(hex: string, amount = 15): string {
  const [h, s, l] = hexToHsl(hex)
  return `hsl(${h}, ${s}%, ${Math.max(0, l - amount)}%)`
}

function lighten(hex: string, amount = 45): string {
  const [h, s, l] = hexToHsl(hex)
  return `hsl(${h}, ${Math.min(100, s + 10)}%, ${Math.min(97, l + amount)}%)`
}

// Mix brand hue into a dark base at `strength` (0–1). Keeps luminance near the base value.
export function applyBrandColor(color: string) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  // Brand accent only — surfaces stay pure neutral via CSS
  root.style.setProperty('--brand',       color)
  root.style.setProperty('--brand-rgb',   `${r}, ${g}, ${b}`)
  root.style.setProperty('--brand-dark',  darken(color))
  root.style.setProperty('--brand-light', lighten(color))
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

export const useBrandStore = create<BrandStore>(() => ({
  ready: false,
  logoUrl: '',
  restaurantName: 'Al Manzil',
  restaurantNameAr: '',
  tagline: '',
  taglineAr: '',
  brandColor: DEFAULT_COLOR,
  showLanguageToggle: false,
  loginBg: '',
}))

export async function initBrand() {
  if (typeof window === 'undefined') return

  // Apply cached brand instantly — eliminates flash on every refresh after first load
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const c = JSON.parse(cached)
      if (c._v === CACHE_VERSION) {
        applyBrandColor(c.brandColor ?? DEFAULT_COLOR)
        if (c.logoUrl) applyFavicon(c.logoUrl)
        useBrandStore.setState({ ...c })
      } else {
        localStorage.removeItem(CACHE_KEY)
        applyBrandColor(DEFAULT_COLOR)
      }
    } else {
      applyBrandColor(DEFAULT_COLOR)
    }
  } catch {
    applyBrandColor(DEFAULT_COLOR)
  }

  // Fetch fresh from API and update cache
  try {
    const res = await fetch(`${API}/settings/brand`)
    if (res.ok) {
      const data = await res.json()
      const d = data?.data ?? data
      const logoUrl = d?.logoUrl ?? ''
      const restaurantName = d?.restaurantName ?? ''
      const restaurantNameAr = d?.restaurantNameAr ?? ''
      const tagline = d?.tagline ?? ''
      const taglineAr = d?.taglineAr ?? ''
      const brandColor = d?.brandColor ?? DEFAULT_COLOR
      const showLanguageToggle = d?.showLanguageToggle ?? false
      const loginBg = d?.loginBg ?? d?.loginDesktopImage ?? ''

      if (logoUrl) applyFavicon(logoUrl)
      applyBrandColor(brandColor)

      const state = {
        logoUrl,
        ...(restaurantName ? { restaurantName } : {}),
        restaurantNameAr,
        tagline,
        taglineAr,
        brandColor,
        showLanguageToggle,
        loginBg,
      }
      useBrandStore.setState(state)

      // Save to cache for next page load (with version to invalidate stale entries)
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...state, _v: CACHE_VERSION })) } catch {}
    }
  } catch {}

  useBrandStore.setState({ ready: true })
}
