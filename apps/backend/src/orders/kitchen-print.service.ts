import { Injectable, Logger } from '@nestjs/common'
import * as net from 'net'
import { SettingsService } from '../settings/settings.service'

@Injectable()
export class KitchenPrintService {
  private readonly logger = new Logger(KitchenPrintService.name)

  constructor(private settings: SettingsService) {}

  async printKOT(order: {
    id: string
    type: string
    tokenNumber?: number | null
    notes?: string | null
    table?: { tableNumber: number; name?: string | null } | null
    items: { quantity: number; notes?: string | null; menuItem: { name: string } }[]
  }) {
    const s = await this.settings.get()

    if (!s.thermalEnabled) {
      this.logger.log(`[KOT] SKIP — thermal printer disabled (orderId=${order.id.slice(-6).toUpperCase()})`)
      return
    }
    if (!s.thermalPrinterIp) {
      this.logger.warn(`[KOT] SKIP — thermalEnabled=true but no printer IP configured (orderId=${order.id.slice(-6).toUpperCase()})`)
      return
    }

    const label = order.type === 'DINE_IN'
      ? (order.table?.name ?? `TABLE ${order.table?.tableNumber}`)
      : `TAKEAWAY #${order.tokenNumber}`

    const itemSummary = order.items.map(i => `${i.quantity}×${i.menuItem.name}`).join(', ')
    this.logger.log(`[KOT] Sending → ${s.thermalPrinterIp}:${s.thermalPrinterPort} | ${label} | orderId=${order.id.slice(-6).toUpperCase()} | items: ${itemSummary}`)

    const time = new Date().toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', hour12: false })

    // ESC/POS commands
    const ESC = '\x1b'
    const GS  = '\x1d'
    const LF  = '\n'
    const INIT        = ESC + '@'
    const BOLD_ON     = ESC + 'E' + '\x01'
    const BOLD_OFF    = ESC + 'E' + '\x00'
    const CENTER      = ESC + 'a' + '\x01'
    const LEFT        = ESC + 'a' + '\x00'
    const DOUBLE_SIZE = GS + '!' + '\x11'
    const NORMAL_SIZE = GS + '!' + '\x00'
    const CUT         = GS + 'V' + '\x41' + '\x03'

    let doc = INIT
    doc += CENTER + BOLD_ON + 'KITCHEN ORDER TICKET' + BOLD_OFF + LF
    doc += LEFT + '--------------------------------' + LF
    doc += BOLD_ON + DOUBLE_SIZE + label + NORMAL_SIZE + BOLD_OFF + LF
    doc += `Time: ${time}` + LF
    doc += '--------------------------------' + LF

    for (const item of order.items) {
      doc += BOLD_ON + `${item.quantity}x  ${item.menuItem.name}` + BOLD_OFF + LF
      if (item.notes) doc += `     >> ${item.notes}` + LF
    }

    if (order.notes) {
      doc += '--------------------------------' + LF
      doc += `NOTE: ${order.notes}` + LF
    }

    doc += '--------------------------------' + LF + LF + LF
    doc += CUT

    await this.sendToprinter(s.thermalPrinterIp, s.thermalPrinterPort, doc, label, order.id)
  }

  private sendToprinter(ip: string, port: number, data: string, label: string, orderId: string): Promise<void> {
    return new Promise((resolve) => {
      const client = new net.Socket()
      const shortId = orderId.slice(-6).toUpperCase()
      const timeout = setTimeout(() => {
        client.destroy()
        this.logger.warn(`[KOT] TIMEOUT — printer ${ip}:${port} did not respond within 3s (orderId=${shortId})`)
        resolve()
      }, 3000)

      client.connect(port, ip, () => {
        client.write(data, 'binary', () => {
          clearTimeout(timeout)
          client.destroy()
          this.logger.log(`[KOT] ✓ PRINTED — ${label} | orderId=${shortId} | printer=${ip}:${port}`)
          resolve()
        })
      })

      client.on('error', (err) => {
        clearTimeout(timeout)
        client.destroy()
        this.logger.warn(`[KOT] ✗ ERROR — printer=${ip}:${port} orderId=${shortId} | ${err.message}`)
        resolve()
      })
    })
  }
}
