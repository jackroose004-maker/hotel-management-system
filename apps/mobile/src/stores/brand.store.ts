import { create } from 'zustand'
import * as settingsApi from '../api/settings.api'
import type { HeroConfig } from '../api/settings.api'
import { colors as fallbackColors, order as fallbackOrder, glass as fallbackGlass } from '../theme/colors'

interface BrandStore {
  name: string
  nameAr?: string
  tagline?: string
  logoUrl?: string
  loginBg?: string
  brandColor: string
  address?: string
  bookingsEnabled: boolean
  heroConfig?: HeroConfig | null
  ready: boolean
  init: () => Promise<void>
}

// Mirrors apps/web/store/brand.ts's initBrand() — fetches live restaurant config once on
// app start so name/logo/color always reflect what's actually configured in the staff
// settings page instead of a hardcoded guess. Falls back to the static theme defaults
// (theme/colors.ts) if the fetch fails (offline first launch, backend down, etc.) so the
// app still renders something coherent rather than blank.
export const useBrandStore = create<BrandStore>((set) => ({
  name: 'Al Manzil',
  nameAr: undefined,
  tagline: undefined,
  logoUrl: undefined,
  loginBg: undefined,
  brandColor: fallbackColors.brand,
  address: undefined,
  bookingsEnabled: true,
  heroConfig: null,
  ready: false,

  init: async () => {
    try {
      const [brand, full] = await Promise.all([settingsApi.getBrand(), settingsApi.getFullSettings()])
      set({
        name: brand.restaurantName || 'Al Manzil',
        nameAr: brand.restaurantNameAr,
        tagline: brand.tagline,
        logoUrl: brand.logoUrl,
        loginBg: brand.loginBg,
        brandColor: brand.brandColor || fallbackColors.brand,
        address: full.address,
        bookingsEnabled: full.bookingsEnabled ?? true,
        heroConfig: full.heroConfig,
        ready: true,
      })
    } catch {
      set({ ready: true }) // keep static fallback theme colors, just mark ready so UI unblocks
    }
  },
}))

// Convenience: derive rgba-capable "R,G,B" string from a live hex brand color, used
// anywhere theme/colors.ts currently hardcodes `brandRgb` for rgba(...) overlays.
export function hexToRgbString(hex: string): string {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `${r},${g},${b}`
}

// Exported so any screen can grab "the current fallback" if it renders before brand.init()
// resolves — keeps a single source of truth for the pre-live-data default.
export const staticBrandDefaults = { colors: fallbackColors, order: fallbackOrder, glass: fallbackGlass }
