'use client'
import React, { useState } from 'react'
import { Toggle, TimePick, Slider } from './_controls'
import type { Cfg } from './_types'
import type { RestaurantTable } from '../page'
import { Users, Clock, ShieldCheck, Timer, Zap, AlertCircle, Minus, Plus, TriangleAlert } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

interface Props {
  cfg: Cfg
  set: <K extends keyof Cfg>(k: K, v: Cfg[K]) => void
  tables: RestaurantTable[]
  setTables: React.Dispatch<React.SetStateAction<RestaurantTable[]>>
  token: string
  saveKey: <K extends keyof Cfg>(k: K, v: Cfg[K]) => Promise<void>
}

/* ── Section wrapper ─────────────────────────────────────────── */
function Section({ icon: Icon, title, accent, children }: {
  icon: React.ElementType; title: string; accent: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--card-border)' }}>
      <div className="flex items-center gap-3 px-5 py-3.5 border-b" style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${accent}18` }}>
          <Icon size={14} style={{ color: accent }} />
        </div>
        <p className="text-xs font-bold tracking-wide uppercase" style={{ color: 'var(--text-primary)' }}>{title}</p>
      </div>
      {children}
    </div>
  )
}

/* ── Row: toggle on the right ────────────────────────────────── */
function ToggleRow({ label, desc, checked, onChange, divider = true, loading = false }: {
  label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void | Promise<void>; divider?: boolean; loading?: boolean
}) {
  return (
    <div className={`px-5 py-4 flex items-start justify-between gap-4 ${divider ? 'border-b' : ''}`} style={{ borderColor: 'var(--card-border)' }}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {desc && <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{desc}</p>}
      </div>
      {loading
        ? <div className="w-10 h-6 flex items-center justify-center"><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-50" style={{ color: 'var(--brand)' }} /></div>
        : <Toggle checked={checked} onChange={onChange} />}
    </div>
  )
}

/* ── Pill toggle: 2-option choice ────────────────────────────── */
function PillRow<T extends string | number>({ label, desc, options, value, onChange, divider = true }: {
  label: string; desc?: string
  options: { value: T; label: string }[]
  value: T; onChange: (v: T) => void; divider?: boolean
}) {
  return (
    <div className={`px-5 py-4 flex items-center justify-between gap-4 ${divider ? 'border-b' : ''}`} style={{ borderColor: 'var(--card-border)' }}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {desc && <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{desc}</p>}
      </div>
      <div className="flex items-center rounded-lg border overflow-hidden flex-shrink-0" style={{ borderColor: 'var(--card-border)' }}>
        {options.map((o, i) => (
          <button key={String(o.value)} type="button"
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 text-xs font-bold transition-all ${i > 0 ? 'border-l' : ''}`}
            style={{
              borderColor: 'var(--card-border)',
              backgroundColor: value === o.value ? 'var(--brand)' : 'var(--input-bg)',
              color: value === o.value ? '#000' : 'var(--text-muted)',
            }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Number stepper: big display with − + ────────────────────── */
function StepperRow({ label, desc, value, min, max, step = 1, display, onChange, divider = true }: {
  label: string; desc?: string
  value: number; min: number; max: number; step?: number
  display: string
  onChange: (v: number) => void; divider?: boolean
}) {
  return (
    <div className={`px-5 py-4 ${divider ? 'border-b' : ''}`} style={{ borderColor: 'var(--card-border)' }}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
          {desc && <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{desc}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button type="button" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-all disabled:opacity-25"
            style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
            <Minus size={11} />
          </button>
          <span className="text-sm font-bold tabular-nums min-w-[52px] text-center" style={{ color: 'var(--brand)' }}>{display}</span>
          <button type="button" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-all disabled:opacity-25"
            style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
            <Plus size={11} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Real table selector — each table card is clickable ────────── */
function TableSelector({ tables, token, setTables }: {
  tables: RestaurantTable[]
  token: string
  setTables: React.Dispatch<React.SetStateAction<RestaurantTable[]>>
}) {
  const active = tables.filter(t => t.isActive)
  const walkIn = active.filter(t => !t.isReservable).length
  const online = active.filter(t => t.isReservable).length

  const toggle = async (t: RestaurantTable) => {
    const next = !t.isReservable
    setTables(prev => prev.map(p => p.id === t.id ? { ...p, isReservable: next } : p))
    try {
      await fetch(`${API}/tables/${t.id}/reservable`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isReservable: next }),
      })
    } catch {
      setTables(prev => prev.map(p => p.id === t.id ? { ...p, isReservable: t.isReservable } : p))
    }
  }

  if (active.length === 0) {
    return <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>No tables found</p>
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
      {/* Summary */}
      <div className="flex border-b" style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>
        <div className="flex-1 flex items-center justify-center gap-2 py-2.5 border-r" style={{ borderColor: 'var(--card-border)' }}>
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#a78bfa' }} />
          <span className="text-xs font-bold" style={{ color: '#a78bfa' }}>{walkIn} walk-in</span>
        </div>
        <div className="flex-1 flex items-center justify-center gap-2 py-2.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#4ade80' }} />
          <span className="text-xs font-bold" style={{ color: '#4ade80' }}>{online} online</span>
        </div>
      </div>

      {/* Table grid */}
      <div className="p-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2" style={{ backgroundColor: 'var(--card-bg)' }}>
        {active.map(t => {
          const isOnline = t.isReservable
          return (
            <button key={t.id} type="button" onClick={() => toggle(t)}
              className="relative flex flex-col gap-1 p-2.5 rounded-xl transition-all text-left active:scale-95"
              style={isOnline ? {
                backgroundColor: 'rgba(34,197,94,0.07)',
                border: '1.5px solid rgba(34,197,94,0.3)',
              } : {
                backgroundColor: 'rgba(139,92,246,0.12)',
                border: '1.5px solid rgba(139,92,246,0.35)',
              }}>
              {/* Status dot */}
              <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: isOnline ? '#4ade80' : '#a78bfa' }} />
              {/* Table number badge */}
              <span className="text-[9px] font-bold tabular-nums"
                style={{ color: isOnline ? 'rgba(74,222,128,0.6)' : 'rgba(167,139,250,0.6)' }}>
                #{t.tableNumber}
              </span>
              {/* Name */}
              <p className="text-xs font-bold leading-none pr-3" style={{ color: 'var(--text-primary)' }}>
                {t.name ?? `T${t.tableNumber}`}
              </p>
              {/* Capacity + mode label */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{t.capacity}p</span>
                <span className="text-[9px] font-semibold px-1 py-0.5 rounded"
                  style={isOnline
                    ? { backgroundColor: 'rgba(34,197,94,0.15)', color: 'rgba(74,222,128,0.9)' }
                    : { backgroundColor: 'rgba(139,92,246,0.15)', color: 'rgba(167,139,250,0.9)' }}>
                  {isOnline ? 'Online' : 'Walk-in'}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2.5 border-t flex items-center gap-2" style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Tap any table to toggle between walk-in only and online booking. Changes save instantly.
        </span>
      </div>
    </div>
  )
}

/* ── helpers ─────────────────────────────────────────────────── */
function fmtMins(v: number): string {
  if (v === 0) return '0 min'
  if (v < 60) return `${v} min`
  const h = Math.floor(v / 60), m = v % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/* ── Disable-bookings confirmation modal ─────────────────────── */
function DisableConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5"
        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        {/* Icon */}
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
          style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
          <TriangleAlert size={22} style={{ color: '#ef4444' }} />
        </div>
        {/* Copy */}
        <div className="text-center flex flex-col gap-1.5">
          <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Disable online reservations?
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            You're switching to <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>walk-in only mode</span>.
            Make sure all your tables are open and ready to accept walk-in guests — no new online bookings will be accepted until you re-enable this.
          </p>
        </div>
        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--text-primary)', border: '1px solid var(--card-border)' }}>
            Keep enabled
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ backgroundColor: '#ef4444', color: '#fff' }}>
            Yes, disable
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BookingsSection({ cfg, set, tables, setTables, token, saveKey }: Props) {
  const [showDisableConfirm, setShowDisableConfirm] = useState(false)
  const [toggling, setToggling] = useState(false)

  const cutoffDesc = (() => {
    if (cfg.sameDayCutoffMins === 0) return 'Guests can book right up until the slot time'
    const t = 19 * 60 - cfg.sameDayCutoffMins
    const hh = Math.floor(t / 60), mm = t % 60, h12 = hh % 12 || 12
    return `7:00 PM slot → must book before ${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`
  })()

  return (
    <div className="p-5 flex flex-col gap-4">
      {showDisableConfirm && (
        <DisableConfirmModal
          onConfirm={async () => {
            setShowDisableConfirm(false)
            setToggling(true)
            try { await saveKey('bookingsEnabled', false) } finally { setToggling(false) }
          }}
          onCancel={() => setShowDisableConfirm(false)}
        />
      )}

      {/* ── Access ── always interactive */}
      <Section icon={Users} title="Access" accent="var(--brand)">
        <ToggleRow
          label="Allow online bookings"
          desc="Turn off to switch to walk-in only mode — all other settings below are paused"
          checked={cfg.bookingsEnabled}
          loading={toggling}
          onChange={async v => {
            if (!v) { setShowDisableConfirm(true) }
            else {
              setToggling(true)
              try { await saveKey('bookingsEnabled', true) } finally { setToggling(false) }
            }
          }}
        />
      </Section>

      {/* ── Info banner when online bookings disabled — settings still editable ── */}
      {!cfg.bookingsEnabled && (
        <div className="rounded-2xl border flex items-start gap-3 px-5 py-4"
          style={{ borderColor: 'var(--card-border)', backgroundColor: 'rgba(239,68,68,0.05)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
            <Zap size={13} style={{ color: '#ef4444' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Online bookings are off</p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Guests cannot book online. Staff can still create bookings by phone or walk-in. All settings below still apply.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">

      {/* ── Slot Timing ── */}
      <Section icon={Clock} title="Slot Timing" accent="#3b82f6">
        <PillRow
          label="Slot interval"
          desc="How often slots appear on the booking page — 30 min shows 7:00, 7:30, 8:00… 1 hour shows 7:00, 8:00…"
          value={cfg.slotDurationMins}
          options={[{ value: 30, label: '30 min' }, { value: 60, label: '1 hour' }]}
          onChange={v => set('slotDurationMins', Number(v))}
        />
        <StepperRow
          label="Expected dining duration"
          desc={`Used to block back-to-back bookings on the same table. A ${fmtMins(cfg.expectedDiningMins)} stay means the next slot for that table opens after the guest finishes.`}
          value={cfg.expectedDiningMins} min={30} max={180} step={15}
          display={fmtMins(cfg.expectedDiningMins)}
          onChange={v => set('expectedDiningMins', v)}
        />
        <StepperRow
          label="Minimum advance notice"
          desc={cutoffDesc}
          value={cfg.sameDayCutoffMins} min={0} max={120} step={5}
          display={cfg.sameDayCutoffMins === 0 ? 'None' : fmtMins(cfg.sameDayCutoffMins)}
          onChange={v => set('sameDayCutoffMins', v)}
        />
        <StepperRow
          label="How far ahead guests can book"
          desc="Guests can't book beyond this many days in the future. Keeps your calendar from filling up too far out."
          value={cfg.maxBookingDaysAhead} min={1} max={30}
          display={`${cfg.maxBookingDaysAhead} day${cfg.maxBookingDaysAhead !== 1 ? 's' : ''}`}
          onChange={v => set('maxBookingDaysAhead', v)}
          divider={false}
        />
      </Section>

      {/* ── Walk-in Tables ── */}
      <Section icon={ShieldCheck} title="Walk-in Tables" accent="#8b5cf6">
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--card-border)' }}>
          <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>Tables always kept for walk-ins</p>
          <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Online bookings will never be assigned to walk-in tables. Guests who scan the QR at a walk-in table can still order — they just can't pre-book it.
          </p>
          <TableSelector tables={tables} token={token} setTables={setTables} />
        </div>
        <StepperRow
          label="Table protection window"
          desc={`When a confirmed booking is ${fmtMins(cfg.tableReleaseWindowMins)} away, the system blocks any new walk-in seating or QR scan at that table. Guests already seated are not affected.`}
          value={cfg.tableReleaseWindowMins} min={15} max={180} step={15}
          display={fmtMins(cfg.tableReleaseWindowMins)}
          onChange={v => set('tableReleaseWindowMins', v)}
          divider={false}
        />
      </Section>

      {/* ── Grace Period ── */}
      <Section icon={Timer} title="Grace Period" accent="#f59e0b">
        {/* Explain once, clearly */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            How long to wait for a guest after their booking time before releasing the table and issuing a no-show strike.
          </p>
        </div>

        {/* Side-by-side: normal vs busy */}
        <div className="px-5 pb-4 grid grid-cols-2 gap-3">
          {/* Normal hours */}
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)' }}>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Normal hours</p>
            <p className="text-2xl font-bold mb-3" style={{ color: '#f59e0b' }}>{fmtMins(cfg.noShowGracePeriodOffPeak)}</p>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => set('noShowGracePeriodOffPeak', Math.max(5, cfg.noShowGracePeriodOffPeak - 5))}
                disabled={cfg.noShowGracePeriodOffPeak <= 5}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all disabled:opacity-25"
                style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                <Minus size={11} />
              </button>
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--card-border)' }}>
                <div className="h-full rounded-full" style={{ width: `${((cfg.noShowGracePeriodOffPeak - 5) / 55) * 100}%`, backgroundColor: '#f59e0b' }} />
              </div>
              <button type="button" onClick={() => set('noShowGracePeriodOffPeak', Math.min(60, cfg.noShowGracePeriodOffPeak + 5))}
                disabled={cfg.noShowGracePeriodOffPeak >= 60}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all disabled:opacity-25"
                style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                <Plus size={11} />
              </button>
            </div>
          </div>

          {/* Busy hours */}
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)' }}>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Busy hours</p>
            <p className="text-2xl font-bold mb-3" style={{ color: '#ef4444' }}>
              {cfg.noShowGracePeriodPeak === 0 ? 'Off' : fmtMins(cfg.noShowGracePeriodPeak)}
            </p>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => set('noShowGracePeriodPeak', Math.max(0, cfg.noShowGracePeriodPeak - 5))}
                disabled={cfg.noShowGracePeriodPeak <= 0}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all disabled:opacity-25"
                style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                <Minus size={11} />
              </button>
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--card-border)' }}>
                <div className="h-full rounded-full" style={{ width: `${(cfg.noShowGracePeriodPeak / 30) * 100}%`, backgroundColor: '#ef4444' }} />
              </div>
              <button type="button" onClick={() => set('noShowGracePeriodPeak', Math.min(30, cfg.noShowGracePeriodPeak + 5))}
                disabled={cfg.noShowGracePeriodPeak >= 30}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all disabled:opacity-25"
                style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                <Plus size={11} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 flex items-start gap-2.5 border-t" style={{ borderColor: 'var(--card-border)', backgroundColor: 'rgba(245,158,11,0.05)' }}>
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            If the guest places an order during the grace window, the table stays reserved — no strike issued.
          </p>
        </div>
      </Section>

      {/* ── Busy Hours ── */}
      {(() => {
        const ranges: { start: string; end: string }[] = cfg.peakRanges ?? []

        const updateRanges = (next: { start: string; end: string }[]) => {
          set('peakRanges', next)
        }
        const addRange = () => updateRanges([...ranges, { start: '12:00', end: '14:00' }])
        const removeRange = (i: number) => updateRanges(ranges.filter((_, idx) => idx !== i))
        const updateRange = (i: number, field: 'start' | 'end', v: string) =>
          updateRanges(ranges.map((r, idx) => idx === i ? { ...r, [field]: v } : r))

        return (
          <Section icon={Zap} title="Busy Hours" accent="#ef4444">
            <ToggleRow
              label="Stop online bookings during busy hours"
              desc="During these windows guests walk in directly — no pre-booking. Helps you turn tables faster at peak times."
              checked={cfg.peakHoursEnabled} onChange={v => set('peakHoursEnabled', v)}
              divider={cfg.peakHoursEnabled}
            />
            {cfg.peakHoursEnabled && (
              <div className="px-5 py-4 flex flex-col gap-3">
                {ranges.map((r, i) => (
                  <div key={i} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
                    {/* Range header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b"
                      style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#ef4444' }}>
                        Busy window {ranges.length > 1 ? i + 1 : ''}
                      </span>
                      {ranges.length > 1 && (
                        <button type="button" onClick={() => removeRange(i)}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded transition-colors"
                          style={{ color: 'var(--text-muted)', backgroundColor: 'transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                          Remove
                        </button>
                      )}
                    </div>
                    {/* From / Until */}
                    <div className="grid grid-cols-2 gap-0">
                      <div className="p-3 border-r" style={{ borderColor: 'var(--card-border)' }}>
                        <p className="text-[10px] font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>From</p>
                        <TimePick value={r.start} onChange={v => updateRange(i, 'start', v)} />
                      </div>
                      <div className="p-3">
                        <p className="text-[10px] font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Until</p>
                        <TimePick value={r.end} onChange={v => updateRange(i, 'end', v)} />
                      </div>
                    </div>
                    <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--card-border)', backgroundColor: 'rgba(239,68,68,0.04)' }}>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Walk-in only {r.start} – {r.end}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Add window button */}
                <button type="button" onClick={addRange}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all"
                  style={{ border: '1.5px dashed var(--card-border)', color: 'var(--text-muted)', backgroundColor: 'transparent' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#ef4444'; (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--card-border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}>
                  <Plus size={12} /> Add another busy window
                </button>
              </div>
            )}
          </Section>
        )
      })()}

      {/* ── Pre-order ── */}
      <Section icon={Zap} title="Pre-order" accent="#10b981">
        <ToggleRow
          label="Allow pre-order food with bookings"
          desc="Staff can attach a food pre-order when creating a booking. The pre-order fires to the kitchen automatically based on the lead time, so food is ready on arrival. Staff still check in the guest manually to seat the table."
          checked={cfg.preOrderEnabled ?? true}
          onChange={v => set('preOrderEnabled', v)}
          divider={true}
        />
        {cfg.preOrderEnabled && (
          <div className="px-4 pb-4">
            <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>Kitchen lead time</p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              Minutes before the booking slot to auto-send the pre-order to the kitchen — giving the kitchen prep time before the guest walks in. Set to 0 to only fire when staff tap "Check In Guest" on the table.
            </p>
            <Slider
              value={cfg.preOrderLeadMins ?? 30}
              min={0} max={120} step={5} unit="min"
              onChange={v => set('preOrderLeadMins', v)}
            />
          </div>
        )}
      </Section>

      </div>
    </div>
  )
}
