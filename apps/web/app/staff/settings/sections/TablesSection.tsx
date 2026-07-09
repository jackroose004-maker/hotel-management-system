'use client'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Check, Loader2, Users, Power } from 'lucide-react'
import { Stepper, SectionLabel, FieldBlock, Inp } from './_controls'
import type { Cfg } from './_types'
import api from '@/lib/api'

interface Props { cfg: Cfg; set: <K extends keyof Cfg>(k: K, v: Cfg[K]) => void }

const ZONES = ['Indoor', 'Outdoor', 'Rooftop', 'Private Room', 'Bar', 'Terrace'] as const
type Zone = typeof ZONES[number]

interface Table {
  id: string
  tableNumber: number
  name: string
  capacity: number
  zone: string
  status: string
  isActive: boolean
}

const STATUS_DOT: Record<string, string> = {
  EMPTY: '#4ade80', OCCUPIED: '#f87171', BILL_PENDING: '#fbbf24', DIRTY: '#9ca3af',
}

// ── Single table card — always editable, auto-saves on change ─────────────────
function TableCard({ table, onSave, onToggleActive }: {
  table: Table
  onSave: (id: string, name: string, capacity: number, zone: string) => Promise<void>
  onToggleActive: (id: string, active: boolean) => Promise<void>
}) {
  const [name, setName] = useState(table.name)
  const [capacity, setCapacity] = useState(table.capacity)
  const [zone, setZone] = useState<string>(table.zone ?? 'Indoor')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toggling, setToggling] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-save with debounce
  const autoSave = useCallback((n: string, cap: number, z: string) => {
    if (!n.trim()) return
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setSaving(true)
      await onSave(table.id, n.trim(), cap, z)
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    }, 500)
  }, [table.id, onSave])

  const dot = STATUS_DOT[table.status] ?? '#9ca3af'
  const inactive = table.isActive === false

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${inactive ? 'opacity-50' : ''}`}
      style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--card-bg)' }}>

      {/* Status bar */}
      <div className="h-1" style={{ backgroundColor: inactive ? '#6b7280' : dot }} />

      <div className="p-3 space-y-2">
        {/* Number badge + save indicator */}
        <div className="flex items-center justify-between">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white flex-shrink-0"
            style={{ backgroundColor: inactive ? '#6b7280' : dot }}>
            {table.tableNumber}
          </div>
          <div className="flex items-center gap-1.5">
            {saving && <Loader2 size={10} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
            {saved && !saving && <Check size={10} style={{ color: '#22c55e' }} />}
            <button onClick={async () => { setToggling(true); await onToggleActive(table.id, !table.isActive); setToggling(false) }}
              disabled={toggling}
              title={inactive ? 'Activate table' : 'Deactivate table'}
              className="w-7 h-7 flex items-center justify-center rounded-lg border transition-colors hover:bg-[var(--muted-bg)] disabled:opacity-40"
              style={{ borderColor: 'var(--card-border)', color: inactive ? '#4ade80' : '#f87171' }}>
              {toggling ? <Loader2 size={10} className="animate-spin" /> : <Power size={10} />}
            </button>
          </div>
        </div>

        {/* Name + seats in one row */}
        <div className="flex gap-2 items-center">
          <div className="flex-1 min-w-0">
            <Inp value={name} onChange={v => { setName(v); autoSave(v, capacity, zone) }} placeholder="Table name" />
          </div>
          <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl flex-shrink-0" style={{ backgroundColor: 'var(--muted-bg)' }}>
            <Users size={10} style={{ color: 'var(--brand)' }} />
            <Stepper value={capacity} onChange={v => { setCapacity(v); autoSave(name, v, zone) }} min={1} max={20} suffix="" />
          </div>
        </div>

        {/* Zone pills — 3-col grid so they never wrap */}
        <div className="grid grid-cols-3 gap-1">
          {ZONES.map(z => (
            <button key={z} type="button" onClick={() => { setZone(z); autoSave(name, capacity, z) }}
              className="py-1 rounded-lg text-[9px] font-semibold transition-all truncate px-1 text-center"
              style={zone === z
                ? { backgroundColor: 'var(--brand)', color: '#fff' }
                : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
              {z}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Add table card ─────────────────────────────────────────────────────────────
function AddTableCard({ nextNumber, defaultCapacity, onAdd }: {
  nextNumber: number
  defaultCapacity: number
  onAdd: (tableNumber: number, name: string, capacity: number, zone: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [tableNumber, setTableNumber] = useState(nextNumber)
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState(defaultCapacity)
  const [zone, setZone] = useState<string>('Indoor')
  const [busy, setBusy] = useState(false)

  useEffect(() => { setTableNumber(nextNumber) }, [nextNumber])
  useEffect(() => { setCapacity(defaultCapacity) }, [defaultCapacity])

  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    await onAdd(tableNumber, name.trim(), capacity, zone)
    setName(''); setZone('Indoor')
    setOpen(false)
    setBusy(false)
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 p-3 min-h-[132px] transition-colors hover:border-[var(--brand)]"
      style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
      <Plus size={18} style={{ color: 'var(--brand)' }} />
      <span className="text-xs font-semibold">Add table</span>
    </button>
  )

  return (
    <div className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: 'var(--brand)', backgroundColor: 'var(--card-bg)' }}>
      <div className="h-1" style={{ backgroundColor: 'var(--brand)' }} />
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0"
            style={{ border: '2px dashed var(--brand)', color: 'var(--brand)' }}>
            {tableNumber}
          </div>
          <Stepper value={tableNumber} onChange={setTableNumber} min={1} max={100} suffix="" />
        </div>
        <Inp value={name} onChange={setName} placeholder="Table name — required" />
        {name === '' && <p className="text-[10px] text-red-400 -mt-1">Name is required</p>}
        <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl" style={{ backgroundColor: 'var(--muted-bg)' }}>
          <Users size={10} style={{ color: 'var(--brand)' }} className="flex-shrink-0" />
          <span className="text-[11px] font-semibold flex-1 ml-1" style={{ color: 'var(--text-muted)' }}>Seats</span>
          <Stepper value={capacity} onChange={setCapacity} min={1} max={20} suffix="" />
        </div>
        <div className="grid grid-cols-3 gap-1">
          {ZONES.map(z => (
            <button key={z} type="button" onClick={() => setZone(z)}
              className="py-1 rounded-lg text-[9px] font-semibold transition-all truncate px-1 text-center"
              style={zone === z
                ? { backgroundColor: 'var(--brand)', color: '#fff' }
                : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', border: '1px solid var(--card-border)' }}>
              {z}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 pt-0.5">
          <button onClick={save} disabled={busy}
            className="flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
            style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
            {busy ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />} Add
          </button>
          <button onClick={() => setOpen(false)}
            className="flex-1 py-1.5 rounded-lg text-xs font-bold border"
            style={{ borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main section ──────────────────────────────────────────────────────────────
export default function TablesSection({ cfg, set }: Props) {
  const [tables, setTables] = useState<Table[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/tables?all=true')
      setTables(r.data ?? [])
    } catch {
      setErr('Could not load tables')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async (id: string, name: string, capacity: number, zone: string) => {
    await api.patch(`/tables/${id}`, { name, capacity, zone })
    // update local state silently — no full reload, no flash
    setTables(prev => prev.map(t => t.id === id ? { ...t, name, capacity, zone } : t))
  }

  const toggleActive = async (id: string, isActive: boolean) => {
    await api.patch(`/tables/${id}/active`, { isActive })
    setTables(prev => prev.map(t => t.id === id ? { ...t, isActive } : t))
  }

  const add = async (tableNumber: number, name: string, capacity: number, zone: string) => {
    await api.post('/tables', { tableNumber, name: name || undefined, capacity, zone })
    await load()
  }

  const active = tables.filter(t => t.isActive !== false)
  const inactive = tables.filter(t => t.isActive === false)
  const nextNumber = tables.length > 0 ? Math.max(...tables.map(t => t.tableNumber)) + 1 : 1
  const totalSeats = active.reduce((s, t) => s + t.capacity, 0)

  return (
    <>
      <SectionLabel text="Tables" />

      {/* Summary + default capacity */}
      <div className="px-6 py-4 border-b border-[var(--card-border)] flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {active.length} active · {totalSeats} seats
            {inactive.length > 0 && <span className="font-normal text-xs ml-2" style={{ color: 'var(--text-muted)' }}>({inactive.length} inactive)</span>}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Deactivate a table to hide it from the floor — no data is lost.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Default seats</p>
          <Stepper value={cfg.defaultCapacity} onChange={v => set('defaultCapacity', v)} min={1} max={20} suffix="" />
        </div>
      </div>

      {/* Card grid */}
      <FieldBlock border={false}>
        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
        {err && <p className="text-sm text-red-400 py-4">{err}</p>}
        {!loading && !err && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {tables.map(t => (
              <TableCard key={t.id} table={t} onSave={save} onToggleActive={toggleActive} />
            ))}
            <AddTableCard nextNumber={nextNumber} defaultCapacity={cfg.defaultCapacity} onAdd={add} />
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs mt-4 pt-4 border-t border-[var(--card-border)]"
          style={{ color: 'var(--text-muted)' }}>
          {Object.entries({ EMPTY: 'Available', OCCUPIED: 'Occupied', BILL_PENDING: 'Bill Pending', DIRTY: 'Cleaning' }).map(([k, label]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_DOT[k] }} />
              {label}
            </div>
          ))}
          <span className="flex items-center gap-1">
            <Power size={10} style={{ color: '#f87171' }} /> = deactivate &nbsp;
            <Power size={10} style={{ color: '#4ade80' }} /> = activate
          </span>
        </div>
      </FieldBlock>
    </>
  )
}
