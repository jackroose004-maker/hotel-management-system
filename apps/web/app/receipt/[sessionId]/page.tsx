'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Download, Printer, ArrowLeft } from 'lucide-react'
import BillReceipt, { DEFAULT_BILL_CONFIG, type BillConfig, type ReceiptData } from '@/components/ui/BillReceipt'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

const PAPER_PX: Record<string, number> = { '80mm': 302, 'A5': 420, 'A4': 595 }
const PAPER_MM: Record<string, [number, number]> = {
  '80mm': [80, 200],   // width fixed, height auto (we override below)
  'A5':   [148, 210],
  'A4':   [210, 297],
}

export default function ReceiptPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [data, setData]     = useState<ReceiptData | null>(null)
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(true)
  const [pdfBusy, setPdfBusy] = useState(false)
  const receiptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`${API}/orders/session/${sessionId}/receipt`)
      .then(r => r.json())
      .then(json => {
        if (!json.success) throw new Error(json.error?.message ?? 'Not found')
        setData(json.data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [sessionId])

  const config: BillConfig = {
    ...DEFAULT_BILL_CONFIG,
    ...(data?.restaurant?.billConfig as Partial<BillConfig> ?? {}),
  }

  const handlePrint = () => window.print()

  const handlePdf = async () => {
    if (!receiptRef.current) return
    setPdfBusy(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(receiptRef.current, { scale: 2, useCORS: true, backgroundColor: '#fff' })
      const imgData = canvas.toDataURL('image/png')

      // Use actual paper dimensions in mm; height derived from canvas aspect ratio
      const paperW = PAPER_MM[config.paperSize]?.[0] ?? 80
      const paperH = (canvas.height / canvas.width) * paperW

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [paperW, paperH] })
      pdf.addImage(imgData, 'PNG', 0, 0, paperW, paperH)
      pdf.save(`receipt-${sessionId.slice(0, 8)}.pdf`)
    } catch (e: any) {
      alert(e?.message ?? 'PDF generation failed')
    } finally { setPdfBusy(false) }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 size={28} className="animate-spin text-gray-400" />
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50 p-6">
      <p className="text-gray-500 text-sm">{error}</p>
      <button onClick={() => window.history.back()} className="text-sm text-blue-500 flex items-center gap-1">
        <ArrowLeft size={14} /> Go back
      </button>
    </div>
  )

  if (!data) return null

  const paperPx = PAPER_PX[config.paperSize] ?? 302

  return (
    <>
      <style>{`
        @media print {
          ${config.paperSize !== '80mm' ? `@page { size: ${config.paperSize}; margin: 0; }` : '@page { margin: 0; }'}
          body * { visibility: hidden !important; }
          #receipt-card, #receipt-card * { visibility: visible !important; }
          #receipt-card {
            position: fixed !important;
            top: 0; left: 0;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
        }
      `}</style>

      <div className="min-h-screen bg-gray-100 py-8 px-4">
        {/* Action bar — constrained to paper width */}
        <div className="mx-auto mb-4 flex items-center justify-between" style={{ width: paperPx }}>
          <p className="text-xs text-gray-400 font-mono">
            #{sessionId.slice(0, 8).toUpperCase()}
          </p>
          <div className="flex gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
              <Printer size={14} /> Print
            </button>
            <button onClick={handlePdf} disabled={pdfBusy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50">
              {pdfBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {pdfBusy ? 'Generating…' : 'PDF'}
            </button>
          </div>
        </div>

        {/* Receipt — displayed at exact paper width, ref on this div for PDF capture */}
        <div
          ref={receiptRef}
          id="receipt-card"
          className="mx-auto shadow-xl rounded-lg overflow-hidden"
          style={{ width: paperPx }}
        >
          <BillReceipt
            data={data}
            config={config}
            receiptNumber={sessionId.slice(0, 8).toUpperCase()}
          />
        </div>
      </div>
    </>
  )
}
