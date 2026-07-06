'use client'
import { forwardRef } from 'react'

export interface BillConfig {
  paperSize: '80mm' | 'A5' | 'A4'
  showLogo: boolean
  vatNumber: string
  showTableNumber: boolean
  showWaiterName: boolean
  showOrderTime: boolean
  showModifiers: boolean
  showUnitPrice: boolean
  showVatBreakdown: boolean
  showServiceCharge: boolean
  footerMessage: string
  wifiName: string
  wifiPass: string
  socialsLine: string
  fontSize: 'sm' | 'md' | 'lg'
}

export const DEFAULT_BILL_CONFIG: BillConfig = {
  paperSize: '80mm',
  showLogo: true,
  vatNumber: '',
  showTableNumber: true,
  showWaiterName: false,
  showOrderTime: true,
  showModifiers: true,
  showUnitPrice: true,
  showVatBreakdown: true,
  showServiceCharge: false,
  footerMessage: 'Thank you for dining with us!',
  wifiName: '',
  wifiPass: '',
  socialsLine: '',
  fontSize: 'md',
}

interface ReceiptItem {
  name: string
  quantity: number
  unitPrice: number
  total: number
  modifiers?: { name: string; priceAdd: number }[]
}

interface ReceiptOrder {
  id: string
  createdAt: string
  user?: { name: string } | null
  approvedBy?: { name: string } | null
  items: {
    menuItem: { name: string }
    quantity: number
    unitPrice?: number
    total?: number
    modifiers?: { option?: { name: string; priceAdd: number } }[]
  }[]
}

export interface ReceiptData {
  sessionId: string
  table?: { name?: string; tableNumber?: number } | null
  orders: ReceiptOrder[]
  summary: { subtotal: number; vatAmount: number; total: number }
  restaurant: {
    restaurantName: string
    tagline?: string | null
    address?: string | null
    phone?: string | null
    logoUrl?: string | null
    vatNumber?: string | null
    vatRate?: number | null
    currency?: string | null
    currencySymbol?: string | null
    billConfig?: BillConfig | null
  }
}

const FONT_SIZE: Record<BillConfig['fontSize'], { base: string; sm: string; lg: string; xl: string }> = {
  sm: { base: '10px', sm: '9px',  lg: '12px', xl: '14px' },
  md: { base: '12px', sm: '10px', lg: '14px', xl: '16px' },
  lg: { base: '14px', sm: '11px', lg: '16px', xl: '18px' },
}

const PAPER_WIDTH: Record<BillConfig['paperSize'], string> = {
  '80mm': '302px',
  'A5':   '420px',
  'A4':   '595px',
}

interface Props {
  data: ReceiptData
  config: BillConfig
  receiptNumber?: string
  preview?: boolean
}

const BillReceipt = forwardRef<HTMLDivElement, Props>(({ data, config, receiptNumber, preview }, ref) => {
  const fs = FONT_SIZE[config.fontSize]
  const width = preview ? '100%' : PAPER_WIDTH[config.paperSize]
  const r = data.restaurant
  const currency = r.currencySymbol ?? r.currency ?? 'AED'
  const now = new Date()

  const allItems: ReceiptItem[] = data.orders.flatMap(order =>
    order.items.map(i => ({
      name: i.menuItem.name,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice ?? 0),
      total: Number(i.total ?? (Number(i.unitPrice ?? 0) * i.quantity)),
      modifiers: i.modifiers
        ?.filter(m => m.option)
        .map(m => ({ name: m.option!.name, priceAdd: Number(m.option!.priceAdd) })),
    }))
  )

  const subtotal = Number(data.summary.subtotal)
  const vatAmount = Number(data.summary.vatAmount)
  const total = Number(data.summary.total)

  const divider = (style: 'solid' | 'dashed' = 'dashed') => (
    <div style={{ borderTop: `1px ${style} #ccc`, margin: '6px 0' }} />
  )

  const row = (label: string, value: string, bold = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: fs.base, fontWeight: bold ? 700 : 400, marginBottom: '2px' }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )

  return (
    <div
      ref={ref}
      id="bill-receipt"
      style={{
        width,
        maxWidth: '100%',
        backgroundColor: '#fff',
        color: '#000',
        fontFamily: "'Courier New', Courier, monospace",
        padding: config.paperSize === '80mm' ? '12px 14px' : '24px 32px',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Header ── */}
      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        {config.showLogo && r.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.logoUrl} alt="logo" style={{ height: 48, objectFit: 'contain', marginBottom: 6, display: 'block', margin: '0 auto 6px' }} />
        )}
        <div style={{ fontSize: fs.xl, fontWeight: 700 }}>{r.restaurantName}</div>
        {r.tagline && <div style={{ fontSize: fs.sm, marginTop: 2 }}>{r.tagline}</div>}
        {r.address && <div style={{ fontSize: fs.sm, marginTop: 2 }}>{r.address}</div>}
        {r.phone && <div style={{ fontSize: fs.sm, marginTop: 1 }}>Tel: {r.phone}</div>}
        {config.vatNumber || r.vatNumber
          ? <div style={{ fontSize: fs.sm, marginTop: 1 }}>VAT No: {config.vatNumber || r.vatNumber}</div>
          : null
        }
      </div>

      {divider('solid')}

      {/* ── Meta ── */}
      <div style={{ fontSize: fs.sm, marginBottom: '6px' }}>
        {receiptNumber && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Receipt #</span><span>{receiptNumber}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Date</span>
          <span>{now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
        {config.showOrderTime && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Time</span>
            <span>{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
        {config.showTableNumber && data.table && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Table</span>
            <span>{data.table.name ?? `Table ${data.table.tableNumber}`}</span>
          </div>
        )}
        {config.showWaiterName && data.orders[0]?.approvedBy && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Served by</span>
            <span>{data.orders[0].approvedBy.name}</span>
          </div>
        )}
      </div>

      {divider()}

      {/* ── Items ── */}
      <div style={{ marginBottom: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: fs.sm, fontWeight: 700, marginBottom: 4 }}>
          <span style={{ width: 18, textAlign: 'left' }}>#</span>
          <span style={{ flex: 1 }}>Item</span>
          <span style={{ width: 30, textAlign: 'center' }}>Qty</span>
          {config.showUnitPrice && <span style={{ width: 52, textAlign: 'right' }}>Unit</span>}
          <span style={{ width: 60, textAlign: 'right' }}>Total</span>
        </div>
        {allItems.map((item, i) => (
          <div key={i} style={{ marginBottom: config.showModifiers && item.modifiers?.length ? 4 : 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: fs.base }}>
              <span style={{ width: 18, textAlign: 'left', color: '#888' }}>{i + 1}</span>
              <span style={{ flex: 1, paddingRight: 4 }}>{item.name}</span>
              <span style={{ width: 30, textAlign: 'center' }}>{item.quantity}</span>
              {config.showUnitPrice && (
                <span style={{ width: 52, textAlign: 'right' }}>{item.unitPrice.toFixed(2)}</span>
              )}
              <span style={{ width: 60, textAlign: 'right' }}>{item.total.toFixed(2)}</span>
            </div>
            {config.showModifiers && item.modifiers?.map((m, mi) => (
              <div key={mi} style={{ fontSize: fs.sm, paddingLeft: 8, color: '#555' }}>
                + {m.name}{m.priceAdd > 0 ? ` (+${m.priceAdd.toFixed(2)})` : ''}
              </div>
            ))}
          </div>
        ))}
      </div>

      {divider()}

      {/* ── Totals ── */}
      <div style={{ marginBottom: '6px' }}>
        {config.showVatBreakdown ? (
          <>
            {row(`Subtotal (excl. VAT)`, `${currency} ${subtotal.toFixed(2)}`)}
            {row(`VAT (${((r.vatRate ?? 0.05) * 100).toFixed(0)}%)`, `${currency} ${vatAmount.toFixed(2)}`)}
            {config.showServiceCharge && row('Service Charge', `${currency} 0.00`)}
            {divider('solid')}
            {row('TOTAL', `${currency} ${total.toFixed(2)}`, true)}
          </>
        ) : (
          row('TOTAL', `${currency} ${total.toFixed(2)}`, true)
        )}
      </div>

      {/* ── Footer ── */}
      {(config.footerMessage || config.wifiName || config.socialsLine) && (
        <>
          {divider()}
          <div style={{ textAlign: 'center', fontSize: fs.sm }}>
            {config.footerMessage && <div style={{ fontWeight: 600, marginBottom: 3 }}>{config.footerMessage}</div>}
            {config.wifiName && (
              <div style={{ marginBottom: 2 }}>
                WiFi: <strong>{config.wifiName}</strong>
                {config.wifiPass && <> · Pass: <strong>{config.wifiPass}</strong></>}
              </div>
            )}
            {config.socialsLine && <div>{config.socialsLine}</div>}
          </div>
        </>
      )}
    </div>
  )
})

BillReceipt.displayName = 'BillReceipt'
export default BillReceipt
