// Printed table QR codes encode a full web URL, e.g. https://almanzil.example/menu?qr=table-abc123-169...
// (see apps/web/app/staff/tables/page.tsx getQrUrl()). The mobile scanner doesn't need to
// navigate there — it just needs the `qr` query param value to resolve via
// GET /tables/qr/:qrCode. This means existing printed QR codes work with zero backend or
// reprint changes.
export function extractQrCode(scannedValue: string): string | null {
  try {
    const url = new URL(scannedValue)
    const qr = url.searchParams.get('qr')
    if (qr) return qr
  } catch {
    // not a URL — fall through and treat the raw scanned value as the code itself
  }
  if (scannedValue.startsWith('table-')) return scannedValue
  return null
}
