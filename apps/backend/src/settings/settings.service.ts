import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get() {
    let settings = await this.prisma.restaurantSettings.findFirst()
    if (!settings) {
      settings = await this.prisma.restaurantSettings.create({ data: {} })
    }
    return settings
  }

  async update(dto: Partial<{
    restaurantName: string
    tagline: string
    heroConfig: Record<string, any>
    phone: string
    address: string
    logoUrl: string
    openTime: string
    closeTime: string
    timezone: string
    totalTables: number
    defaultCapacity: number
    vatRate: number
    currency: string
    defaultPrepTimeMins: number
    bookingsEnabled: boolean
    slotDurationMins: number
    walkInBuffer: number
    peakHoursEnabled: boolean
    peakStart: string
    peakEnd: string
    noShowWindowOffPeak: number
    noShowWindowPeak: number
    maxBookingDaysAhead: number
    requireLoginToBook: boolean
    remindersEnabled: boolean
    reminderMinsBefore: number
    brandPreset: string
    brandColor: string
    showLanguageToggle: boolean
  }>) {
    const current = await this.get()
    return this.prisma.restaurantSettings.update({
      where: { id: current.id },
      data: dto,
    })
  }
}
