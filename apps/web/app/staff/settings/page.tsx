'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Store, Clock, Table2, ShoppingBag, CalendarDays,
  Save, Loader2, CheckCircle2,
  WifiOff, ChevronRight, Layout, Receipt, ChefHat, Shield, Mail, Tag,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import toast from 'react-hot-toast'
import { UPDATABLE, type Cfg, type SectionId, type NavItem } from './sections/_types'
import RestaurantSection from './sections/RestaurantSection'
import HoursSection from './sections/HoursSection'
import TablesSection from './sections/TablesSection'
import OrdersSection from './sections/OrdersSection'
import BookingsSection from './sections/BookingsSection'
import LandingSection from './sections/LandingSection'
import BillSection from './sections/BillSection'
import KitchenSection from './sections/KitchenSection'
import RolesSection from './sections/RolesSection'
import EmailSection from './sections/EmailSection'
import OffersSection from './sections/OffersSection'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

const NAV: NavItem[] = [
  { id: 'restaurant',    label: 'Restaurant',      icon: Store,        desc: 'Name, logo, contact & hours' },
  { id: 'landing',       label: 'Landing Page',    icon: Layout,       desc: 'Hero, sections & text' },
  { id: 'tables',        label: 'Tables & Orders', icon: Table2,       desc: 'Floor layout, VAT & currency' },
  { id: 'bookings',      label: 'Bookings',        icon: CalendarDays, desc: 'Reservations & slots' },
  { id: 'bill',          label: 'Bill & Receipt',  icon: Receipt,      desc: 'Print layout & PDF design' },
  { id: 'offers',        label: 'Offers',          icon: Tag,          desc: 'Seasonal discounts & promotions' },
  { id: 'kitchen',       label: 'Kitchen',         icon: ChefHat,      desc: 'KDS screen & thermal printer' },
  { id: 'roles',         label: 'Roles & Access',  icon: Shield,       desc: 'Custom roles & module permissions' },
  { id: 'email',         label: 'Email',           icon: Mail,         desc: 'SMTP, sender identity & templates' },
]

type MenuItem = { id: string; name: string; description: string | null; price: string; prepTimeMins: number; imageUrl: string | null; category?: { name: string } }
export type RestaurantTable = { id: string; tableNumber: number; name: string | null; capacity: number; isActive: boolean; isReservable: boolean }

export default function SettingsPage() {
  const { token } = useAuthStore()
  const searchParams = useSearchParams()
  const [cfg, setCfg]           = useState<Cfg | null>(null)
  const [original, setOriginal] = useState<Cfg | null>(null)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [loadErr, setLoadErr]   = useState(false)
  const [section, setSection]   = useState<SectionId>((searchParams.get('section') as SectionId) ?? 'restaurant')
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [tables, setTables]     = useState<RestaurantTable[]>([])
  const [videoUploading, setVideoUploading] = useState(false)
  const [openPanel, setOpenPanel] = useState<string>('hero')

  useEffect(() => {
    if (section !== 'bookings') return
    fetch(`${API}/tables`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json()).then(d => setTables(d?.data ?? d ?? [])).catch(() => {})
  }, [section, token])

  useEffect(() => {
    if (section !== 'landing') return
    fetch(`${API}/menu/items`).then(r => r.json())
      .then(j => setMenuItems((j?.data ?? j ?? []).filter((i: MenuItem) => i.imageUrl || (i as any).videoUrl)))
      .catch(() => {})
  }, [section])

  const load = useCallback(() => {
    setLoadErr(false)
    fetch(`${API}/settings`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => {
        const s = d?.data ?? d
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
    if (!anyDirty) { toast('Already up to date'); return }
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

  const vatPct  = Number((Number(cfg.vatRate) * 100).toFixed(1))
  const active  = NAV.find(n => n.id === section)!

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ══ Secondary sidebar ══════════════════════════════════════════════════ */}
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0 border-r border-[var(--card-border)] overflow-y-auto"
        style={{ backgroundColor: 'var(--card-bg)' }}>

        {/* Header */}
        <div className="h-14 flex items-center px-4 border-b border-[var(--card-border)] flex-shrink-0">
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
                <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r transition-all"
                  style={{ backgroundColor: isActive ? 'var(--brand)' : 'transparent' }} />
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                  style={{ backgroundColor: isActive ? 'var(--brand)' : 'var(--muted-bg)' }}>
                  <Icon size={13} style={{ color: isActive ? 'white' : 'var(--text-muted)' }} />
                </div>
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
        <div className="h-14 flex-shrink-0 flex items-center justify-between gap-4 px-5 border-b border-[var(--card-border)]"
          style={{ backgroundColor: 'var(--card-bg)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <active.icon size={14} style={{ color: 'var(--brand)', flexShrink: 0 }} />
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{active.label}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={discard} disabled={!anyDirty}
              className="text-xs px-3 py-1.5 rounded-lg border transition-all disabled:opacity-30"
              style={{ color: 'var(--text-muted)', borderColor: 'var(--card-border)', backgroundColor: 'var(--input-bg)' }}>
              Discard
            </button>
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1.5 text-xs font-semibold text-white px-4 py-1.5 rounded-lg disabled:opacity-50 transition-all"
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

            {section === 'restaurant' && (
              <>
                <RestaurantSection cfg={cfg} set={set} />
                <HoursSection cfg={cfg} set={set} />
              </>
            )}

            {section === 'landing' && (
              <LandingSection
                cfg={cfg}
                set={set}
                menuItems={menuItems}
                videoUploading={videoUploading}
                setVideoUploading={setVideoUploading}
                openPanel={openPanel}
                setOpenPanel={setOpenPanel}
              />
            )}

            {section === 'tables' && (
              <>
                <TablesSection cfg={cfg} set={set} />
                <OrdersSection cfg={cfg} set={set} vatPct={vatPct} />
              </>
            )}

            {section === 'bookings' && <BookingsSection cfg={cfg} set={set} tables={tables} setTables={setTables} token={token ?? ''} saveKey={async (k, v) => {
                const r = await fetch(`${API}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ [k]: v }) })
                if (!r.ok) throw new Error('Failed to save')
                setOriginal(o => o ? { ...o, [k]: v as any } : o)
                set(k, v)
              }} />}

            {section === 'bill' && <BillSection cfg={cfg} set={set} openPanel={openPanel} setOpenPanel={setOpenPanel} />}

            {section === 'offers' && <OffersSection />}

            {section === 'kitchen' && <KitchenSection cfg={cfg} set={set} openPanel={openPanel} setOpenPanel={setOpenPanel} />}

            {section === 'roles' && (
              <div className="p-5">
                <RolesSection />
              </div>
            )}

            {section === 'email' && (
              <EmailSection cfg={cfg} set={set} token={token ?? ''} />
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
