import { Injectable } from '@nestjs/common'
import puppeteer from 'puppeteer'
import * as QRCode from 'qrcode'

@Injectable()
export class PdfService {

  async generateBookingTicket(params: {
    ref: string
    guestName: string
    slotDate: string
    slotTime: string
    tableNumber: string
    zone: string
    partySize: number
    graceMin: number
    brandColor: string
    restaurantName: string
    logoUrl?: string
    hasPreOrder: boolean
    preOrderItems?: { name: string; qty: number; amount: string; modifiers?: { name: string; priceAdd: string }[] }[]
    preOrderTotal?: string
    frontendUrl: string
    qrRef?: string  // UUID for QR scan; falls back to ref if not provided
  }): Promise<Buffer> {

    const qrUrl = `${params.frontendUrl}/book/arrive/${params.qrRef ?? params.ref}`
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 400,
      margin: 1,
      color: { dark: '#111111', light: '#ffffff' },
    })

    const darken = (hex: string, amt = 40) => {
      const n = parseInt(hex.replace('#', ''), 16)
      const r = Math.max(0, (n >> 16) - amt)
      const g = Math.max(0, ((n >> 8) & 0xff) - amt)
      const b = Math.max(0, (n & 0xff) - amt)
      return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
    }
    const brandDark = darken(params.brandColor)

    const preOrderSection = params.hasPreOrder && params.preOrderItems?.length
      ? `
        <div class="po-block">
          <div class="po-tag">Pre-Order · Fires on Arrival</div>
          <table class="po-table">
            ${params.preOrderItems.map(i => `
              <tr>
                <td class="po-left">
                  <div class="po-name">${i.qty}× ${i.name}</div>
                </td>
                <td class="po-amt">AED ${i.amount}</td>
              </tr>
              ${(i.modifiers ?? []).map(m => `
              <tr>
                <td class="po-left"><div class="po-mods" style="padding-left:14px;">+ ${m.name}</div></td>
                <td class="po-amt" style="font-size:12px;color:#888;">AED ${m.priceAdd}</td>
              </tr>`).join('')}`).join('')}
          </table>
          <div class="po-total-row">
            <span class="po-total-label">Pre-order total</span>
            <span class="po-total-val">AED ${params.preOrderTotal}</span>
          </div>
          <div class="po-note">Your food goes to the kitchen the moment you scan in.</div>
        </div>`
      : ''

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: transparent; display: block; width: 620px; padding: 10px; }

  .ticket {
    width: 600px;
    margin: 0 auto;
    background: #fff;
    border-radius: 24px;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(0,0,0,0.15);
  }

  /* ── HEADER ── */
  .head {
    background: linear-gradient(140deg, ${params.brandColor} 0%, ${brandDark} 100%);
    padding: 36px 36px 30px;
    position: relative;
    overflow: hidden;
  }
  .head::before {
    content: ''; position: absolute;
    top: -50px; right: -50px;
    width: 200px; height: 200px;
    border-radius: 50%; background: rgba(255,255,255,0.06);
  }
  .head-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
  .brand-row { display: flex; align-items: center; gap: 12px; }
  .brand-logo { width: 48px; height: 48px; border-radius: 12px; object-fit: cover; }
  .brand-name { font-size: 18px; font-weight: 800; color: #fff; }
  .brand-sub  { font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
  .badge {
    background: rgba(255,255,255,0.18);
    border: 1px solid rgba(255,255,255,0.32);
    border-radius: 30px;
    padding: 6px 16px;
    font-size: 11px; font-weight: 700; color: #fff;
    letter-spacing: 1px; text-transform: uppercase;
  }
  .time-big { font-size: 56px; font-weight: 900; color: #fff; letter-spacing: -2px; line-height: 1; margin-bottom: 6px; }
  .date-sub  { font-size: 15px; color: rgba(255,255,255,0.78); font-weight: 500; }

  /* ── TEAR ── */
  .tear { display: flex; align-items: center; background: #efefef; }
  .tear-dot  { width: 26px; height: 26px; border-radius: 50%; background: #efefef; flex-shrink: 0; }
  .tear-line { flex: 1; border-top: 2.5px dashed #d8d8d8; margin: 0 3px; }

  /* ── BODY ── */
  .body { padding: 28px 36px; }

  /* ref */
  .ref-row {
    display: flex; align-items: center; justify-content: space-between;
    background: #f7f7f7; border: 1px solid #eaeaea;
    border-radius: 12px; padding: 12px 18px; margin-bottom: 24px;
  }
  .ref-label { font-size: 10px; font-weight: 800; color: #bbb; letter-spacing: 2px; text-transform: uppercase; }
  .ref-val   { font-family: 'Courier New', monospace; font-size: 16px; font-weight: 900; color: #111; letter-spacing: 3px; }

  /* guest */
  .guest-row {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 18px; background: #f7f7f7;
    border-radius: 12px; margin-bottom: 22px;
  }
  .avatar {
    width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0;
    background: linear-gradient(135deg, ${params.brandColor}, ${brandDark});
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; font-weight: 900; color: #fff;
  }
  .guest-name { font-size: 16px; font-weight: 700; color: #111; }
  .guest-meta { font-size: 12px; color: #888; margin-top: 3px; }

  /* detail grid — 2 cols */
  .details {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 18px; margin-bottom: 24px;
  }
  .d-label { font-size: 10px; font-weight: 800; color: #bbb; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 4px; }
  .d-val   { font-size: 16px; font-weight: 700; color: #111; }
  .d-val.accent { color: ${params.brandColor}; font-size: 20px; font-weight: 900; }

  /* QR */
  .qr-block {
    background: #fafafa; border: 1px solid #e8e8e8;
    border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 20px;
  }
  .qr-block img { width: 200px; height: 200px; border-radius: 10px; display: block; margin: 0 auto 14px; }
  .qr-head { font-size: 14px; font-weight: 700; color: #222; margin-bottom: 5px; }
  .qr-sub  { font-size: 11px; color: #aaa; line-height: 1.6; }

  /* pre-order */
  .po-block {
    background: linear-gradient(135deg, ${params.brandColor}14 0%, ${params.brandColor}06 100%);
    border: 1px solid ${params.brandColor}30;
    border-radius: 14px; padding: 18px 20px; margin-bottom: 20px;
  }
  .po-tag  { font-size: 10px; font-weight: 800; color: ${params.brandColor}; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 14px; }
  .po-table { width: 100%; border-collapse: collapse; }
  .po-left  { padding: 5px 0; vertical-align: top; }
  .po-name  { font-size: 14px; color: #222; font-weight: 500; }
  .po-mods  { font-size: 11px; color: #888; margin-top: 2px; }
  .po-amt   { font-size: 14px; font-weight: 600; color: #111; text-align: right; padding: 5px 0; vertical-align: top; white-space: nowrap; }
  .po-total-row { display: flex; justify-content: space-between; align-items: baseline; margin-top: 14px; padding-top: 14px; border-top: 1px solid ${params.brandColor}20; }
  .po-total-label { font-size: 12px; color: #888; }
  .po-total-val   { font-size: 18px; font-weight: 900; color: ${params.brandColor}; }
  .po-note { font-size: 11px; color: #999; margin-top: 10px; line-height: 1.5; }

  /* notice */
  .notice {
    background: #fffbf0; border: 1px solid #fde68a;
    border-radius: 12px; padding: 14px 18px;
    font-size: 13px; color: #92400e; line-height: 1.7;
    margin-bottom: 20px;
  }

  /* footer */
  .foot {
    background: #111; padding: 16px 36px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .foot-l { font-size: 11px; color: rgba(255,255,255,0.3); }
  .foot-r { font-family: 'Courier New', monospace; font-size: 11px; color: rgba(255,255,255,0.22); letter-spacing: 2px; }
</style>
</head>
<body>
<div class="ticket">

  <div class="head">
    <div class="head-top">
      <div class="brand-row">
        ${params.logoUrl ? `<img class="brand-logo" src="${params.logoUrl}" alt="${params.restaurantName}"/>` : ''}
        <div>
          <div class="brand-name">${params.restaurantName}</div>
          <div class="brand-sub">Table Reservation</div>
        </div>
      </div>
      <div class="badge">Confirmed</div>
    </div>
    <div class="time-big">${params.slotTime}</div>
    <div class="date-sub">${params.slotDate}</div>
  </div>

  <div class="tear">
    <div class="tear-dot" style="margin-left:-13px;"></div>
    <div class="tear-line"></div>
    <div class="tear-dot" style="margin-right:-13px;"></div>
  </div>

  <div class="body">

    <div class="ref-row">
      <span class="ref-label">Booking Ref</span>
      <span class="ref-val">${params.ref}</span>
    </div>

    <div class="guest-row">
      <div class="avatar">${params.guestName.charAt(0).toUpperCase()}</div>
      <div>
        <div class="guest-name">${params.guestName}</div>
        <div class="guest-meta">${params.partySize} ${params.partySize === 1 ? 'guest' : 'guests'} · ${params.zone} seating</div>
      </div>
    </div>

    <div class="details">
      <div>
        <div class="d-label">Date</div>
        <div class="d-val">${params.slotDate}</div>
      </div>
      <div>
        <div class="d-label">Time</div>
        <div class="d-val accent">${params.slotTime}</div>
      </div>
      <div>
        <div class="d-label">Table</div>
        <div class="d-val">${params.tableNumber}</div>
      </div>
      <div>
        <div class="d-label">Party Size</div>
        <div class="d-val">${params.partySize} ${params.partySize === 1 ? 'person' : 'people'}</div>
      </div>
    </div>

    <div class="qr-block">
      <img src="${qrDataUrl}" alt="Booking QR"/>
      <div class="qr-head">Scan at the entrance to check in instantly</div>
      <div class="qr-sub">One scan marks your arrival — no need to speak to staff.<br/>Your table will be ready within seconds.</div>
    </div>

    ${preOrderSection}

    <div class="notice">
      ⏱ &nbsp;Please arrive within <strong>${params.graceMin} minutes</strong> of your slot time.
      After that, your table may be released to other guests.${params.hasPreOrder ? '<br/>🍽 Your pre-ordered food fires to the kitchen the moment you scan in.' : ''}
    </div>

  </div>

  <div class="foot">
    <span class="foot-l">© ${params.restaurantName} · Dubai, UAE</span>
    <span class="foot-r">${params.ref}</span>
  </div>

</div>
</body>
</html>`

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    try {
      const page = await browser.newPage()
      await page.setViewport({ width: 620, height: 1200, deviceScaleFactor: 2 })
      await page.setContent(html, { waitUntil: 'load' })
      const rect = await page.evaluate(() => {
        const el = document.querySelector('.ticket')
        if (!el) return { x: 0, y: 0, width: 600, height: 1000 }
        const r = el.getBoundingClientRect()
        return { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 10), width: r.width + 20, height: r.height + 20 }
      })
      await page.setViewport({ width: 620, height: Math.ceil(rect.height + rect.y + 10), deviceScaleFactor: 2 })
      const png = await page.screenshot({
        type: 'png',
        clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        omitBackground: true,
      })
      return Buffer.from(png)
    } finally {
      await browser.close()
    }
  }
}
