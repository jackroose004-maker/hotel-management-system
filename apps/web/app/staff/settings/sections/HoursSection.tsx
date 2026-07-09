'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Clock } from 'lucide-react'
import { SectionLabel, Row, FieldBlock, Toggle } from './_controls'
import type { Cfg } from './_types'

interface Props { cfg: Cfg; set: <K extends keyof Cfg>(k: K, v: Cfg[K]) => void }

type Shift = { openTime: string; closeTime: string }
type DayData = { open: boolean; shifts: Shift[] }

const DAYS = ['MON','TUE','WED','THU','FRI','SAT','SUN'] as const
const DAY_FULL: Record<string, string> = {
  MON:'Monday', TUE:'Tuesday', WED:'Wednesday', THU:'Thursday',
  FRI:'Friday', SAT:'Saturday', SUN:'Sunday',
}
const DEFAULT_SHIFT: Shift = { openTime: '00:00', closeTime: '00:00' }
const DEFAULT_DAY: DayData = { open: true, shifts: [DEFAULT_SHIFT] }

function fmt(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2,'0')} ${suffix}`
}

function shiftSummary(shifts: Shift[]) {
  if (!shifts.length) return '—'
  const is24 = shifts.length === 1 && shifts[0].openTime === '00:00' && shifts[0].closeTime === '00:00'
  if (is24) return '24 hrs'
  return shifts.map(s => `${fmt(s.openTime)} – ${fmt(s.closeTime)}`).join(', ')
}

function PillToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onChange() }}
      className="relative flex-shrink-0 transition-all duration-200"
      style={{ width: 34, height: 19, borderRadius: 10,
        backgroundColor: checked ? 'var(--brand)' : 'var(--card-border)' }}>
      <span className="absolute top-[3px] transition-all duration-200 rounded-full bg-white"
        style={{ width: 13, height: 13, left: checked ? 18 : 3 }} />
    </button>
  )
}

// AM/PM + hour grid + :00/:30 picker — portal-based like TimePick
function TimePick30({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const rawH = parseInt((value || '00:00').split(':')[0])
  const rawM = parseInt((value || '00:00').split(':')[1] ?? '0')
  const displayH = rawH === 0 ? 12 : rawH > 12 ? rawH - 12 : rawH
  const period: 'AM'|'PM' = rawH < 12 ? 'AM' : 'PM'
  const [selPeriod, setSelPeriod] = useState<'AM'|'PM'>(period)
  const [selH, setSelH] = useState<number | null>(null) // hour chosen, waiting for minute
  useEffect(() => { setSelPeriod(period) }, [rawH])

  const toAbs = (h: number, p: 'AM'|'PM') => p === 'AM' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12)
  const HOURS = [12,1,2,3,4,5,6,7,8,9,10,11]

  const isMobile = () => window.innerWidth < 640
  const openPanel = useCallback(() => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const PANEL_H = 44 + 40 + 132
    const PANEL_W = Math.max(r.width, 240)
    const top = r.bottom + PANEL_H + 8 > window.innerHeight ? r.top - PANEL_H - 6 : r.bottom + 6
    const left = Math.min(r.left, window.innerWidth - PANEL_W - 8)
    setPos({ top, left: Math.max(8, left), width: r.width })
    setSelH(null)
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const closeScroll = () => setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', closeScroll, true)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', closeScroll, true)
    }
  }, [open])

  const mobile = typeof window !== 'undefined' && window.innerWidth < 640

  const panel = open && typeof document !== 'undefined' && createPortal(
    <>
      {/* Backdrop — only on mobile */}
      {mobile && (
        <div className="fixed inset-0 z-[9998]" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => setOpen(false)} />
      )}
    <div ref={panelRef}
      className={mobile
        ? 'fixed z-[9999] rounded-t-2xl border-t shadow-2xl overflow-hidden left-0 right-0 bottom-0'
        : 'fixed z-[9999] rounded-xl border shadow-2xl overflow-hidden'}
      style={mobile
        ? { backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }
        : { top: pos.top, left: pos.left, width: Math.max(pos.width, 240), backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>

      {/* Drag handle — mobile only */}
      {mobile && (
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--card-border)' }} />
        </div>
      )}

      {/* AM / PM */}
      <div className="flex border-b" style={{ borderColor: 'var(--card-border)' }}>
        {(['AM','PM'] as const).map(p => (
          <button key={p} type="button"
            onClick={() => { setSelPeriod(p); setSelH(null) }}
            className="flex-1 py-2.5 text-xs font-bold tracking-widest transition-all"
            style={selPeriod === p
              ? { backgroundColor: 'var(--brand)', color: '#fff' }
              : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
            {p}
          </button>
        ))}
      </div>

      {/* Hour grid or minute picker */}
      {selH === null ? (
        <div className="grid grid-cols-4 gap-1 p-2">
          {HOURS.map(h => {
            const abs = toAbs(h, selPeriod)
            const sel = abs === rawH
            return (
              <button key={h} type="button"
                onClick={() => setSelH(h)}
                className="py-2 rounded-lg text-xs font-semibold text-center transition-colors"
                style={sel ? { backgroundColor: 'var(--brand)', color: '#fff' } : { color: 'var(--text-primary)' }}
                onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--muted-bg)' }}
                onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.backgroundColor = '' }}>
                {h}:00
              </button>
            )
          })}
        </div>
      ) : (
        // Minute picker — :00 or :30
        <div className="p-3 flex flex-col gap-2">
          <p className="text-[10px] font-bold text-center tracking-widest"
            style={{ color: 'var(--text-muted)' }}>
            {selH}:__ {selPeriod}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {([0,30] as const).map(m => {
              const abs = toAbs(selH, selPeriod)
              const sel = abs === rawH && m === rawM
              return (
                <button key={m} type="button"
                  onClick={() => {
                    onChange(`${String(abs).padStart(2,'0')}:${String(m).padStart(2,'0')}`)
                    setOpen(false); setSelH(null)
                  }}
                  className="py-2.5 rounded-lg text-sm font-bold text-center transition-colors"
                  style={sel ? { backgroundColor: 'var(--brand)', color: '#fff' } : { color: 'var(--text-primary)', backgroundColor: 'var(--muted-bg)' }}>
                  :{String(m).padStart(2,'0')}
                </button>
              )
            })}
          </div>
          <button type="button" onClick={() => setSelH(null)}
            className="text-[11px] text-center mt-1 transition-colors"
            style={{ color: 'var(--text-muted)' }}>
            ← back
          </button>
        </div>
      )}
    </div>
    </>,
    document.body
  )

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => open ? setOpen(false) : openPanel()}
        className="flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all min-w-0"
        style={{ backgroundColor: 'var(--muted-bg)', borderColor: open ? 'var(--brand)' : 'var(--card-border)',
          color: 'var(--text-primary)' }}>
        <span className="flex items-center gap-1.5">
          <Clock size={11} style={{ color: 'var(--brand)', flexShrink: 0 }} />
          {fmt(value)}
        </span>
        <ChevronDown size={11} className={`transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-muted)' }} />
      </button>
      {panel}
    </>
  )
}

export default function HoursSection({ cfg, set }: Props) {
  const raw = (cfg.weeklySchedule ?? {}) as Record<string, any>
  const [sameHours, setSameHours] = useState(false)
  const [sameOpen, setSameOpen]   = useState('09:00')
  const [sameClose, setSameClose] = useState('22:00')
  const [expanded, setExpanded] = useState<string | null>(null)

  const jsDay = new Date().getDay()
  const todayKey = jsDay === 0 ? 'SUN' : DAYS[jsDay - 1]

  function getDay(key: string): DayData {
    const d = raw[key]
    if (!d) return DEFAULT_DAY
    if (!d.shifts && d.openTime !== undefined) {
      return { open: !!d.open, shifts: [{ openTime: d.openTime ?? '00:00', closeTime: d.closeTime ?? '00:00' }] }
    }
    return { open: !!d.open, shifts: Array.isArray(d.shifts) && d.shifts.length ? d.shifts : [DEFAULT_SHIFT] }
  }

  function applySameHours(openTime: string, closeTime: string) {
    const updated: Record<string, DayData> = {}
    for (const k of DAYS) {
      const existing = getDay(k)
      updated[k] = { open: existing.open, shifts: [{ openTime, closeTime }] }
    }
    set('weeklySchedule', updated)
  }

  function updateSchedule(key: string, day: DayData) {
    const updated = { ...raw, [key]: day }
    if (sameHours && day.open) {
      for (const k of DAYS) {
        const existing = getDay(k)
        updated[k] = { open: existing.open, shifts: day.shifts }
      }
    }
    set('weeklySchedule', updated)
  }

  function updateShift(dayKey: string, idx: number, patch: Partial<Shift>) {
    const day = getDay(dayKey)
    const shifts = day.shifts.map((s, i) => i === idx ? { ...s, ...patch } : s)
    updateSchedule(dayKey, { ...day, shifts })
  }

  function addShift(dayKey: string) {
    const day = getDay(dayKey)
    updateSchedule(dayKey, { ...day, shifts: [...day.shifts, { openTime: '09:00', closeTime: '22:00' }] })
  }

  function removeShift(dayKey: string, idx: number) {
    const day = getDay(dayKey)
    const shifts = day.shifts.filter((_, i) => i !== idx)
    updateSchedule(dayKey, { ...day, shifts: shifts.length ? shifts : [DEFAULT_SHIFT] })
  }

  function toggleDay(dayKey: string) {
    const day = getDay(dayKey)
    const next = { ...day, open: !day.open }
    updateSchedule(dayKey, next)
    if (!next.open && expanded === dayKey) setExpanded(null)
  }

  return (
    <>
      <SectionLabel text="Opening Hours" />

      {/* Same hours toggle + inline time pickers */}
      <Row label="Same hours every day"
        desc="Apply the same opening and closing time to all open days.">
        <Toggle checked={sameHours} onChange={v => {
          if (v) {
            // Pre-populate from the first open day's first shift
            const firstOpen = DAYS.map(getDay).find(d => d.open)
            const shift = firstOpen?.shifts[0] ?? { openTime: '09:00', closeTime: '22:00' }
            setSameOpen(shift.openTime)
            setSameClose(shift.closeTime)
            applySameHours(shift.openTime, shift.closeTime)
          }
          setSameHours(v)
        }} />
      </Row>
      {sameHours && (
        <FieldBlock border={false}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--text-muted)', minWidth: 40 }}>Open</span>
            <TimePick30 value={sameOpen} onChange={v => { setSameOpen(v); applySameHours(v, sameClose) }} />
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>→</span>
            <TimePick30 value={sameClose} onChange={v => { setSameClose(v); applySameHours(sameOpen, v) }} />
            <span className="text-[11px] ml-auto flex-shrink-0 font-medium" style={{ color: 'var(--text-muted)' }}>
              Set both to <strong>12:00 AM</strong> for 24 hr
            </span>
          </div>
        </FieldBlock>
      )}

      {/* Day rows */}
      <FieldBlock border={false}>
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
          {DAYS.map((day, i) => {
            const d = getDay(day)
            const isToday = day === todayKey
            const isExp = expanded === day
            const isLast = i === DAYS.length - 1
            const summary = d.open ? shiftSummary(d.shifts) : 'Closed'
            const is24 = d.open && d.shifts.length === 1 && d.shifts[0].openTime === '00:00' && d.shifts[0].closeTime === '00:00'

            return (
              <div key={day} style={{ borderBottom: isLast ? 'none' : '1px solid var(--card-border)' }}>

                {/* Header row — click to expand */}
                <div
                  className="relative flex items-center gap-3 px-4 sm:px-5 cursor-pointer select-none transition-colors"
                  style={{
                    minHeight: 56,
                    backgroundColor: isToday ? 'rgba(var(--brand-rgb),0.04)' : d.open ? 'var(--card-bg)' : 'var(--muted-bg)',
                  }}
                  onClick={() => d.open && setExpanded(isExp ? null : day)}>

                  {isToday && (
                    <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
                      style={{ backgroundColor: 'var(--brand)' }} />
                  )}

                  <PillToggle checked={d.open} onChange={() => toggleDay(day)} />

                  {/* Day name — short on mobile, full on desktop */}
                  <div className="flex items-center gap-2 min-w-0" style={{ width: '6rem', flexShrink: 0 }}>
                    <span className="text-sm font-semibold hidden sm:block"
                      style={{ color: d.open ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {DAY_FULL[day]}
                    </span>
                    <span className="text-sm font-semibold sm:hidden"
                      style={{ color: d.open ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {day.charAt(0) + day.slice(1,3).toLowerCase()}
                    </span>
                    {isToday && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full tracking-wide hidden sm:inline"
                        style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)', color: 'var(--brand)' }}>
                        TODAY
                      </span>
                    )}
                  </div>

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Summary pill — right-aligned before chevron */}
                  <span className="text-[11px] font-semibold flex-shrink-0 px-2.5 py-1 rounded-full max-w-[120px] sm:max-w-[200px] truncate"
                    style={is24
                      ? { backgroundColor: 'rgba(34,197,94,0.1)', color: '#16a34a' }
                      : d.open
                        ? { backgroundColor: 'rgba(var(--brand-rgb),0.08)', color: 'var(--brand)' }
                        : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
                    {summary}
                  </span>

                  {d.open && (
                    <ChevronDown size={14}
                      className={`flex-shrink-0 transition-transform duration-200 ${isExp ? 'rotate-180' : ''}`}
                      style={{ color: 'var(--text-muted)' }} />
                  )}
                </div>

                {/* Expanded shifts */}
                {isExp && d.open && (
                  <div className="px-4 sm:px-5 py-3 flex flex-col gap-2.5"
                    style={{ borderTop: '1px solid var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>

                    {d.shifts.map((shift, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {/* Shift label */}
                        {d.shifts.length > 1 && (
                          <span className="text-[10px] font-bold tracking-widest uppercase flex-shrink-0 w-6 text-center"
                            style={{ color: 'var(--text-muted)' }}>S{idx + 1}</span>
                        )}
                        {/* Pickers row */}
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <TimePick30 value={shift.openTime} onChange={v => updateShift(day, idx, { openTime: v })} />
                          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>→</span>
                          <TimePick30 value={shift.closeTime} onChange={v => updateShift(day, idx, { closeTime: v })} />
                        </div>
                        {/* Remove */}
                        {d.shifts.length > 1 && (
                          <button type="button" onClick={() => removeShift(day, idx)}
                            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors text-base leading-none"
                            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239,68,68,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.3)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--card-bg)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--card-border)' }}>
                            ×
                          </button>
                        )}
                      </div>
                    ))}

                    {d.shifts.length < 4 && (
                      <button type="button" onClick={() => addShift(day)}
                        className="text-xs font-semibold self-start mt-0.5 transition-colors"
                        style={{ color: 'var(--brand)' }}>
                        + Add another shift
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </FieldBlock>
    </>
  )
}
