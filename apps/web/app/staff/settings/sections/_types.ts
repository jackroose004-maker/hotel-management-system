import type { BillConfig } from '@/components/ui/BillReceipt'
import React from 'react'

export interface KotConfig {
  fontSize: 'sm' | 'md' | 'lg'
  showTableNumber: boolean
  showOrderType: boolean
  showWaiterName: boolean
  showModifiers: boolean
  showOrderTime: boolean
  showOrderId: boolean
  headerText: string
  footerText: string
}

export const DEFAULT_KOT_CONFIG: KotConfig = {
  fontSize: 'md',
  showTableNumber: true,
  showOrderType: true,
  showWaiterName: true,
  showModifiers: true,
  showOrderTime: true,
  showOrderId: true,
  headerText: 'KITCHEN ORDER',
  footerText: 'FIRE NOW',
}

export type MenuItem = { id: string; name: string; description: string | null; price: string; prepTimeMins: number; imageUrl: string | null; category?: { name: string } }

export type HeroConfig = {
  line1: string; line2: string; subtext: string; videoUrl: string; posterUrl: string
  line1Ar?: string; line2Ar?: string; subtextAr?: string; badgeTextAr?: string
  heroMediaType?: 'video' | 'image'; heroImageUrl?: string
  ctaLabel: string; ctaLabelAr?: string
  ctaSecondaryLabel: string; ctaSecondaryLabelAr?: string
  badgeText: string
  dishesHeadline: string; dishesHeadlineAr?: string
  dishesSubtext: string; dishesSubtextAr?: string
  signatureDishIds?: string[]
  relayTagline: string; relayTaglineAr?: string
  relayHeadline: string; relayHeadlineAr?: string
  relayHeadlinePart2: string; relayHeadlinePart2Ar?: string
  ambienceTagline: string; ambienceTaglineAr?: string
  ambienceHeadline: string; ambienceHeadlineAr?: string
  ambienceHeadlinePart2: string; ambienceHeadlinePart2Ar?: string
  ambienceDesc: string
  reviewsHeadline: string; reviewsHeadlineAr?: string
  ambienceImages: string[]
  ambienceImg1?: string; ambienceImg2?: string; ambienceImg3?: string; ambienceImg4?: string
  ambienceImg5?: string; ambienceImg6?: string; ambienceImg7?: string; ambienceImg8?: string
}

export type Cfg = {
  restaurantName: string; restaurantNameAr?: string; tagline: string; taglineAr?: string; phone: string; address: string; logoUrl: string
  openTime: string; closeTime: string; weeklySchedule: Record<string, { open: boolean; shifts: { openTime: string; closeTime: string }[] }>; timezone: string
  defaultCapacity: number; vatRate: number; currency: string; defaultPrepTimeMins: number
  bookingsEnabled: boolean; slotDurationMins: number; peakHoursEnabled: boolean
  expectedDiningMins: number; tableReleaseWindowMins: number; sameDayCutoffMins: number
  peakRanges: { start: string; end: string }[]; noShowGracePeriodOffPeak: number; noShowGracePeriodPeak: number
  maxBookingDaysAhead: number; requireLoginToBook: boolean; remindersEnabled: boolean; reminderMinsBefore: number
  heroConfig: HeroConfig
  brandColor: string
  showLanguageToggle: boolean
  loginDesktopImage?: string
  vatNumber?: string
  billConfig?: BillConfig
  kdsEnabled: boolean
  thermalEnabled: boolean
  thermalPrinterIp?: string
  thermalPrinterPort?: number
  kotConfig?: KotConfig
  splitPaymentEnabled: boolean
  tipEnabled: boolean
  discountEnabled: boolean
  packingCharge?: number
  refundCoolingMins?: number
  selfCancelWindowMins?: number
  preOrderEnabled: boolean
  preOrderLeadMins: number
}

export const UPDATABLE: (keyof Cfg)[] = [
  'restaurantName','restaurantNameAr','tagline','taglineAr','heroConfig','phone','address','logoUrl','openTime','closeTime','timezone',
  'defaultCapacity','vatRate','currency','defaultPrepTimeMins','vatNumber','billConfig',
  'weeklySchedule',
  'bookingsEnabled','slotDurationMins','peakHoursEnabled',
  'expectedDiningMins','tableReleaseWindowMins','sameDayCutoffMins',
  'peakRanges','noShowGracePeriodOffPeak','noShowGracePeriodPeak',
  'maxBookingDaysAhead','requireLoginToBook','remindersEnabled','reminderMinsBefore',
  'brandColor','showLanguageToggle','loginDesktopImage',
  'kdsEnabled','thermalEnabled','thermalPrinterIp','thermalPrinterPort','kotConfig',
  'splitPaymentEnabled','tipEnabled','discountEnabled','packingCharge','refundCoolingMins','selfCancelWindowMins','preOrderEnabled','preOrderLeadMins',
]

export const TIMEZONES = ['Asia/Dubai','Asia/Riyadh','Asia/Kuwait','Asia/Bahrain','Asia/Qatar','Asia/Muscat']
export const CURRENCIES = ['AED','SAR','KWD','BHD','QAR','OMR']

export type SectionId = 'restaurant' | 'tables' | 'bookings' | 'landing' | 'bill' | 'kitchen' | 'roles' | 'email'

export type NavItem = { id: SectionId; label: string; icon: React.ElementType; desc: string }
