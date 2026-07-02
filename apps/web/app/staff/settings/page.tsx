'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Store, Clock, Table2, ShoppingBag, CalendarDays,
  Save, MapPin, Phone, Loader2, CheckCircle2,
  Globe, WifiOff, Minus, Plus, ChevronDown,
  Zap, ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import ImageUpload from '@/components/ui/ImageUpload'
import toast from 'react-hot-toast'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

type Cfg = {
  restaurantName: string; tagline: string; phone: string; address: string; logoUrl: string
  openTime: string; closeTime: string; timezone: string
  totalTables: number; defaultCapacity: number; vatRate: number; currency: string; defaultPrepTimeMins: number
  bookingsEnabled: boolean; slotDurationMins: number; walkInBuffer: number; peakHoursEnabled: boolean
  peakStart: string; peakEnd: string; noShowWindowOffPeak: number; noShowWindowPeak: number
  maxBookingDaysAhead: number; requireLoginToBook: boolean; remindersEnabled: boolean; reminderMinsBefore: number
}

const UPDATABLE: (keyof Cfg)[] = [
  'restaurantName','tagline','phone','address','logoUrl','openTime','closeTime','timezone',
  'totalTables','defaultCapacity','vatRate','currency','defaultPrepTimeMins',
  'bookingsEnabled','slotDurationMins','walkInBuffer','peakHoursEnabled',
  'peakStart','peakEnd','noShowWindowOffPeak','noShowWindowPeak',
  'maxBookingDaysAhead','requireLoginToBook','remindersEnabled','reminderMinsBefore',
]

const TIMEZONES = ['Asia/Dubai','Asia/Riyadh','Asia/Kuwait','Asia/Bahrain','Asia/Qatar','Asia/Muscat']
const CURRENCIES = ['AED','SAR','KWD','BHD','QAR','OMR']

type SectionId = 'restaurant' | 'hours' | 'tables' | 'orders' | 'bookings'

const NAV: { id: SectionId; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'restaurant',    label: 'Restaurant',    icon: Store,        desc: 'Name, logo & contact' },
  { id: 'hours',         label: 'Opening Hours', icon: Clock,        desc: 'Daily open & close times' },
  { id: 'tables',        label: 'Tables',        icon: Table2,       desc: 'Capacity & floor layout' },
  { id: 'orders',        label: 'Orders & VAT',  icon: ShoppingBag,  desc: 'Tax rate, currency & prep' },
  { id: 'bookings',      label: 'Bookings',      icon: CalendarDays, desc: 'Reservations & slots' },
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

  const load = useCallback(() => {
    setLoadErr(false)
    fetch(`${API}/settings`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => { const s = d?.data ?? d; setCfg(s); setOriginal(s) })
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Restaurant name</p>
                    <Inp value={cfg.restaurantName} onChange={v => set('restaurantName', v)} placeholder="Al Manzil" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Tagline</p>
                    <Inp value={cfg.tagline} onChange={v => set('tagline', v)} placeholder="Authentic Kerala cuisine" />
                  </div>
                </div>
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
                  onChange={v => set('logoUrl', v)}
                  folder="almanzil/logo"
                  publicId="logo"
                  hint="Square image · min 256 × 256 px · uploads directly to CDN"
                  aspectRatio="square"
                  className="max-w-[160px]"
                />
              </FieldBlock>
              <SectionLabel text="Preview" />
              <div className="p-5">
                <div className="rounded-xl overflow-hidden" style={{ background: 'linear-gradient(120deg,#ea580c,#f59e0b)' }}>
                  <div className="px-4 py-3.5 flex items-center gap-3.5">
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-xl border-2 border-white/20 overflow-hidden flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                        {cfg.logoUrl
                          ? <img src={cfg.logoUrl} alt="" className="w-full h-full object-cover" />
                          : <Store size={14} className="text-white/50" />}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{cfg.restaurantName || <span className="opacity-30">Name</span>}</p>
                      <p className="text-xs text-white/60 truncate">{cfg.tagline || <span className="opacity-25">Tagline</span>}</p>
                      <div className="flex gap-3 mt-1 flex-wrap">
                        {cfg.address && <span className="text-[10px] text-white/50 flex items-center gap-0.5"><MapPin size={7} />{cfg.address}</span>}
                        {cfg.phone && <span className="text-[10px] text-white/50 flex items-center gap-0.5"><Phone size={7} />{cfg.phone}</span>}
                        <span className="text-[10px] text-white/50 flex items-center gap-0.5"><Globe size={7} />{cfg.currency}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>}

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


          </div>
        </div>
      </div>
    </div>
  )
}
