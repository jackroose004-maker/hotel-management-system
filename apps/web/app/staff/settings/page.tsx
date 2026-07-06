'use client'
import React, { useState, useEffect, useCallback } from 'react'
import {
  Store, Clock, Table2, ShoppingBag, CalendarDays,
  Save, Loader2, CheckCircle2,
  WifiOff, Minus, Plus, ChevronDown,
  Zap, ChevronRight, Layout, Trash2, UtensilsCrossed, Receipt,
} from 'lucide-react'
import BillReceipt, { DEFAULT_BILL_CONFIG, type BillConfig } from '@/components/ui/BillReceipt'
import { useAuthStore } from '@/store/auth'
import { applyFavicon, applyBrandColor } from '@/store/brand'
import ImageUpload from '@/components/ui/ImageUpload'
import toast from 'react-hot-toast'

const CLOUD  = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!
const PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!

async function uploadVideo(file: File): Promise<string> {
  if (!CLOUD || !PRESET) throw new Error('Cloudinary env vars not set')
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', PRESET)
  fd.append('folder', 'almanzil/hero')
  fd.append('public_id', `hero-video-${Date.now()}`)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/video/upload`, { method: 'POST', body: fd })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message ?? 'Upload failed') }
  return (await res.json()).secure_url as string
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

async function autoTranslate(text: string, from: 'en' | 'ar', to: 'en' | 'ar'): Promise<string> {
  if (!text.trim()) return ''
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
    )
    const json = await res.json()
    return json?.responseData?.translatedText ?? ''
  } catch { return '' }
}

type MenuItem = { id: string; name: string; description: string | null; price: string; prepTimeMins: number; imageUrl: string | null; category?: { name: string } }

type HeroConfig = {
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
  // legacy individual keys kept for read-back compat only
  ambienceImg1?: string; ambienceImg2?: string; ambienceImg3?: string; ambienceImg4?: string
  ambienceImg5?: string; ambienceImg6?: string; ambienceImg7?: string; ambienceImg8?: string
}

type Cfg = {
  restaurantName: string; restaurantNameAr?: string; tagline: string; taglineAr?: string; phone: string; address: string; logoUrl: string
  openTime: string; closeTime: string; timezone: string
  totalTables: number; defaultCapacity: number; vatRate: number; currency: string; defaultPrepTimeMins: number
  bookingsEnabled: boolean; slotDurationMins: number; walkInBuffer: number; peakHoursEnabled: boolean
  peakStart: string; peakEnd: string; noShowWindowOffPeak: number; noShowWindowPeak: number
  maxBookingDaysAhead: number; requireLoginToBook: boolean; remindersEnabled: boolean; reminderMinsBefore: number
  heroConfig: HeroConfig
  brandColor: string
  showLanguageToggle: boolean
  loginDesktopImage?: string
  loginMobileImage?: string
  vatNumber?: string
  billConfig?: BillConfig
}

const UPDATABLE: (keyof Cfg)[] = [
  'restaurantName','restaurantNameAr','tagline','taglineAr','heroConfig','phone','address','logoUrl','openTime','closeTime','timezone',
  'totalTables','defaultCapacity','vatRate','currency','defaultPrepTimeMins','vatNumber','billConfig',
  'bookingsEnabled','slotDurationMins','walkInBuffer','peakHoursEnabled',
  'peakStart','peakEnd','noShowWindowOffPeak','noShowWindowPeak',
  'maxBookingDaysAhead','requireLoginToBook','remindersEnabled','reminderMinsBefore',
  'brandColor','showLanguageToggle','loginDesktopImage','loginMobileImage',
]

const TIMEZONES = ['Asia/Dubai','Asia/Riyadh','Asia/Kuwait','Asia/Bahrain','Asia/Qatar','Asia/Muscat']
const CURRENCIES = ['AED','SAR','KWD','BHD','QAR','OMR']

type SectionId = 'restaurant' | 'hours' | 'tables' | 'orders' | 'bookings' | 'landing' | 'bill'

const NAV: { id: SectionId; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'restaurant',    label: 'Restaurant',    icon: Store,        desc: 'Name, logo & contact' },
  { id: 'landing',       label: 'Landing Page',  icon: Layout,       desc: 'Hero, sections & text' },
  { id: 'hours',         label: 'Opening Hours', icon: Clock,        desc: 'Daily open & close times' },
  { id: 'tables',        label: 'Tables',        icon: Table2,       desc: 'Capacity & floor layout' },
  { id: 'orders',        label: 'Orders & VAT',  icon: ShoppingBag,  desc: 'Tax rate, currency & prep' },
  { id: 'bookings',      label: 'Bookings',      icon: CalendarDays, desc: 'Reservations & slots' },
  { id: 'bill',          label: 'Bill & Receipt', icon: Receipt,     desc: 'Print layout & PDF design' },
]

// ─── Controls ─────────────────────────────────────────────────────────────────

const inputCls = [
  'w-full px-3 py-2 text-sm rounded-lg border border-[var(--card-border)]',
  'focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20 focus:border-[var(--brand)]',
  'transition-all placeholder-gray-400',
].join(' ')

const Inp = ({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) =>
  <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className={inputCls} style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }} />

const Textarea = ({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) =>
  <textarea rows={rows} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className={inputCls} style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', resize: 'vertical' }} />

const Sel = ({ value, onChange, options }: { value: string | number; onChange: (v: string) => void; options: { value: string | number; label: string }[] }) => (
  <div className="relative">
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`${inputCls} appearance-none pr-8 cursor-pointer`}
      style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
  </div>
)

const TimePick = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const [h, m] = (value || '00:00').split(':')
  return (
    <div className="relative">
      <select value={h} onChange={e => onChange(`${e.target.value}:${m ?? '00'}`)}
        className={`${inputCls} appearance-none pr-8 cursor-pointer`}
        style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }}>
        {Array.from({ length: 24 }, (_, i) => {
          const hh = String(i).padStart(2, '0')
          const h12 = i === 0 ? 12 : i > 12 ? i - 12 : i
          return <option key={hh} value={hh}>{String(h12).padStart(2, '0')}:00 {i < 12 ? 'AM' : 'PM'}</option>
        })}
      </select>
      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
    </div>
  )
}

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button type="button" onClick={() => onChange(!checked)}
    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 flex-shrink-0 cursor-pointer"
    style={{ backgroundColor: checked ? 'var(--brand)' : 'var(--card-border)' }}>
    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
)

const Stepper = ({ value, onChange, min, max, step = 1, suffix = '' }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string }) => (
  <div className="inline-flex items-center rounded-lg border border-[var(--card-border)] overflow-hidden" style={{ backgroundColor: 'var(--input-bg)' }}>
    <button onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}
      className="w-8 h-8 flex items-center justify-center hover:bg-[var(--muted-bg)] transition-colors disabled:opacity-30"
      style={{ color: 'var(--text-muted)', borderRight: '1px solid var(--card-border)' }}>
      <Minus size={12} />
    </button>
    <span className="px-3 text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}{suffix}</span>
    <button onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}
      className="w-8 h-8 flex items-center justify-center hover:bg-[var(--muted-bg)] transition-colors disabled:opacity-30"
      style={{ color: 'var(--text-muted)', borderLeft: '1px solid var(--card-border)' }}>
      <Plus size={12} />
    </button>
  </div>
)

const Slider = ({ value, min, max, step = 1, unit, onChange }: { value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void }) => {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100
  return (
    <div className="flex items-center gap-4">
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ background: `linear-gradient(to right,var(--brand) ${pct}%,var(--card-border) ${pct}%)` }} />
      <span className="text-sm font-bold tabular-nums w-28 text-right" style={{ color: 'var(--brand)' }}>{value} {unit}</span>
    </div>
  )
}

// ─── Layout atoms ─────────────────────────────────────────────────────────────

function BilingualField({ label, valueEn, valueAr, placeholder, placeholderAr, onChangeEn, onChangeAr }: {
  label: string; valueEn: string; valueAr: string
  placeholder: string; placeholderAr: string
  onChangeEn: (v: string) => void; onChangeAr: (v: string) => void
}) {
  const [translating, setTranslating] = React.useState<'en' | 'ar' | null>(null)

  const translate = async (from: 'en' | 'ar') => {
    const text = from === 'en' ? valueEn : valueAr
    if (!text.trim()) return
    setTranslating(from)
    const result = await autoTranslate(text, from, from === 'en' ? 'ar' : 'en')
    if (result) from === 'en' ? onChangeAr(result) : onChangeEn(result)
    setTranslating(null)
  }

  return (
    <div className="mb-4">
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg3)', color: 'var(--text-muted)' }}>EN</span>
            <button onClick={() => translate('en')} disabled={!!translating || !valueEn}
              className="text-[10px] font-medium px-2 py-0.5 rounded transition-colors disabled:opacity-40"
              style={{ color: 'var(--brand)', backgroundColor: 'transparent', border: '1px solid var(--brand)' }}>
              {translating === 'en' ? '...' : '→ AR'}
            </button>
          </div>
          <Inp value={valueEn} onChange={onChangeEn} placeholder={placeholder} />
        </div>
        <div dir="rtl">
          <div className="flex items-center gap-1.5 mb-1 justify-end">
            <button onClick={() => translate('ar')} disabled={!!translating || !valueAr}
              className="text-[10px] font-medium px-2 py-0.5 rounded transition-colors disabled:opacity-40"
              style={{ color: 'var(--brand)', backgroundColor: 'transparent', border: '1px solid var(--brand)' }}>
              {translating === 'ar' ? '...' : '→ EN'}
            </button>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg3)', color: 'var(--text-muted)' }}>AR</span>
          </div>
          <Inp value={valueAr} onChange={onChangeAr} placeholder={placeholderAr} />
        </div>
      </div>
    </div>
  )
}

function Row({ label, desc, children, border = true }: { label: string; desc?: string; children: React.ReactNode; border?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-8 py-4 px-6 ${border ? 'border-b border-[var(--card-border)]' : ''}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {desc && <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>{desc}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function FieldBlock({ children, border = true }: { children: React.ReactNode; border?: boolean }) {
  return <div className={`px-6 py-4 ${border ? 'border-b border-[var(--card-border)]' : ''}`}>{children}</div>
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div className="px-6 py-2 border-y border-[var(--card-border)]"
      style={{ backgroundColor: 'var(--muted-bg)' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{text}</p>
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
      <Zap size={11} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--brand)' }} />
      <span>{children}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { token } = useAuthStore()
  const [cfg, setCfg]           = useState<Cfg | null>(null)
  const [original, setOriginal] = useState<Cfg | null>(null)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [loadErr, setLoadErr]   = useState(false)
  const [section, setSection]   = useState<SectionId>('restaurant')
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [videoUploading, setVideoUploading] = useState(false)
  const [dishCat, setDishCat] = useState('All')
  const [dishQ, setDishQ] = useState('')
  const [openPanel, setOpenPanel] = useState<string>('hero')

  useEffect(() => {
    if (section !== 'landing') return
    fetch(`${API}/menu/items`).then(r => r.json())
      .then(j => setMenuItems((j?.data ?? j ?? []).filter((i: MenuItem) => i.imageUrl)))
      .catch(() => {})
  }, [section])

  const load = useCallback(() => {
    setLoadErr(false)
    fetch(`${API}/settings`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => {
        const s = d?.data ?? d
        // Migrate legacy ambienceImg1..8 keys into ambienceImages array
        if (s?.heroConfig && !s.heroConfig.ambienceImages) {
          const imgs = [1,2,3,4,5,6,7,8]
            .map((i: number) => s.heroConfig[`ambienceImg${i}`])
            .filter(Boolean) as string[]
          s.heroConfig.ambienceImages = imgs
        } else if (s?.heroConfig && !Array.isArray(s.heroConfig.ambienceImages)) {
          s.heroConfig.ambienceImages = []
        }
        setCfg(s); setOriginal(s)
      })
      .catch(() => setLoadErr(true))
  }, [])

  useEffect(() => { load() }, [load])

  function set<K extends keyof Cfg>(k: K, v: Cfg[K]) { setCfg(p => p ? { ...p, [k]: v } : p) }
  const anyDirty = !!(cfg && original && UPDATABLE.some(k => cfg[k] !== original[k]))

  async function save() {
    if (!cfg || !token) { toast.error('Not authenticated'); return }
    setSaving(true)
    try {
      const payload = Object.fromEntries(UPDATABLE.map(k => [k, (cfg as any)[k]]))
      const r = await fetch(`${API}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error?.message ?? 'Failed') }
      setOriginal({ ...cfg })
      toast.success('Settings saved')
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e: any) { toast.error(e.message ?? 'Could not save') }
    finally { setSaving(false) }
  }

  function discard() { if (original) { setCfg({ ...original }); toast('Changes discarded') } }

  if (loadErr) return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 p-10">
      <WifiOff size={28} className="text-red-400" />
      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Can't reach the server</p>
      <button onClick={load} className="text-white px-5 py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: 'var(--brand)' }}>Retry</button>
    </div>
  )

  if (!cfg) return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-60 flex-shrink-0 border-r border-[var(--card-border)]" style={{ backgroundColor: 'var(--card-bg)' }}>
        {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-14 mx-3 my-1 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--muted-bg)' }} />)}
      </div>
      <div className="flex-1">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 border-b border-[var(--card-border)] animate-pulse" style={{ backgroundColor: 'var(--muted-bg)', opacity: 0.4 }} />)}
      </div>
    </div>
  )

  const openH   = parseInt(cfg.openTime?.split(':')[0] || '0')
  const closeH  = parseInt(cfg.closeTime?.split(':')[0] || '0')
  const openHrs = closeH > openH ? closeH - openH : 24 - openH + closeH
  const vatPct  = Number((Number(cfg.vatRate) * 100).toFixed(1))
  const active  = NAV.find(n => n.id === section)!

  return (
    <div className="flex flex-1 overflow-hidden">


      {/* ══ Secondary sidebar ══════════════════════════════════════════════════ */}
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0 border-r border-[var(--card-border)] overflow-y-auto"
        style={{ backgroundColor: 'var(--card-bg)' }}>

        {/* Header */}
        <div className="h-12 flex items-center px-4 border-b border-[var(--card-border)] flex-shrink-0">
          <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Settings</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-1.5 overflow-y-auto">
          {NAV.map(({ id, label, icon: Icon, desc }) => {
            const isActive = section === id
            return (
              <button key={id} onClick={() => setSection(id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all relative"
                style={isActive ? { backgroundColor: 'var(--muted-bg)' } : {}}>
                {/* Active left bar */}
                <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r transition-all"
                  style={{ backgroundColor: isActive ? 'var(--brand)' : 'transparent' }} />
                {/* Icon */}
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                  style={{ backgroundColor: isActive ? 'var(--brand)' : 'var(--muted-bg)' }}>
                  <Icon size={13} style={{ color: isActive ? 'white' : 'var(--text-muted)' }} />
                </div>
                {/* Label */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate leading-tight"
                    style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: isActive ? 600 : 400 }}>
                    {label}
                  </p>
                  <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{desc}</p>
                </div>
                {isActive && <ChevronRight size={11} className="flex-shrink-0" style={{ color: 'var(--brand)' }} />}
              </button>
            )
          })}
        </nav>

        {/* Dirty indicator */}
        {anyDirty && (
          <div className="px-4 py-3 border-t border-[var(--card-border)] flex items-center gap-2 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: 'var(--brand)' }} />
            <p className="text-xs font-medium" style={{ color: 'var(--brand)' }}>Unsaved changes</p>
          </div>
        )}
      </aside>

      {/* ══ Content pane ═══════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--background)' }}>

        {/* Pane header */}
        <div className="h-12 flex-shrink-0 flex items-center justify-between gap-4 px-5 border-b border-[var(--card-border)]"
          style={{ backgroundColor: 'var(--card-bg)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <active.icon size={14} style={{ color: 'var(--brand)', flexShrink: 0 }} />
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{active.label}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {anyDirty && (
              <button onClick={discard}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--card-border)', backgroundColor: 'var(--input-bg)' }}>
                Discard
              </button>
            )}
            <button onClick={save} disabled={saving || !anyDirty}
              className="flex items-center gap-1.5 text-xs font-semibold text-white px-4 py-1.5 rounded-lg disabled:opacity-40 transition-all"
              style={{ backgroundColor: 'var(--brand)' }}>
              {saving ? <><Loader2 size={12} className="animate-spin" />Saving…</>
                : saved && !anyDirty ? <><CheckCircle2 size={12} />Saved</>
                : <><Save size={12} />Save</>}
            </button>
          </div>
        </div>

        {/* Mobile section tabs */}
        <div className="md:hidden flex overflow-x-auto gap-1 p-2 border-b border-[var(--card-border)]" style={{ backgroundColor: 'var(--card-bg)' }}>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setSection(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0"
              style={section === id
                ? { backgroundColor: 'var(--brand)', color: 'white' }
                : { color: 'var(--text-muted)', backgroundColor: 'var(--muted-bg)' }}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="border border-[var(--card-border)] rounded-xl overflow-hidden m-5"
            style={{ backgroundColor: 'var(--card-bg)' }}>

            {/* ── RESTAURANT ── */}
            {section === 'restaurant' && <>
              <SectionLabel text="Identity" />
              <FieldBlock>
                <BilingualField label="Restaurant name"
                  valueEn={cfg.restaurantName ?? ''} valueAr={cfg.restaurantNameAr ?? ''}
                  placeholder="Al Manzil" placeholderAr="المنزل"
                  onChangeEn={v => set('restaurantName', v)} onChangeAr={v => set('restaurantNameAr', v)} />
                <BilingualField label="Tagline"
                  valueEn={cfg.tagline ?? ''} valueAr={cfg.taglineAr ?? ''}
                  placeholder="Authentic Kerala cuisine" placeholderAr="مطبخ كيرالا الأصيل"
                  onChangeEn={v => set('tagline', v)} onChangeAr={v => set('taglineAr', v)} />
              </FieldBlock>
              <SectionLabel text="Contact" />
              <FieldBlock>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Phone</p>
                    <Inp value={cfg.phone} onChange={v => set('phone', v)} placeholder="+971 50 000 0000" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Address</p>
                    <Inp value={cfg.address} onChange={v => set('address', v)} placeholder="Al Karama, Dubai" />
                  </div>
                </div>
              </FieldBlock>
              <SectionLabel text="Regional" />
              <FieldBlock>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Timezone</p>
                    <Sel value={cfg.timezone} onChange={v => set('timezone', v)} options={TIMEZONES.map(t => ({ value: t, label: t.replace('Asia/', '') }))} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Currency</p>
                    <Sel value={cfg.currency} onChange={v => set('currency', v)} options={CURRENCIES.map(c => ({ value: c, label: c }))} />
                  </div>
                </div>
              </FieldBlock>
              <SectionLabel text="Logo" />
              <FieldBlock>
                <ImageUpload
                  value={cfg.logoUrl}
                  onChange={v => { set('logoUrl', v); applyFavicon(v) }}
                  folder="almanzil/logo"
                  publicId="logo"
                  hint="Square image · min 256 × 256 px · uploads directly to CDN"
                  aspectRatio="square"
                  className="max-w-[160px]"
                />
              </FieldBlock>

              <SectionLabel text="Login Page Images" />
              <FieldBlock>
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                  These images appear on the customer sign-in / sign-up screen.
                  Leave blank to use the default food photos.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                      Desktop background <span className="font-normal opacity-60">(left panel)</span>
                    </p>
                    <ImageUpload
                      value={cfg.loginDesktopImage ?? ''}
                      onChange={v => set('loginDesktopImage', v ?? '')}
                      folder="almanzil/login"
                      publicId="login-desktop"
                      hint="Landscape · 900 × 1200 px recommended"
                      aspectRatio="portrait"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                      Mobile header image <span className="font-normal opacity-60">(top banner)</span>
                    </p>
                    <ImageUpload
                      value={cfg.loginMobileImage ?? ''}
                      onChange={v => set('loginMobileImage', v ?? '')}
                      folder="almanzil/login"
                      publicId="login-mobile"
                      hint="Landscape · 600 × 300 px recommended"
                      aspectRatio="video"
                    />
                  </div>
                </div>
              </FieldBlock>

              <SectionLabel text="Brand Color" />
              <FieldBlock>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <input
                      type="color"
                      value={cfg.brandColor ?? 'var(--brand)'}
                      onChange={e => { set('brandColor', e.target.value); applyBrandColor(e.target.value) }}
                      className="w-12 h-12 rounded-xl cursor-pointer border-0 p-0.5"
                      style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--card-border)' }}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>
                      Accent color — used across all public pages
                    </p>
                    <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      {cfg.brandColor ?? 'var(--brand)'}
                    </p>
                  </div>
                  {/* Quick presets — to add more colors just add to this array */}
                  <div className="flex flex-wrap gap-2 ml-auto">
                    {[
                      { hex: '#C9A84C', name: 'Champagne Gold' },
                      { hex: '#9B2335', name: 'Burgundy' },
                      { hex: '#2E5FA3', name: 'Royal Blue' },
                      { hex: '#673147', name: 'Deep Plum' },
                      { hex: '#C4817A', name: 'Rose Gold' },
                      { hex: '#2A7F7F', name: 'Teal' },
                      { hex: '#8B6914', name: 'Antique Gold' },
                      { hex: '#5C4033', name: 'Dark Mocha' },
                    ].map(({ hex, name }) => (
                      <button key={hex} onClick={() => { set('brandColor', hex); applyBrandColor(hex) }}
                        className="w-7 h-7 rounded-lg border-2 transition-all hover:scale-110"
                        style={{ backgroundColor: hex, borderColor: cfg.brandColor === hex ? '#fff' : 'transparent' }}
                        title={name}
                      />
                    ))}
                  </div>
                </div>
              </FieldBlock>

              <SectionLabel text="Localization" />
              <FieldBlock>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Show language toggle</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Displays an AR / EN switcher on the public website navbar and mobile menu</p>
                  </div>
                  <Toggle checked={cfg.showLanguageToggle ?? false} onChange={v => set('showLanguageToggle', v)} />
                </div>
              </FieldBlock>
            </>}

            {/* ── LANDING PAGE ── */}
            {section === 'landing' && (() => {
              const hc = cfg.heroConfig ?? {} as HeroConfig
              const setHc = (k: keyof HeroConfig, v: string | string[] | null) =>
                set('heroConfig', { ...hc, [k]: v } as any)

              const panels = [
                { id: 'hero',       label: 'Hero',              icon: '🎬', desc: 'Headline, subtext, buttons & background media' },
                { id: 'dishes',     label: 'Signature Dishes',  icon: '🍽️', desc: 'Featured dish section & card selection' },
                { id: 'relay',      label: 'Food Relay',        icon: '🔥', desc: 'Diagonal image gallery & headline' },
                { id: 'ambience',   label: 'Ambience',          icon: '🌿', desc: 'Space section text & photos' },
                { id: 'reviews',    label: 'Guest Reviews',     icon: '⭐', desc: 'Reviews section headline' },
              ]

              const Accordion = ({ id, children }: { id: string; children: React.ReactNode }) => {
                const panel = panels.find(p => p.id === id)!
                const open = openPanel === id
                return (
                  <div className="rounded-2xl overflow-hidden mb-3" style={{ border: '1px solid var(--card-border)', backgroundColor: open ? 'var(--card-bg)' : 'transparent' }}>
                    <button type="button" onClick={() => setOpenPanel(open ? '' : id)}
                      className="w-full flex items-center gap-3 px-5 py-4 text-left transition-all"
                      style={{ backgroundColor: open ? 'rgba(var(--brand-rgb),0.05)' : 'transparent' }}>
                      <span className="text-lg">{panel.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{panel.label}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{panel.desc}</p>
                      </div>
                      <ChevronDown size={16} style={{ color: 'var(--text-muted)', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }} />
                    </button>
                    {open && <div className="px-5 pb-5 pt-2 space-y-5">{children}</div>}
                  </div>
                )
              }

              return <>
                {/* HERO */}
                <Accordion id="hero">
                  <div className="space-y-4">
                    {([
                      { key: 'line1',     keyAr: 'line1Ar',     label: 'Headline line 1', placeholder: 'Taste of',                              placeholderAr: 'طعم'                              },
                      { key: 'line2',     keyAr: 'line2Ar',     label: 'Headline line 2', placeholder: 'Kerala',                                placeholderAr: 'كيرالا'                            },
                      { key: 'subtext',   keyAr: 'subtextAr',   label: 'Sub-text',        placeholder: 'Authentic South Indian cuisine · Dubai', placeholderAr: 'مطبخ جنوب الهند الأصيل · دبي'   },
                      { key: 'badgeText', keyAr: 'badgeTextAr', label: 'Badge text',      placeholder: 'Now Open · Dubai, UAE',                  placeholderAr: 'مفتوح الآن · دبي'                },
                    ] as { key: keyof HeroConfig; keyAr: keyof HeroConfig; label: string; placeholder: string; placeholderAr: string }[]).map(f => (
                      <BilingualField key={f.key as string}
                        label={f.label}
                        valueEn={(hc[f.key] as string) ?? ''}
                        valueAr={(hc[f.keyAr] as string) ?? ''}
                        placeholder={f.placeholder}
                        placeholderAr={f.placeholderAr}
                        onChangeEn={v => setHc(f.key, v)}
                        onChangeAr={v => setHc(f.keyAr, v)}
                      />
                    ))}
                  </div>
                  <div className="pt-1 border-t" style={{ borderColor: 'var(--card-border)' }}>
                    <p className="text-xs font-semibold mb-3 mt-3" style={{ color: 'var(--text-muted)' }}>Buttons</p>
                    <div className="space-y-4">
                      <BilingualField label="Primary button"
                        valueEn={hc.ctaLabel ?? ''} valueAr={hc.ctaLabelAr ?? ''}
                        placeholder="Order Now" placeholderAr="اطلب الآن"
                        onChangeEn={v => setHc('ctaLabel', v)} onChangeAr={v => setHc('ctaLabelAr', v)} />
                      <BilingualField label="Secondary button"
                        valueEn={hc.ctaSecondaryLabel ?? ''} valueAr={hc.ctaSecondaryLabelAr ?? ''}
                        placeholder="Reserve a Table" placeholderAr="احجز طاولة"
                        onChangeEn={v => setHc('ctaSecondaryLabel', v)} onChangeAr={v => setHc('ctaSecondaryLabelAr', v)} />
                    </div>
                  </div>
                  <div className="pt-1 border-t" style={{ borderColor: 'var(--card-border)' }}>
                    <p className="text-xs font-semibold mb-3 mt-3" style={{ color: 'var(--text-muted)' }}>Background media</p>
                    <div className="flex gap-2 mb-4">
                      {(['video', 'image'] as const).map(t => (
                        <button key={t} type="button"
                          onClick={() => setHc('heroMediaType', t)}
                          className="flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all"
                          style={{
                            backgroundColor: (hc.heroMediaType ?? 'video') === t ? 'var(--brand)' : 'var(--card-bg)',
                            color: (hc.heroMediaType ?? 'video') === t ? '#000' : 'var(--text-muted)',
                            border: '1px solid var(--card-border)',
                          }}>
                          {t === 'video' ? '🎬 Video' : '🖼️ Image'}
                        </button>
                      ))}
                    </div>
                    {(hc.heroMediaType ?? 'video') === 'video' ? (
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Upload video (MP4)</p>
                          <label className="flex items-center justify-center gap-2 w-full py-3 rounded-xl cursor-pointer transition-all text-sm font-semibold"
                            style={{ border: '1.5px dashed rgba(var(--brand-rgb),0.4)', color: 'var(--brand)', backgroundColor: 'rgba(var(--brand-rgb),0.04)' }}>
                            {videoUploading ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : <><Zap size={14} /> Choose MP4 file</>}
                            <input type="file" accept="video/mp4,video/*" className="hidden" disabled={videoUploading}
                              onChange={async e => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                setVideoUploading(true)
                                try { const url = await uploadVideo(file); setHc('videoUrl', url); toast.success('Video uploaded!') }
                                catch (err: any) { toast.error(err.message ?? 'Upload failed') }
                                finally { setVideoUploading(false) }
                              }} />
                          </label>
                          {hc.videoUrl && <p className="text-[10px] mt-1.5 truncate" style={{ color: 'var(--text-muted)' }}>✓ {hc.videoUrl}</p>}
                        </div>
                        <div>
                          <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Or paste video URL</p>
                          <Inp value={hc.videoUrl ?? ''} onChange={v => setHc('videoUrl', v)} placeholder="https://…/hero.mp4" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Poster image (shown while video loads)</p>
                          <ImageUpload value={hc.posterUrl ?? ''} onChange={v => setHc('posterUrl', v ?? '')}
                            folder="almanzil/hero" publicId="hero-poster" aspectRatio="video" hint="1920 × 1080 px" />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Hero background image</p>
                        <ImageUpload value={hc.heroImageUrl ?? ''} onChange={v => setHc('heroImageUrl', v ?? '')}
                          folder="almanzil/hero" publicId="hero-image" aspectRatio="video" hint="1920 × 1080 px, landscape" />
                      </div>
                    )}
                  </div>
                </Accordion>

                {/* DISHES */}
                <Accordion id="dishes">
                  <div className="space-y-4 mb-5 pb-5" style={{ borderBottom: '1px solid var(--card-border)' }}>
                    <BilingualField label="Section eyebrow label"
                      valueEn={hc.dishesSubtext ?? ''} valueAr={hc.dishesSubtextAr ?? ''}
                      placeholder="Signature Dishes" placeholderAr="أطباقنا المميزة"
                      onChangeEn={v => setHc('dishesSubtext', v)} onChangeAr={v => setHc('dishesSubtextAr', v)} />
                    <BilingualField label="Section headline"
                      valueEn={hc.dishesHeadline ?? ''} valueAr={hc.dishesHeadlineAr ?? ''}
                      placeholder="Dishes you'll dream about." placeholderAr="أطباق ستحلم بها."
                      onChangeEn={v => setHc('dishesHeadline', v)} onChangeAr={v => setHc('dishesHeadlineAr', v)} />
                  </div>
                  <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Dish Cards</p>
                  <div>
                  <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                    Pick dishes to feature on the landing page. They rotate 6 at a time. Leave empty to auto-show top dishes.
                  </p>
                  {menuItems.length === 0 ? (
                    <p className="text-xs py-3 text-center" style={{ color: 'var(--text-muted)' }}>Loading menu items…</p>
                  ) : (() => {
                    const categories = ['All', ...Array.from(new Set(menuItems.map(i => i.category?.name).filter(Boolean) as string[]))]
                    const filtered = menuItems.filter(i =>
                      (dishCat === 'All' || i.category?.name === dishCat) &&
                      (!dishQ || i.name.toLowerCase().includes(dishQ.toLowerCase()))
                    )
                    return (
                      <>
                        {/* Search + category filters */}
                        <div className="flex flex-col gap-2 mb-3">
                          <input
                            value={dishQ} onChange={e => setDishQ(e.target.value)}
                            placeholder="Search dishes…"
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }}
                          />
                          <div className="flex gap-1.5 flex-wrap">
                            {categories.map(cat => (
                              <button key={cat} type="button" onClick={() => setDishCat(cat)}
                                className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all"
                                style={{
                                  backgroundColor: dishCat === cat ? 'var(--brand)' : 'var(--card-bg)',
                                  color: dishCat === cat ? '#000' : 'var(--text-muted)',
                                  border: `1px solid ${dishCat === cat ? 'var(--brand)' : 'var(--card-border)'}`,
                                }}>
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-1">
                          {filtered.map(item => {
                            const selected = (hc.signatureDishIds ?? []).includes(item.id)
                            const count = (hc.signatureDishIds ?? []).length
                            const atCap = !selected && count >= 12
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  if (atCap) { toast.error('Remove a dish first — max 12 selected'); return }
                                  const ids = hc.signatureDishIds ?? []
                                  setHc('signatureDishIds', selected ? ids.filter(id => id !== item.id) : [...ids, item.id])
                                }}
                                className="flex items-center gap-3 p-2.5 rounded-xl text-left transition-all"
                                style={{
                                  border: selected ? '1.5px solid var(--brand)' : '1px solid var(--card-border)',
                                  backgroundColor: selected ? 'rgba(var(--brand-rgb),0.08)' : 'var(--card-bg)',
                                  opacity: atCap ? 0.4 : 1,
                                  cursor: atCap ? 'not-allowed' : 'pointer',
                                }}
                              >
                                <div className="relative flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden">
                                  {item.imageUrl
                                    ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                    : <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)' }}><UtensilsCrossed size={16} style={{ color: 'var(--brand)' }} /></div>
                                  }
                                  {selected && (
                                    <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.7)' }}>
                                      <CheckCircle2 size={16} className="text-black" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold truncate" style={{ color: selected ? 'var(--brand)' : 'var(--text-primary)' }}>{item.name}</p>
                                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                                    {item.category?.name && <span className="mr-1.5">{item.category.name} ·</span>}AED {item.price}
                                  </p>
                                </div>
                              </button>
                            )
                          })}
                          {filtered.length === 0 && <p className="text-xs col-span-2 py-4 text-center" style={{ color: 'var(--text-muted)' }}>No dishes match</p>}
                        </div>
                      </>
                    )
                  })()}
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{(hc.signatureDishIds ?? []).length}/12 selected</p>
                    {(hc.signatureDishIds ?? []).length > 0 && (
                      <button type="button" onClick={() => setHc('signatureDishIds', [])}
                        className="flex items-center gap-1 text-xs transition-colors hover:opacity-70"
                        style={{ color: 'var(--text-muted)' }}>
                        <Trash2 size={11} /> Clear &amp; use live menu
                      </button>
                    )}
                  </div>
                  </div>
                </Accordion>

                {/* FOOD RELAY */}
                <Accordion id="relay">
                  <div className="space-y-4">
                    <BilingualField label="Eyebrow label"
                      valueEn={hc.relayTagline ?? ''} valueAr={hc.relayTaglineAr ?? ''}
                      placeholder="The Kitchen's Finest" placeholderAr="أجود ما في المطبخ"
                      onChangeEn={v => setHc('relayTagline', v)} onChangeAr={v => setHc('relayTaglineAr', v)} />
                    <BilingualField label="Headline line 1 (white)"
                      valueEn={hc.relayHeadline ?? ''} valueAr={hc.relayHeadlineAr ?? ''}
                      placeholder="Made fresh," placeholderAr="يُحضَّر طازجاً،"
                      onChangeEn={v => setHc('relayHeadline', v)} onChangeAr={v => setHc('relayHeadlineAr', v)} />
                    <BilingualField label="Headline line 2 (gold gradient)"
                      valueEn={hc.relayHeadlinePart2 ?? ''} valueAr={hc.relayHeadlinePart2Ar ?? ''}
                      placeholder="every single day." placeholderAr="كل يوم بلا استثناء."
                      onChangeEn={v => setHc('relayHeadlinePart2', v)} onChangeAr={v => setHc('relayHeadlinePart2Ar', v)} />
                  </div>
                </Accordion>

                {/* AMBIENCE */}
                <Accordion id="ambience">
                  <div className="space-y-4">
                    <BilingualField label="Eyebrow label"
                      valueEn={hc.ambienceTagline ?? ''} valueAr={hc.ambienceTaglineAr ?? ''}
                      placeholder="The Space" placeholderAr="المكان"
                      onChangeEn={v => setHc('ambienceTagline', v)} onChangeAr={v => setHc('ambienceTaglineAr', v)} />
                    <BilingualField label="Headline line 1 (white)"
                      valueEn={hc.ambienceHeadline ?? ''} valueAr={hc.ambienceHeadlineAr ?? ''}
                      placeholder="Come for the food." placeholderAr="تعال من أجل الطعام."
                      onChangeEn={v => setHc('ambienceHeadline', v)} onChangeAr={v => setHc('ambienceHeadlineAr', v)} />
                    <BilingualField label="Headline line 2 (gold gradient)"
                      valueEn={hc.ambienceHeadlinePart2 ?? ''} valueAr={hc.ambienceHeadlinePart2Ar ?? ''}
                      placeholder="Stay for the feeling." placeholderAr="وابقَ من أجل التجربة."
                      onChangeEn={v => setHc('ambienceHeadlinePart2', v)} onChangeAr={v => setHc('ambienceHeadlinePart2Ar', v)} />
                  </div>
                  {/* AMBIENCE IMAGES — dynamic array */}
                  <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--card-border)' }}>
                    <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Ambience Photos</p>
                    <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                      Add as many photos as you like. First 4 show at once; extras rotate automatically every 6 s.
                    </p>
                    {(() => {
                      const imgs: string[] = Array.isArray(hc.ambienceImages) ? hc.ambienceImages : []
                      const setImgs = (next: string[]) => setHc('ambienceImages', next)
                      return (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-4">
                            {imgs.map((url, idx) => (
                              <div key={idx} className="relative">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Photo {idx + 1}</p>
                                  <button type="button" onClick={() => setImgs(imgs.filter((_, i) => i !== idx))}
                                    className="flex items-center gap-1 text-xs transition-colors hover:opacity-70"
                                    style={{ color: '#ef4444' }}>
                                    <Trash2 size={11} /> Remove
                                  </button>
                                </div>
                                <ImageUpload
                                  value={url}
                                  onChange={v => { const next = [...imgs]; next[idx] = v ?? ''; setImgs(next) }}
                                  folder="almanzil/ambience"
                                  publicId={`amb${idx + 1}`}
                                  aspectRatio="free"
                                  hint="Recommended: 1400 × 900 px"
                                />
                              </div>
                            ))}
                          </div>
                          <button type="button"
                            onClick={() => setImgs([...imgs, ''])}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
                            style={{ border: '1.5px dashed var(--card-border)', color: 'var(--brand)', backgroundColor: 'rgba(var(--brand-rgb),0.04)' }}>
                            <Plus size={15} /> Add photo
                          </button>
                          <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>{imgs.length} photo{imgs.length !== 1 ? 's' : ''} added</p>
                        </>
                      )
                    })()}
                  </div>
                </Accordion>

                {/* REVIEWS */}
                <Accordion id="reviews">
                  <BilingualField label="Section headline"
                    valueEn={hc.reviewsHeadline ?? ''} valueAr={hc.reviewsHeadlineAr ?? ''}
                    placeholder="Loved by every table" placeholderAr="محبوب على كل طاولة"
                    onChangeEn={v => setHc('reviewsHeadline', v)} onChangeAr={v => setHc('reviewsHeadlineAr', v)} />
                </Accordion>
              </>
            })()}

            {/* ── HOURS ── */}
            {section === 'hours' && <>
              <SectionLabel text="Daily schedule" />
              <FieldBlock>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Opens at</p>
                    <TimePick value={cfg.openTime} onChange={v => set('openTime', v)} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Closes at</p>
                    <TimePick value={cfg.closeTime} onChange={v => set('closeTime', v)} />
                  </div>
                </div>
              </FieldBlock>
              <SectionLabel text="Visual timeline" />
              <div className="p-5">
                <div className="flex justify-between text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                  {['12 AM','6 AM','12 PM','6 PM','12 AM'].map((l, i) => <span key={i}>{l}</span>)}
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--card-border)' }}>
                  <div className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{ marginLeft: `${(openH / 24) * 100}%`, width: `${(openHrs / 24) * 100}%` }} />
                </div>
                <div className="flex justify-between mt-3">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{cfg.openTime} – {cfg.closeTime}</p>
                  <p className="text-xs font-bold text-blue-500">{openHrs}h open daily</p>
                </div>
              </div>
            </>}

            {/* ── TABLES ── */}
            {section === 'tables' && <>
              <Row label="Total tables" desc="Physical tables on your restaurant floor">
                <Stepper value={cfg.totalTables} onChange={v => set('totalTables', v)} min={1} max={50} />
              </Row>
              <Row label="Default capacity" desc="Default seats per table" border={false}>
                <Stepper value={cfg.defaultCapacity} onChange={v => set('defaultCapacity', v)} min={2} max={20} suffix=" seats" />
              </Row>
              <SectionLabel text="Floor preview" />
              <div className="p-5">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Layout</p>
                  <p className="text-xs font-bold" style={{ color: 'var(--brand)' }}>{cfg.totalTables} tables · {cfg.totalTables * cfg.defaultCapacity} seats total</p>
                </div>
                <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--muted-bg)' }}>
                  <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(cfg.totalTables, 12)}, minmax(0, 1fr))` }}>
                    {Array.from({ length: cfg.totalTables }).map((_, i) => (
                      <div key={i} className="aspect-square rounded-lg flex items-center justify-center"
                        style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
                        <span className="text-[9px] font-bold text-emerald-500">{i + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>}

            {/* ── ORDERS & VAT ── */}
            {section === 'orders' && <>
              <Row label="VAT rate" desc="UAE standard is 5% · applied to all orders">
                <Stepper value={vatPct} onChange={v => set('vatRate', v / 100)} min={0} max={30} suffix="%" />
              </Row>
              <SectionLabel text="Currency" />
              <FieldBlock>
                <div className="max-w-xs">
                  <Sel value={cfg.currency} onChange={v => set('currency', v)} options={CURRENCIES.map(c => ({ value: c, label: c }))} />
                </div>
              </FieldBlock>
              <SectionLabel text="Kitchen" />
              <div className="px-6 py-4 border-b border-[var(--card-border)]">
                <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>Default prep time</p>
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Fallback when no per-item prep time is set</p>
                <Slider value={cfg.defaultPrepTimeMins} min={5} max={60} step={5} unit="min" onChange={v => set('defaultPrepTimeMins', v)} />
              </div>
              <div className="px-6 py-4">
                <Hint>At {vatPct}%, an AED 100 order includes <strong>AED {vatPct}</strong> VAT. Set to 0 to disable.</Hint>
              </div>
            </>}

            {/* ── BOOKINGS ── */}
            {section === 'bookings' && <>
              <SectionLabel text="General" />
              <Row label="Accept online bookings" desc="Turn off to go walk-in only">
                <Toggle checked={cfg.bookingsEnabled} onChange={v => set('bookingsEnabled', v)} />
              </Row>
              <Row label="Require login to book" desc="Guests must sign in before confirming" border={false}>
                <Toggle checked={cfg.requireLoginToBook} onChange={v => set('requireLoginToBook', v)} />
              </Row>
              <SectionLabel text="Slot settings" />
              <FieldBlock>
                <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Slot duration</p>
                <div className="max-w-xs">
                  <Sel value={cfg.slotDurationMins} onChange={v => set('slotDurationMins', Number(v))}
                    options={[{ value: 30, label: '30 minutes' }, { value: 60, label: '60 minutes' }]} />
                </div>
              </FieldBlock>
              <div className="px-6 py-4 border-b border-[var(--card-border)]">
                <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>Booking window</p>
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>How far ahead guests can book online</p>
                <Slider value={cfg.maxBookingDaysAhead} min={1} max={30} unit="days" onChange={v => set('maxBookingDaysAhead', v)} />
              </div>
              <SectionLabel text="Walk-ins" />
              <div className="px-6 py-4 border-b border-[var(--card-border)]">
                <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>Walk-in buffer</p>
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Tables always kept free — never bookable online</p>
                <Slider value={cfg.walkInBuffer} min={0} max={Math.max(cfg.totalTables, 1)} unit="tables" onChange={v => set('walkInBuffer', v)} />
              </div>
              <SectionLabel text="Peak hours" />
              <Row label="Block online bookings during peak" desc="Walk-ins only in busy periods" border={cfg.peakHoursEnabled}>
                <Toggle checked={cfg.peakHoursEnabled} onChange={v => set('peakHoursEnabled', v)} />
              </Row>
              {cfg.peakHoursEnabled && (
                <FieldBlock border={false}>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Peak start</p>
                      <TimePick value={cfg.peakStart} onChange={v => set('peakStart', v)} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Peak end</p>
                      <TimePick value={cfg.peakEnd} onChange={v => set('peakEnd', v)} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <Hint>Walk-ins only between {cfg.peakStart} and {cfg.peakEnd}. Online booking resumes after.</Hint>
                  </div>
                </FieldBlock>
              )}
            </>}

            {/* ── Bill & Receipt ── */}
            {section === 'bill' && cfg && (() => {
              const bill: BillConfig = { ...DEFAULT_BILL_CONFIG, ...(cfg.billConfig ?? {}) }
              const setBill = (patch: Partial<BillConfig>) => set('billConfig', { ...bill, ...patch })

              const sampleData = {
                sessionId: 'preview',
                table: { name: 'Table 4' },
                orders: [{
                  id: '1', createdAt: new Date().toISOString(),
                  user: { name: 'Ahmed Al-Rashid' },
                  approvedBy: { name: 'Staff', role: 'STAFF' },
                  items: [
                    { menuItem: { name: 'Malabar Biriyani' }, quantity: 2, unitPrice: 55, total: 110, modifiers: [{ option: { name: 'Extra Spicy', priceAdd: 0 } }] },
                    { menuItem: { name: 'Masala Dosa' },      quantity: 1, unitPrice: 22, total: 22,  modifiers: [] },
                    { menuItem: { name: 'Fresh Lime Juice' }, quantity: 2, unitPrice: 15, total: 30,  modifiers: [] },
                  ],
                }],
                summary: { subtotal: 154.29, vatAmount: 7.71, total: 162 },
                restaurant: {
                  restaurantName: cfg.restaurantName ?? 'Al Manzil',
                  tagline: cfg.tagline, address: cfg.address, phone: cfg.phone,
                  logoUrl: cfg.logoUrl, vatNumber: cfg.vatNumber ?? bill.vatNumber,
                  vatRate: cfg.vatRate, billConfig: bill,
                },
              }

              const TogRow = ({ label, desc, field, border }: { label: string; desc?: string; field: keyof BillConfig; border?: boolean }) => (
                <Row label={label} desc={desc} border={border}>
                  <Toggle checked={!!bill[field]} onChange={v => setBill({ [field]: v })} />
                </Row>
              )

              const billPanels = [
                { id: 'paper',   label: 'Paper & Layout', icon: '📄', desc: 'Size, font, orientation' },
                { id: 'header',  label: 'Header',         icon: '🏷️', desc: 'Logo, restaurant info, VAT number' },
                { id: 'details', label: 'Order Details',  icon: '📋', desc: 'What to show on each line' },
                { id: 'footer',  label: 'Footer',         icon: '✏️', desc: 'Thank-you message, WiFi, socials' },
              ]

              const BillAccordion = ({ id, children }: { id: string; children: React.ReactNode }) => {
                const panel = billPanels.find(p => p.id === id)!
                const open = openPanel === `bill-${id}`
                return (
                  <div className="rounded-2xl overflow-hidden mb-3" style={{ border: '1px solid var(--card-border)', backgroundColor: open ? 'var(--card-bg)' : 'transparent' }}>
                    <button type="button" onClick={() => setOpenPanel(open ? '' : `bill-${id}`)}
                      className="w-full flex items-center gap-3 px-5 py-4 text-left transition-all"
                      style={{ backgroundColor: open ? 'rgba(var(--brand-rgb),0.05)' : 'transparent' }}>
                      <span className="text-lg">{panel.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{panel.label}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{panel.desc}</p>
                      </div>
                      <ChevronDown size={16} style={{ color: 'var(--text-muted)', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }} />
                    </button>
                    {open && <div className="px-5 pb-5 pt-2">{children}</div>}
                  </div>
                )
              }

              const PAPER_PX: Record<string, string> = { '80mm': '302px', 'A5': '420px', 'A4': '595px' }
              const PreviewPanel = () => (
                <div className="rounded-2xl border border-[var(--card-border)] shadow-sm p-4 flex flex-col items-center overflow-auto max-h-[75vh]" style={{ backgroundColor: '#e5e7eb' }}>
                  <div style={{ width: PAPER_PX[bill.paperSize], flexShrink: 0 }} className="shadow-xl rounded overflow-hidden">
                    <BillReceipt data={sampleData as any} config={bill} receiptNumber="00000001" />
                  </div>
                </div>
              )

              return (
                <>
                  {/* Mobile preview button */}
                  <div className="xl:hidden mb-4">
                    <button type="button" onClick={() => setOpenPanel(openPanel === 'bill-preview' ? '' : 'bill-preview')}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border border-[var(--card-border)] transition-colors"
                      style={{ backgroundColor: openPanel === 'bill-preview' ? 'var(--brand)' : 'transparent', color: openPanel === 'bill-preview' ? '#000' : 'var(--text-muted)' }}>
                      <Receipt size={14} />
                      {openPanel === 'bill-preview' ? 'Hide Preview' : 'Show Preview'}
                    </button>
                    {openPanel === 'bill-preview' && (
                      <div className="mt-3">
                        <PreviewPanel />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                    {/* Accordions */}
                    <div>
                      <BillAccordion id="paper">
                        <Row label="Paper size" desc="Thermal printers use 80mm; A5/A4 for laser/inkjet">
                          <Sel value={bill.paperSize} onChange={v => setBill({ paperSize: v as BillConfig['paperSize'] })}
                            options={[{ value: '80mm', label: '80mm Thermal' }, { value: 'A5', label: 'A5' }, { value: 'A4', label: 'A4' }]} />
                        </Row>
                        <Row label="Font size" border={false}>
                          <Sel value={bill.fontSize} onChange={v => setBill({ fontSize: v as BillConfig['fontSize'] })}
                            options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }]} />
                        </Row>
                      </BillAccordion>

                      <BillAccordion id="header">
                        <TogRow label="Show logo" field="showLogo" />
                        <Row label="VAT registration number" desc="Printed below restaurant name">
                          <Inp value={cfg.vatNumber ?? ''} onChange={v => set('vatNumber', v)} placeholder="e.g. 100123456700003" />
                        </Row>
                        <Row label="Show table name" border={false}>
                          <Toggle checked={bill.showTableNumber} onChange={v => setBill({ showTableNumber: v })} />
                        </Row>
                      </BillAccordion>

                      <BillAccordion id="details">
                        <TogRow label="Show waiter name"    field="showWaiterName" />
                        <TogRow label="Show order time"     field="showOrderTime" />
                        <TogRow label="Show modifiers"      field="showModifiers"     desc="Size / extras chosen by customer" />
                        <TogRow label="Show unit price"     field="showUnitPrice" />
                        <TogRow label="Show VAT breakdown"  field="showVatBreakdown"  desc="Subtotal + VAT lines before total" />
                        <TogRow label="Show service charge" field="showServiceCharge" border={false} />
                      </BillAccordion>

                      <BillAccordion id="footer">
                        <Row label="Thank-you message">
                          <Inp value={bill.footerMessage} onChange={v => setBill({ footerMessage: v })} placeholder="Thank you for dining with us!" />
                        </Row>
                        <Row label="WiFi name">
                          <Inp value={bill.wifiName} onChange={v => setBill({ wifiName: v })} placeholder="AlManzilGuest" />
                        </Row>
                        <Row label="WiFi password">
                          <Inp value={bill.wifiPass} onChange={v => setBill({ wifiPass: v })} placeholder="password123" />
                        </Row>
                        <Row label="Socials / tagline" desc="One line at the bottom" border={false}>
                          <Inp value={bill.socialsLine} onChange={v => setBill({ socialsLine: v })} placeholder="@almanzil · instagram.com/almanzil" />
                        </Row>
                      </BillAccordion>
                    </div>

                    {/* Sticky preview — desktop only */}
                    <div className="hidden xl:block sticky top-6 self-start">
                      <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>Live Preview</p>
                      <PreviewPanel />
                    </div>
                  </div>
                </>
              )
            })()}

          </div>
        </div>
      </div>
    </div>
  )
}
