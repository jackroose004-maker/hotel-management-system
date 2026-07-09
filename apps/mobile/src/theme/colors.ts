// Mirrors the light-mode CSS custom properties in apps/web/app/globals.css so the mobile
// app visually matches the web app's default "amber" brand preset. Dark mode / dynamic
// brand-preset switching (apps/web/store/brand.ts) is not wired up yet — Phase 1 ships
// light mode only with the default brand color.
export const colors = {
  brand: '#f59e0b',
  brandDark: '#d97706',
  brandLight: '#fffbeb',

  background: '#f4f2ee',
  cardBg: '#ffffff',
  cardBorder: '#e5e1d9',
  headerBg: '#ffffff',
  headerBorder: '#e8e4de',
  inputBg: '#ffffff',
  mutedBg: '#ede9e3',

  textPrimary: '#1a1714',
  textMuted: '#6b6560',

  status: {
    pending: { bg: '#fffbeb', fg: '#78350f', border: 'rgba(217,119,6,0.28)' },
    warning: { bg: '#fff7ed', fg: '#9a3412', border: 'rgba(251,146,60,0.3)' },
    success: { bg: '#ecfdf5', fg: '#065f46', border: 'rgba(52,211,153,0.35)' },
    danger: { bg: '#fff1f2', fg: '#9f1239', border: 'rgba(251,113,133,0.35)' },
    info: { bg: '#eff6ff', fg: '#1e40af', border: 'rgba(147,197,253,0.4)' },
    neutral: { bg: '#f8f8f8', fg: '#4b5563', border: 'rgba(209,213,219,0.6)' },
  },
} as const

// Mirrors the frosted-glass dark theme used by apps/web/app/login/page.tsx and the guest
// landing page (apps/web/app/page.tsx) — full-bleed photo background, dark translucent
// overlay, blurred glass card. This is deliberately a separate palette from `colors` above:
// the web app itself uses this cinematic dark look only for guest-facing marketing/auth
// screens, while staff/menu pages use the light theme. Do not merge these into one theme.
export const glass = {
  brand: colors.brand,
  brandRgb: '245,158,11', // for rgba(var(--brand-rgb), a) equivalents
  overlayFrom: 'rgba(0,0,0,0.7)',
  overlayTo: 'rgba(0,0,0,0.65)',
  cardBg: 'rgba(8,8,8,0.72)', // slightly more opaque than web's 0.6 — RN blur reads lighter
  cardBorder: 'rgba(255,255,255,0.1)',
  inputBg: 'rgba(255,255,255,0.07)',
  inputBorder: 'rgba(255,255,255,0.12)',
  textPrimary: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.7)',
  textMuted: 'rgba(255,255,255,0.5)',
  textFaint: 'rgba(255,255,255,0.35)',
  divider: 'rgba(255,255,255,0.15)',
  fallbackHeroImage: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=1600&q=80',
} as const

export const orderStatusVariant: Record<string, keyof typeof colors.status> = {
  PENDING: 'pending',
  ACCEPTED: 'info',
  PREPARING: 'warning',
  READY: 'success',
  DELIVERED: 'neutral',
  CANCELLED: 'danger',
}
