import { apiGet } from './client'

export interface BrandSettings {
  restaurantName: string
  restaurantNameAr?: string
  tagline?: string
  taglineAr?: string
  logoUrl?: string
  brandColor: string
  showLanguageToggle: boolean
  loginBg?: string
}

// Slim public endpoint (apps/backend/src/settings/settings.controller.ts GET /settings/brand)
// — same source of truth the web app reads via useBrandStore, so mobile never drifts from
// whatever the restaurant has actually configured (name, logo, color) via the staff settings page.
export function getBrand() {
  return apiGet<BrandSettings>('/settings/brand')
}

export interface HeroConfig {
  line1?: string
  line2?: string
  subtext?: string
  videoUrl?: string
  posterUrl?: string
  badgeText?: string
  ctaLabel?: string
  ctaSecondaryLabel?: string
  dishesSubtext?: string
  dishesHeadline?: string
  ambienceTagline?: string
  ambienceHeadline?: string
  ambienceHeadlinePart2?: string
}

export interface FullSettings {
  restaurantName: string
  tagline?: string
  address?: string
  bookingsEnabled: boolean
  heroConfig?: HeroConfig | null
}

// Full public settings (apps/backend/src/settings/settings.controller.ts GET /settings —
// unguarded, same endpoint the web landing page reads for heroConfig/address/bookingsEnabled).
export function getFullSettings() {
  return apiGet<FullSettings>('/settings')
}
