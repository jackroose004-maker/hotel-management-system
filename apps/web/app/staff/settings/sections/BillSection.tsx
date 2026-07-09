'use client'
import React from 'react'
import { Receipt } from 'lucide-react'
import BillReceipt, { DEFAULT_BILL_CONFIG, type BillConfig } from '@/components/ui/BillReceipt'
import { Toggle, Sel, Inp, Row } from './_controls'
import { ChevronDown } from 'lucide-react'
import type { Cfg } from './_types'

interface Props {
  cfg: Cfg
  set: <K extends keyof Cfg>(k: K, v: Cfg[K]) => void
  openPanel: string
  setOpenPanel: (v: string) => void
}

export default function BillSection({ cfg, set, openPanel, setOpenPanel }: Props) {
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
    { id: 'payment', label: 'Payment Options', icon: '💳', desc: 'Split payment, tips, discounts' },
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
    <div className="p-5">
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
          <BillAccordion id="payment">
            <Row label="Split payment" desc="Allow splitting the bill between cash and card">
              <Toggle checked={!!cfg.splitPaymentEnabled} onChange={v => set('splitPaymentEnabled', v)} />
            </Row>
            <Row label="Tips / gratuity" desc="Staff can add a tip before settling the bill">
              <Toggle checked={!!cfg.tipEnabled} onChange={v => set('tipEnabled', v)} />
            </Row>
            <Row label="Discounts" desc="Managers can apply a percentage or fixed discount" border={false}>
              <Toggle checked={!!cfg.discountEnabled} onChange={v => set('discountEnabled', v)} />
            </Row>
          </BillAccordion>

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
    </div>
  )
}
