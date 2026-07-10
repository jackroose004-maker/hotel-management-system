// Static fallback theme — used before the live brand store (src/stores/brand.store.ts,
// GET /settings/brand) resolves, or by the handful of decorative surfaces not yet wired to
// read brandColor dynamically. `brand` matches this restaurant's actual currently-configured
// color (#2A7F7F teal, confirmed against the live DB) — NOT the Prisma schema's generic
// amber default. If this restaurant's brand color changes again, update the live DB value
// via the staff settings page; this constant only matters as the pre-fetch/fallback color.
export const colors = {
  brand: '#2A7F7F',
  brandDark: '#1f6161',
  brandLight: '#e6f2f2',

  background: '#f4f2ee',
  cardBg: '#ffffff',
  cardBorder: '#e5e1d9',
  headerBg: '#ffffff',
  headerBorder: '#e8e4de',
  inputBg: '#ffffff',
  mutedBg: '#ede9e3',

  textPrimary: '#1a1714',
  textMuted: '#6b6560',

  // Dark-mode variants from apps/web/app/globals.css's `.dark` block — used here (not the
  // light variants) because every guest-facing screen that shows a StatusBadge today is
  // forced dark via <ForceDark />, same as the web app. Revisit if/when staff (light-theme)
  // screens need their own badge coloring in task #11.
  status: {
    pending: { bg: 'rgba(120,53,15,0.14)', fg: '#fbbf24', border: 'rgba(120,53,15,0.28)' },
    warning: { bg: 'rgba(154,52,18,0.14)', fg: '#fdba74', border: 'rgba(154,52,18,0.28)' },
    success: { bg: 'rgba(6,95,70,0.14)', fg: '#34d399', border: 'rgba(6,95,70,0.28)' },
    danger: { bg: 'rgba(159,18,57,0.14)', fg: '#fb7185', border: 'rgba(159,18,57,0.28)' },
    info: { bg: 'rgba(30,64,175,0.14)', fg: '#93c5fd', border: 'rgba(30,64,175,0.28)' },
    neutral: { bg: 'rgba(255,255,255,0.05)', fg: '#9ca3af', border: 'rgba(255,255,255,0.09)' },
  },
} as const

// Mirrors the frosted-glass dark theme used by apps/web/app/login/page.tsx and the guest
// landing page (apps/web/app/page.tsx) — full-bleed photo background, dark translucent
// overlay, blurred glass card. This is deliberately a separate palette from `colors` above:
// the web app itself uses this cinematic dark look only for guest-facing marketing/auth
// screens, while staff/menu pages use the light theme. Do not merge these into one theme.
export const glass = {
  brand: colors.brand,
  brandRgb: '42,127,127', // for rgba(var(--brand-rgb), a) equivalents
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

// Mirrors the dark ordering theme forced by <ForceDark /> on apps/web/app/menu/page.tsx —
// exact hex values lifted from that file (#080808 page bg, #111 cards, #0d0d0d pills/inputs,
// #1e1e1e borders). Distinct from `glass` above: `glass` is translucent-over-photo (login),
// this is solid near-black surfaces (menu/cart/checkout/order tracking/account).
export const order = {
  brand: colors.brand,
  brandRgb: '42,127,127',
  pageBg: '#080808',
  headerBg: 'rgba(8,8,8,0.95)',
  cardBg: '#111111',
  pillBg: '#0d0d0d',
  border: '#1e1e1e',
  borderFaint: 'rgba(255,255,255,0.07)',
  textPrimary: '#ffffff',
  textSecondary: '#888888',
  textMuted: '#666666',
  textFaint: '#555555',
} as const

export const orderStatusVariant: Record<string, keyof typeof colors.status> = {
  PENDING: 'pending',
  ACCEPTED: 'info',
  PREPARING: 'warning',
  READY: 'success',
  DELIVERED: 'neutral',
  CANCELLED: 'danger',
}
