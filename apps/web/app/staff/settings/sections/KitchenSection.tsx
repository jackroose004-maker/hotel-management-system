'use client'
import React from 'react'
import { ChevronDown } from 'lucide-react'
import { Toggle, Inp, Sel, Row, Slider, SectionLabel, FieldBlock } from './_controls'
import type { Cfg } from './_types'
import { DEFAULT_KOT_CONFIG, type KotConfig } from './_types'

interface Props {
  cfg: Cfg
  set: <K extends keyof Cfg>(k: K, v: Cfg[K]) => void
  openPanel: string
  setOpenPanel: (v: string) => void
}

// ── KOT Paper Preview ────────────────────────────────────────────────────────
function KotPreview({ kot, cfg }: { kot: KotConfig; cfg: Cfg }) {
  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', hour12: true })
  const dateStr = now.toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })

  const fs = kot.fontSize === 'sm' ? 10 : kot.fontSize === 'lg' ? 14 : 12

  return (
    <div className="flex justify-center py-2">
      <div style={{
        width: 302,
        backgroundColor: '#fff',
        color: '#000',
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: fs,
        lineHeight: 1.45,
        padding: '12px 10px',
        borderRadius: 6,
        boxShadow: '0 2px 16px rgba(0,0,0,0.45)',
        userSelect: 'none',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 900, fontSize: fs + 3, letterSpacing: 1 }}>
            *** {kot.headerText || 'KITCHEN ORDER'} ***
          </div>
          <div style={{ fontSize: fs - 1, marginTop: 2 }}>{cfg.restaurantName || 'Al Manzil'}</div>
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

        {/* Order meta */}
        {kot.showOrderId && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span><b>Order #</b> 1042</span>
            {kot.showTableNumber && <span><b>Table:</b> T-5</span>}
          </div>
        )}
        {!kot.showOrderId && kot.showTableNumber && (
          <div style={{ marginBottom: 2 }}><b>Table:</b> T-5</div>
        )}
        {kot.showOrderType && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span><b>Type:</b> DINE IN</span>
            {kot.showOrderTime && <span>{timeStr}</span>}
          </div>
        )}
        {!kot.showOrderType && kot.showOrderTime && (
          <div style={{ marginBottom: 2 }}>{dateStr} · {timeStr}</div>
        )}
        {kot.showWaiterName && (
          <div style={{ fontSize: fs - 1, color: '#555', marginBottom: 2 }}>Taken by: Waiter #3</div>
        )}

        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

        {/* Items */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', fontWeight: 700, marginBottom: 2 }}>
            <span style={{ width: 28 }}>2x</span>
            <span>Chicken Biryani</span>
          </div>
          {kot.showModifiers && (
            <>
              <div style={{ fontSize: fs - 1, color: '#444', paddingLeft: 28 }}>— Extra spicy</div>
              <div style={{ fontSize: fs - 1, color: '#444', paddingLeft: 28 }}>— No onions</div>
            </>
          )}

          <div style={{ display: 'flex', fontWeight: 700, marginTop: 4, marginBottom: 2 }}>
            <span style={{ width: 28 }}>1x</span>
            <span>Garlic Naan</span>
          </div>

          <div style={{ display: 'flex', fontWeight: 700, marginTop: 4, marginBottom: 2 }}>
            <span style={{ width: 28 }}>3x</span>
            <span>Mango Lassi</span>
          </div>
          {kot.showModifiers && (
            <div style={{ fontSize: fs - 1, color: '#444', paddingLeft: 28 }}>— Less sugar</div>
          )}
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

        {/* Footer */}
        <div style={{ textAlign: 'center', fontWeight: 900, fontSize: fs + 2, marginTop: 4 }}>
          *** {kot.footerText || 'FIRE NOW'} ***
        </div>
      </div>
    </div>
  )
}

// ── Accordion ────────────────────────────────────────────────────────────────
const KOT_PANELS = [
  { id: 'layout',  label: 'Layout',       icon: '📄', desc: 'Font size, header & footer text' },
  { id: 'fields',  label: 'Ticket Fields', icon: '📋', desc: 'What to print on the ticket' },
  { id: 'network', label: 'Printer Setup', icon: '🖨️', desc: 'IP address & port' },
]

export default function KitchenSection({ cfg, set, openPanel, setOpenPanel }: Props) {
  const kot: KotConfig = { ...DEFAULT_KOT_CONFIG, ...(cfg.kotConfig ?? {}) }
  const setKot = (patch: Partial<KotConfig>) => set('kotConfig', { ...kot, ...patch })

  const TogRow = ({ label, desc, field, border }: { label: string; desc?: string; field: keyof KotConfig; border?: boolean }) => (
    <Row label={label} desc={desc} border={border}>
      <Toggle checked={!!kot[field]} onChange={v => setKot({ [field]: v })} />
    </Row>
  )

  const KotAccordion = ({ id, children }: { id: string; children: React.ReactNode }) => {
    const panel = KOT_PANELS.find(p => p.id === id)!
    const open = openPanel === `kot-${id}`
    return (
      <div className="rounded-2xl overflow-hidden mb-3" style={{ border: '1px solid var(--card-border)', backgroundColor: open ? 'var(--card-bg)' : 'transparent' }}>
        <button type="button" onClick={() => setOpenPanel(open ? '' : `kot-${id}`)}
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

  const PreviewPanel = () => (
    <div className="rounded-2xl border border-[var(--card-border)] shadow-sm p-4 flex flex-col items-center overflow-auto max-h-[75vh]"
      style={{ backgroundColor: '#e5e7eb' }}>
      <KotPreview kot={kot} cfg={cfg} />
    </div>
  )

  return (
    <>
      <SectionLabel text="Kitchen Defaults" />
      <div className="px-6 py-5 border-b border-[var(--card-border)]">
        <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>Default prep time</p>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          Safety net — only fires if a menu item has no prep time set. Set prep time per item in the Menu page.
        </p>
        <Slider value={cfg.defaultPrepTimeMins} min={5} max={60} step={5} unit="min" onChange={v => set('defaultPrepTimeMins', v)} />
      </div>

      <SectionLabel text="Thermal Printer (KOT)" />
      <Row label="Thermal Printer" desc="Print a kitchen order ticket when an order is accepted. Enables skip-kitchen-stages mode — Accept jumps straight to Ready with no KDS clicks needed.">
        <Toggle checked={cfg.thermalEnabled ?? false} onChange={v => set('thermalEnabled', v)} />
      </Row>

      {cfg.thermalEnabled && (
        <FieldBlock border={false}>
          {/* Mobile preview toggle */}
          <div className="xl:hidden mb-4">
            <button type="button" onClick={() => setOpenPanel(openPanel === 'kot-preview' ? '' : 'kot-preview')}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border border-[var(--card-border)] transition-colors"
              style={{ backgroundColor: openPanel === 'kot-preview' ? 'var(--brand)' : 'transparent', color: openPanel === 'kot-preview' ? '#000' : 'var(--text-muted)' }}>
              🖨️ {openPanel === 'kot-preview' ? 'Hide KOT Preview' : 'Show KOT Preview'}
            </button>
            {openPanel === 'kot-preview' && <div className="mt-3"><PreviewPanel /></div>}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {/* Accordions */}
            <div>
              <KotAccordion id="layout">
                <Row label="Font size" border={false}>
                  <Sel value={kot.fontSize}
                    onChange={v => setKot({ fontSize: v as KotConfig['fontSize'] })}
                    options={[{ value: 'sm', label: 'Small (10px)' }, { value: 'md', label: 'Medium (12px)' }, { value: 'lg', label: 'Large (14px)' }]} />
                </Row>
                <div className="border-t border-[var(--card-border)] pt-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Header text</p>
                    <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Printed at top between *** ***</p>
                    <Inp value={kot.headerText} onChange={v => setKot({ headerText: v })} placeholder="KITCHEN ORDER" />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Footer text</p>
                    <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Printed at bottom between *** ***</p>
                    <Inp value={kot.footerText} onChange={v => setKot({ footerText: v })} placeholder="FIRE NOW" />
                  </div>
                </div>
              </KotAccordion>

              <KotAccordion id="fields">
                <TogRow label="Show order ID"      field="showOrderId"    desc="Order # printed above items" />
                <TogRow label="Show table number"  field="showTableNumber" />
                <TogRow label="Show order type"    field="showOrderType"  desc="DINE IN or TAKEAWAY" />
                <TogRow label="Show order time"    field="showOrderTime"  desc="Accepted timestamp" />
                <TogRow label="Show waiter name"   field="showWaiterName" desc="Staff who accepted the order" />
                <TogRow label="Show modifiers"     field="showModifiers"  desc="Size / extras / special requests" border={false} />
              </KotAccordion>

              <KotAccordion id="network">
                <Row label="Printer IP Address" desc="Local network IP (e.g. 192.168.1.50)">
                  <Inp value={cfg.thermalPrinterIp ?? ''} onChange={v => set('thermalPrinterIp', v)}
                    placeholder="192.168.1.50" />
                </Row>
                <Row label="Printer Port" desc="Default ESC/POS port is 9100" border={false}>
                  <Inp value={String(cfg.thermalPrinterPort ?? 9100)} onChange={v => set('thermalPrinterPort', Number(v))}
                    placeholder="9100" />
                </Row>
              </KotAccordion>
            </div>

            {/* Sticky live preview — desktop only */}
            <div className="hidden xl:block sticky top-6 self-start">
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>Live Preview</p>
              <PreviewPanel />
            </div>
          </div>
        </FieldBlock>
      )}

      {!cfg.thermalEnabled && (
        <>
          <SectionLabel text="Notes" />
          <FieldBlock border={false}>
            <ul className="space-y-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <li>• Enable the toggle above to configure the thermal printer</li>
              <li>• Kitchen view is built into the Orders screen — toggle it from the top bar or log in as Chef</li>
              <li>• Printer must be on the same LAN as the server</li>
            </ul>
          </FieldBlock>
        </>
      )}
    </>
  )
}
