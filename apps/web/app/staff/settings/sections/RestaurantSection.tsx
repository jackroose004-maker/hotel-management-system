'use client'
import React from 'react'
import { applyFavicon, applyBrandColor } from '@/store/brand'
import ImageUpload from '@/components/ui/ImageUpload'
import { BilingualField, Inp, Sel, Toggle, SectionLabel, FieldBlock } from './_controls'
import { TIMEZONES, CURRENCIES, type Cfg } from './_types'

interface Props { cfg: Cfg; set: <K extends keyof Cfg>(k: K, v: Cfg[K]) => void }

export default function RestaurantSection({ cfg, set }: Props) {
  return (
    <>
      <SectionLabel text="Identity" />
      <FieldBlock>
        <BilingualField label="Restaurant name"
          valueEn={cfg.restaurantName ?? ''} valueAr={cfg.restaurantNameAr ?? ''}
          placeholder="Al Manzil" placeholderAr="المنزل"
          onChangeEn={v => set('restaurantName', v)} onChangeAr={v => set('restaurantNameAr', v)} />
        <BilingualField label="Tagline"
          valueEn={cfg.tagline ?? ''} valueAr={cfg.taglineAr ?? ''}
          placeholder="Authentic Kerala cuisine" placeholderAr="مطبخ كيرالا الأصيل"
          onChangeEn={v => set('tagline', v)} onChangeAr={v => set('taglineAr', v)} />
      </FieldBlock>
      <SectionLabel text="Contact" />
      <FieldBlock>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Phone</p>
            <Inp value={cfg.phone} onChange={v => set('phone', v)} placeholder="+971 50 000 0000" />
          </div>
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Address</p>
            <Inp value={cfg.address} onChange={v => set('address', v)} placeholder="Al Karama, Dubai" />
          </div>
        </div>
      </FieldBlock>
      <SectionLabel text="Regional" />
      <FieldBlock>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Timezone</p>
            <Sel value={cfg.timezone} onChange={v => set('timezone', v)} options={TIMEZONES.map(t => ({ value: t, label: t.replace('Asia/', '') }))} />
          </div>
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Currency</p>
            <Sel value={cfg.currency} onChange={v => set('currency', v)} options={CURRENCIES.map(c => ({ value: c, label: c }))} />
          </div>
        </div>
      </FieldBlock>
      <SectionLabel text="Logo" />
      <FieldBlock>
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              Restaurant logo
            </p>
            <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
              Appears in the navigation bar, email templates, receipts, and browser tab. Use a clean square image with a transparent or white background for best results.
            </p>
            <div className="flex flex-wrap gap-2">
              {[['⬛', 'Square · 1 : 1'], ['📐', 'Min 256 × 256 px'], ['🖼️', 'PNG · WebP · JPG'], ['✨', 'Transparent bg ideal']].map(([icon, label]) => (
                <span key={label} className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border"
                  style={{ color: 'var(--text-muted)', borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>
                  {icon} {label}
                </span>
              ))}
            </div>
          </div>
          <div className="w-full sm:w-40 flex-shrink-0">
            <ImageUpload
              value={cfg.logoUrl}
              onChange={v => { set('logoUrl', v ?? ''); applyFavicon(v ?? '') }}
              folder="logos"
              publicId="logo"
              aspectRatio="square"
            />
          </div>
        </div>
      </FieldBlock>

      <SectionLabel text="Login Page Background" />
      <FieldBlock>
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              Background media
            </p>
            <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
              Shown on the customer sign-in screen — fills the left panel on desktop and covers the full screen on mobile. Upload a photo or a short looping video for a premium feel. Leave blank to use the default food photo.
            </p>
            <div className="flex flex-wrap gap-2">
              {[['📐', 'Portrait works best'], ['🖼️', 'JPG · WebP · PNG'], ['🎬', 'MP4 · WebM · MOV'], ['⏱️', 'Keep videos under 30s']].map(([icon, label]) => (
                <span key={label} className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border"
                  style={{ color: 'var(--text-muted)', borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>
                  {icon} {label}
                </span>
              ))}
            </div>
          </div>
          <div className="w-full sm:w-56 flex-shrink-0">
            <ImageUpload
              value={cfg.loginDesktopImage ?? ''}
              onChange={v => set('loginDesktopImage', v ?? '')}
              folder="backgrounds"
              publicId="login-bg"
              aspectRatio="free"
              mediaType="both"
            />
          </div>
        </div>
      </FieldBlock>

      <SectionLabel text="Brand Color" />
      <FieldBlock>
        <div className="flex items-center gap-4">
          <div className="relative">
            <input
              type="color"
              value={cfg.brandColor ?? 'var(--brand)'}
              onChange={e => { set('brandColor', e.target.value); applyBrandColor(e.target.value) }}
              className="w-12 h-12 rounded-xl cursor-pointer border-0 p-0.5"
              style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--card-border)' }}
            />
          </div>
          <div>
            <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>
              Accent color — used across all public pages
            </p>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {cfg.brandColor ?? 'var(--brand)'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 ml-auto">
            {[
              { hex: '#C9A84C', name: 'Champagne Gold' },
              { hex: '#9B2335', name: 'Burgundy' },
              { hex: '#2E5FA3', name: 'Royal Blue' },
              { hex: '#673147', name: 'Deep Plum' },
              { hex: '#C4817A', name: 'Rose Gold' },
              { hex: '#2A7F7F', name: 'Teal' },
              { hex: '#8B6914', name: 'Antique Gold' },
              { hex: '#5C4033', name: 'Dark Mocha' },
            ].map(({ hex, name }) => (
              <button key={hex} onClick={() => { set('brandColor', hex); applyBrandColor(hex) }}
                className="w-7 h-7 rounded-lg border-2 transition-all hover:scale-110"
                style={{ backgroundColor: hex, borderColor: cfg.brandColor === hex ? '#fff' : 'transparent' }}
                title={name}
              />
            ))}
          </div>
        </div>
      </FieldBlock>

      <SectionLabel text="Localization" />
      <FieldBlock border={false}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Show language toggle</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Displays an AR / EN switcher on the public website navbar and mobile menu</p>
          </div>
          <Toggle checked={cfg.showLanguageToggle ?? false} onChange={v => set('showLanguageToggle', v)} />
        </div>
      </FieldBlock>
    </>
  )
}
