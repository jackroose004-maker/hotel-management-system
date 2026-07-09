'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Zap, Minus, Plus, Clock } from 'lucide-react'
import type { Cfg } from './_types'

export const inputCls = [
  'w-full px-3 py-2 text-sm rounded-lg border border-[var(--card-border)]',
  'focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20 focus:border-[var(--brand)]',
  'transition-all placeholder-gray-400',
].join(' ')

export const Inp = ({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) =>
  <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className={inputCls} style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }} />

export const Textarea = ({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) =>
  <textarea rows={rows} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className={inputCls} style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', resize: 'vertical' }} />

export const Sel = ({ value, onChange, options }: { value: string | number; onChange: (v: string) => void; options: { value: string | number; label: string }[] }) => (
  <div className="relative">
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`${inputCls} appearance-none pr-8 cursor-pointer`}
      style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
  </div>
)

export const TimePick = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const rawH = parseInt((value || '00:00').split(':')[0])
  const displayH = rawH === 0 ? 12 : rawH > 12 ? rawH - 12 : rawH
  const period: 'AM'|'PM' = rawH < 12 ? 'AM' : 'PM'
  const [selPeriod, setSelPeriod] = useState<'AM'|'PM'>(period)
  useEffect(() => { setSelPeriod(period) }, [rawH])

  const toAbs = (h: number, p: 'AM'|'PM') => p === 'AM' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12)
  const HOURS = [12,1,2,3,4,5,6,7,8,9,10,11]

  const openPanel = useCallback(() => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const PANEL_H = 44 + 132  // AM/PM tabs + 3-row grid
    const top = r.bottom + PANEL_H + 8 > window.innerHeight ? r.top - PANEL_H - 6 : r.bottom + 6
    setPos({ top, left: r.left, width: r.width })
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const closeOnScroll = () => setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('scroll', closeOnScroll, true) }
  }, [open])

  const panel = open && typeof document !== 'undefined' && createPortal(
    <div ref={panelRef} className="fixed z-[9999] rounded-xl border shadow-2xl overflow-hidden"
      style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 224), backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
      {/* AM / PM */}
      <div className="flex border-b" style={{ borderColor: 'var(--card-border)' }}>
        {(['AM','PM'] as const).map(p => (
          <button key={p} type="button"
            onClick={() => { setSelPeriod(p); onChange(`${String(toAbs(displayH,p)).padStart(2,'0')}:00`) }}
            className="flex-1 py-2.5 text-xs font-bold tracking-widest transition-all"
            style={selPeriod === p ? { backgroundColor: 'var(--brand)', color: '#000' } : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
            {p}
          </button>
        ))}
      </div>
      {/* 4×3 hour grid */}
      <div className="grid grid-cols-4 gap-1 p-2">
        {HOURS.map(h => {
          const abs = toAbs(h, selPeriod)
          const sel = abs === rawH
          return (
            <button key={h} type="button"
              onClick={() => { onChange(`${String(abs).padStart(2,'0')}:00`); setOpen(false) }}
              className="py-2 rounded-lg text-xs font-semibold text-center transition-colors"
              style={sel ? { backgroundColor: 'var(--brand)', color: '#000' } : { color: 'var(--text-primary)' }}
              onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--muted-bg)' }}
              onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.backgroundColor = '' }}>
              {h}:00
            </button>
          )
        })}
      </div>
    </div>,
    document.body
  )

  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={() => open ? setOpen(false) : openPanel()}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-sm font-semibold transition-all"
        style={{ backgroundColor: 'var(--input-bg)', borderColor: open ? 'var(--brand)' : 'var(--card-border)', color: 'var(--text-primary)' }}>
        <span className="flex items-center gap-2">
          <Clock size={13} style={{ color: 'var(--brand)' }} />
          {String(displayH).padStart(2,'0')}:00 {period}
        </span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} />
      </button>
      {panel}
    </div>
  )
}

export const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button type="button" onClick={() => onChange(!checked)}
    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 flex-shrink-0 cursor-pointer"
    style={{ backgroundColor: checked ? 'var(--brand)' : 'var(--card-border)' }}>
    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
)

export const Stepper = ({ value, onChange, min, max, step = 1, suffix = '' }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string }) => (
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

function fmtVal(v: number, unit: string): string {
  if (unit === 'min') {
    if (v === 0) return '0'
    if (v < 60) return `${v}m`
    const h = Math.floor(v / 60), m = v % 60
    return m ? `${h}h ${m}m` : `${h}h`
  }
  if (unit === 'days') return `${v}d`
  return `${v}`
}

export const Slider = ({ value, min, max, step = 1, unit, onChange }: { value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void }) => {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100
  const canDec = value > min
  const canInc = value < max
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => canDec && onChange(Math.max(min, value - step))} disabled={!canDec}
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-25"
        style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
        <Minus size={12} />
      </button>
      <div className="flex-1 relative">
        {/* track */}
        <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--card-border)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: 'var(--brand)' }} />
        </div>
        {/* value label centred above thumb */}
        <div className="absolute -top-6 transition-all" style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}>
          <span className="text-[11px] font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--brand)' }}>
            {fmtVal(value, unit)}
          </span>
        </div>
      </div>
      <button type="button" onClick={() => canInc && onChange(Math.min(max, value + step))} disabled={!canInc}
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-25"
        style={{ backgroundColor: 'var(--muted-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
        <Plus size={12} />
      </button>
    </div>
  )
}

export function Row({ label, desc, children, border = true }: { label: string; desc?: React.ReactNode; children: React.ReactNode; border?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 py-4 px-6 ${border ? 'border-b border-[var(--card-border)]' : ''}`}>
      <div className="min-w-0 flex-1">
        {label && <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>}
        {desc && <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>{desc}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

export function FieldBlock({ children, border = true }: { children: React.ReactNode; border?: boolean }) {
  return <div className={`px-6 py-4 ${border ? 'border-b border-[var(--card-border)]' : ''}`}>{children}</div>
}

export function SectionLabel({ text }: { text: string }) {
  return (
    <div className="px-6 py-2 border-y border-[var(--card-border)]"
      style={{ backgroundColor: 'var(--muted-bg)' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{text}</p>
    </div>
  )
}

export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
      <Zap size={11} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--brand)' }} />
      <span>{children}</span>
    </div>
  )
}

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

export function BilingualField({ label, valueEn, valueAr, placeholder, placeholderAr, onChangeEn, onChangeAr }: {
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
