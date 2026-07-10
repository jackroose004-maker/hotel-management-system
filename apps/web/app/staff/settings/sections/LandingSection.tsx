'use client'
import React from 'react'
import { Loader2, Trash2, ChevronDown, Zap, Plus } from 'lucide-react'
import { CheckCircle2, UtensilsCrossed } from 'lucide-react'
import ImageUpload from '@/components/ui/ImageUpload'
import toast from 'react-hot-toast'
import { BilingualField, Inp, inputCls } from './_controls'
import type { Cfg, HeroConfig, MenuItem } from './_types'
import { uploadVideo } from '@/lib/upload'

interface Props {
  cfg: Cfg
  set: <K extends keyof Cfg>(k: K, v: Cfg[K]) => void
  menuItems: MenuItem[]
  videoUploading: boolean
  setVideoUploading: (v: boolean) => void
  openPanel: string
  setOpenPanel: (v: string) => void
}

export default function LandingSection({ cfg, set, menuItems, videoUploading, setVideoUploading, openPanel, setOpenPanel }: Props) {
  const [dishCat, setDishCat] = React.useState('All')
  const [dishQ, setDishQ] = React.useState('')
  const [videoPasteUrl, setVideoPasteUrl] = React.useState('')
  const [imgPasteUrl, setImgPasteUrl] = React.useState('')

  const hc = cfg.heroConfig ?? {} as HeroConfig
  const setHc = (k: keyof HeroConfig, v: string | string[] | null) =>
    set('heroConfig', { ...hc, [k]: v } as any)

  const dishCategories = ['All', ...Array.from(new Set(menuItems.map(i => (i as any).category?.name).filter(Boolean) as string[]))]
  const filteredDishes = menuItems.filter(i =>
    (dishCat === 'All' || (i as any).category?.name === dishCat) &&
    (!dishQ || i.name.toLowerCase().includes(dishQ.toLowerCase()))
  )

  const panels = [
    { id: 'hero',       label: 'Hero',              icon: '🎬', desc: 'Headline, subtext, buttons & background media' },
    { id: 'dishes',     label: 'Signature Dishes',  icon: '🍽️', desc: 'Featured dish section & card selection' },
    { id: 'relay',      label: 'Food Relay',        icon: '🔥', desc: 'Diagonal image gallery & headline' },
    { id: 'ambience',   label: 'Ambience',          icon: '🌿', desc: 'Space section text & photos' },
    { id: 'reviews',    label: 'Guest Reviews',     icon: '⭐', desc: 'Reviews section headline' },
  ]

  const Accordion = ({ id, children }: { id: string; children: React.ReactNode }) => {
    const panel = panels.find(p => p.id === id)!
    const open = openPanel === id
    return (
      <div className="overflow-hidden transition-all"
        style={{
          border: `1px solid ${open ? 'rgba(var(--brand-rgb),0.35)' : 'var(--card-border)'}`,
          borderRadius: 14,
          backgroundColor: 'var(--card-bg)',
          marginBottom: 8,
          boxShadow: open ? '0 0 0 3px rgba(var(--brand-rgb),0.06)' : 'none',
        }}>
        <button type="button" onClick={() => setOpenPanel(open ? '' : id)}
          className="w-full flex items-center gap-3.5 px-5 py-3.5 text-left transition-all">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 transition-all"
            style={{ backgroundColor: open ? 'rgba(var(--brand-rgb),0.12)' : 'var(--muted-bg)' }}>
            {panel.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight" style={{ color: open ? 'var(--brand)' : 'var(--text-primary)' }}>{panel.label}</p>
            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{panel.desc}</p>
          </div>
          <ChevronDown size={15} style={{
            color: open ? 'var(--brand)' : 'var(--text-muted)',
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }} />
        </button>
        {open && (
          <div className="px-5 pb-5 pt-1 space-y-5 border-t" style={{ borderColor: 'rgba(var(--brand-rgb),0.12)' }}>
            {children}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="px-5 py-4">
      {/* HERO */}
      <Accordion id="hero">
        <div className="space-y-4">
          {([
            { key: 'line1',     keyAr: 'line1Ar',     label: 'Headline line 1', placeholder: 'Taste of',                              placeholderAr: 'طعم'                              },
            { key: 'line2',     keyAr: 'line2Ar',     label: 'Headline line 2', placeholder: 'Kerala',                                placeholderAr: 'كيرالا'                            },
            { key: 'subtext',   keyAr: 'subtextAr',   label: 'Sub-text',        placeholder: 'Authentic South Indian cuisine · Dubai', placeholderAr: 'مطبخ جنوب الهند الأصيل · دبي'   },
            { key: 'badgeText', keyAr: 'badgeTextAr', label: 'Badge text',      placeholder: 'Now Open · Dubai, UAE',                  placeholderAr: 'مفتوح الآن · دبي'                },
          ] as { key: keyof HeroConfig; keyAr: keyof HeroConfig; label: string; placeholder: string; placeholderAr: string }[]).map(f => (
            <BilingualField key={f.key as string}
              label={f.label}
              valueEn={(hc[f.key] as string) ?? ''}
              valueAr={(hc[f.keyAr] as string) ?? ''}
              placeholder={f.placeholder}
              placeholderAr={f.placeholderAr}
              onChangeEn={v => setHc(f.key, v)}
              onChangeAr={v => setHc(f.keyAr, v)}
            />
          ))}
        </div>
        <div className="pt-1 border-t" style={{ borderColor: 'var(--card-border)' }}>
          <p className="text-xs font-semibold mb-3 mt-3" style={{ color: 'var(--text-muted)' }}>Buttons</p>
          <div className="space-y-4">
            <BilingualField label="Primary button"
              valueEn={hc.ctaLabel ?? ''} valueAr={hc.ctaLabelAr ?? ''}
              placeholder="Order Now" placeholderAr="اطلب الآن"
              onChangeEn={v => setHc('ctaLabel', v)} onChangeAr={v => setHc('ctaLabelAr', v)} />
            <BilingualField label="Secondary button"
              valueEn={hc.ctaSecondaryLabel ?? ''} valueAr={hc.ctaSecondaryLabelAr ?? ''}
              placeholder="Reserve a Table" placeholderAr="احجز طاولة"
              onChangeEn={v => setHc('ctaSecondaryLabel', v)} onChangeAr={v => setHc('ctaSecondaryLabelAr', v)} />
          </div>
        </div>
        <div className="pt-1 border-t" style={{ borderColor: 'var(--card-border)' }}>
          <p className="text-xs font-semibold mb-3 mt-3" style={{ color: 'var(--text-muted)' }}>Background media</p>
          <div className="flex gap-2 mb-4">
            {(['video', 'image'] as const).map(t => (
              <button key={t} type="button"
                onClick={() => setHc('heroMediaType', t)}
                className="flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all"
                style={{
                  backgroundColor: (hc.heroMediaType ?? 'video') === t ? 'var(--brand)' : 'var(--card-bg)',
                  color: (hc.heroMediaType ?? 'video') === t ? '#000' : 'var(--text-muted)',
                  border: '1px solid var(--card-border)',
                }}>
                {t === 'video' ? '🎬 Video' : '🖼️ Image'}
              </button>
            ))}
          </div>
          {(hc.heroMediaType ?? 'video') === 'video' ? (
            <div className="flex flex-col gap-2">
              {hc.videoUrl ? (
                <video key={hc.videoUrl} src={hc.videoUrl}
                  className="w-full rounded-xl object-cover" style={{ aspectRatio: '16/9' }}
                  muted playsInline autoPlay loop />
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 w-full rounded-xl cursor-pointer transition-all text-xs font-semibold"
                  style={{ border: '1.5px dashed rgba(var(--brand-rgb),0.4)', color: 'var(--brand)', backgroundColor: 'rgba(var(--brand-rgb),0.04)', aspectRatio: '16/9' }}>
                  {videoUploading ? <><Loader2 size={13} className="animate-spin" /> Uploading…</> : <><Zap size={13} /> Choose MP4</>}
                  <input type="file" accept="video/mp4,video/*" className="hidden" disabled={videoUploading}
                    onChange={async e => {
                      const file = e.target.files?.[0]; if (!file) return
                      setVideoUploading(true)
                      try { const url = await uploadVideo(file, 'backgrounds'); setHc('videoUrl', url); toast.success('Video uploaded!') }
                      catch (err: any) { toast.error(err.message ?? 'Upload failed') }
                      finally { setVideoUploading(false) }
                    }} />
                </label>
              )}
              <div className="flex gap-1.5">
                <input value={videoPasteUrl} onChange={e => setVideoPasteUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && videoPasteUrl.trim()) { setHc('videoUrl', videoPasteUrl.trim()); setVideoPasteUrl('') } }}
                  placeholder="Paste video URL to replace…" className={inputCls}
                  style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }} />
                {hc.videoUrl && (
                  <>
                    <label className="flex items-center gap-1 px-3 rounded-lg cursor-pointer text-[11px] font-semibold flex-shrink-0"
                      style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                      {videoUploading ? <Loader2 size={11} className="animate-spin" /> : <><Zap size={11} /> Replace</>}
                      <input type="file" accept="video/mp4,video/*" className="hidden" disabled={videoUploading}
                        onChange={async e => {
                          const file = e.target.files?.[0]; if (!file) return
                          setVideoUploading(true)
                          try { const url = await uploadVideo(file, 'backgrounds'); setHc('videoUrl', url); toast.success('Video uploaded!') }
                          catch (err: any) { toast.error(err.message ?? 'Upload failed') }
                          finally { setVideoUploading(false) }
                        }} />
                    </label>
                    <button onClick={() => setHc('videoUrl', '')}
                      className="px-2.5 rounded-lg text-[11px] font-semibold flex-shrink-0"
                      style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                      Remove
                    </button>
                  </>
                )}
                {videoPasteUrl.trim() && (
                  <button onClick={() => { setHc('videoUrl', videoPasteUrl.trim()); setVideoPasteUrl('') }}
                    className="px-3 rounded-lg text-[11px] font-semibold flex-shrink-0"
                    style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                    Apply
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <ImageUpload value={hc.heroImageUrl ?? ''} onChange={v => setHc('heroImageUrl', v ?? '')}
                folder="backgrounds" publicId="hero-image" aspectRatio="video" />
              <div className="flex gap-1.5">
                <input value={imgPasteUrl} onChange={e => setImgPasteUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && imgPasteUrl.trim()) { setHc('heroImageUrl', imgPasteUrl.trim()); setImgPasteUrl('') } }}
                  placeholder="Paste image URL to replace…" className={inputCls}
                  style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }} />
                {imgPasteUrl.trim() && (
                  <button onClick={() => { setHc('heroImageUrl', imgPasteUrl.trim()); setImgPasteUrl('') }}
                    className="px-3 rounded-lg text-[11px] font-semibold flex-shrink-0"
                    style={{ backgroundColor: 'var(--brand)', color: '#000' }}>
                    Apply
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </Accordion>

      {/* DISHES */}
      <Accordion id="dishes">
        <div className="space-y-4 mb-5 pb-5" style={{ borderBottom: '1px solid var(--card-border)' }}>
          <BilingualField label="Section eyebrow label"
            valueEn={hc.dishesSubtext ?? ''} valueAr={hc.dishesSubtextAr ?? ''}
            placeholder="Signature Dishes" placeholderAr="أطباقنا المميزة"
            onChangeEn={v => setHc('dishesSubtext', v)} onChangeAr={v => setHc('dishesSubtextAr', v)} />
          <BilingualField label="Section headline"
            valueEn={hc.dishesHeadline ?? ''} valueAr={hc.dishesHeadlineAr ?? ''}
            placeholder="Dishes you'll dream about." placeholderAr="أطباق ستحلم بها."
            onChangeEn={v => setHc('dishesHeadline', v)} onChangeAr={v => setHc('dishesHeadlineAr', v)} />
        </div>
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Dish Cards</p>
        <div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Pick dishes to feature on the landing page. They rotate 6 at a time. Leave empty to auto-show top dishes.
          </p>
          {menuItems.length === 0 ? (
            <p className="text-xs py-3 text-center" style={{ color: 'var(--text-muted)' }}>Loading menu items…</p>
          ) : (
            <>
              <div className="flex flex-col gap-2 mb-3">
                <input
                  value={dishQ} onChange={e => setDishQ(e.target.value)}
                  placeholder="Search dishes…"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }}
                />
                <div className="flex gap-1.5 flex-wrap">
                  {dishCategories.map(cat => (
                    <button key={cat} type="button" onClick={() => setDishCat(cat)}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all"
                      style={{
                        backgroundColor: dishCat === cat ? 'var(--brand)' : 'var(--card-bg)',
                        color: dishCat === cat ? '#000' : 'var(--text-muted)',
                        border: `1px solid ${dishCat === cat ? 'var(--brand)' : 'var(--card-border)'}`,
                      }}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-1">
                {filteredDishes.map(item => {
                  const anyItem = item as any
                  const selected = (hc.signatureDishIds ?? []).includes(item.id)
                  const atCap = !selected && (hc.signatureDishIds ?? []).length >= 12
                  const thumb = anyItem.videoUrl || item.imageUrl
                  const isVideo = !!anyItem.videoUrl
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (atCap) { toast.error('Remove a dish first — max 12 selected'); return }
                        const ids = hc.signatureDishIds ?? []
                        setHc('signatureDishIds', selected ? ids.filter(id => id !== item.id) : [...ids, item.id])
                      }}
                      className="flex items-center gap-3 p-2.5 rounded-xl text-left transition-all"
                      style={{
                        border: selected ? '1.5px solid var(--brand)' : '1px solid var(--card-border)',
                        backgroundColor: selected ? 'rgba(var(--brand-rgb),0.08)' : 'var(--card-bg)',
                        opacity: atCap ? 0.4 : 1,
                        cursor: atCap ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <div className="relative flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden">
                        {thumb
                          ? isVideo
                            ? <video src={thumb} className="w-full h-full object-cover" muted autoPlay loop playsInline />
                            : <img src={thumb} alt={item.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)' }}><UtensilsCrossed size={16} style={{ color: 'var(--brand)' }} /></div>
                        }
                        {selected && (
                          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.7)' }}>
                            <CheckCircle2 size={16} className="text-black" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: selected ? 'var(--brand)' : 'var(--text-primary)' }}>{item.name}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                          {anyItem.category?.name && <span className="mr-1.5">{anyItem.category.name} ·</span>}AED {item.price}
                        </p>
                      </div>
                    </button>
                  )
                })}
                {filteredDishes.length === 0 && <p className="text-xs col-span-2 py-4 text-center" style={{ color: 'var(--text-muted)' }}>No dishes match</p>}
              </div>
            </>
          )}
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{(hc.signatureDishIds ?? []).length}/12 selected</p>
            {(hc.signatureDishIds ?? []).length > 0 && (
              <button type="button" onClick={() => setHc('signatureDishIds', [])}
                className="flex items-center gap-1 text-xs transition-colors hover:opacity-70"
                style={{ color: 'var(--text-muted)' }}>
                <Trash2 size={11} /> Clear &amp; use live menu
              </button>
            )}
          </div>
        </div>
      </Accordion>

      {/* FOOD RELAY */}
      <Accordion id="relay">
        <div className="space-y-4">
          <BilingualField label="Eyebrow label"
            valueEn={hc.relayTagline ?? ''} valueAr={hc.relayTaglineAr ?? ''}
            placeholder="The Kitchen's Finest" placeholderAr="أجود ما في المطبخ"
            onChangeEn={v => setHc('relayTagline', v)} onChangeAr={v => setHc('relayTaglineAr', v)} />
          <BilingualField label="Headline line 1 (white)"
            valueEn={hc.relayHeadline ?? ''} valueAr={hc.relayHeadlineAr ?? ''}
            placeholder="Made fresh," placeholderAr="يُحضَّر طازجاً،"
            onChangeEn={v => setHc('relayHeadline', v)} onChangeAr={v => setHc('relayHeadlineAr', v)} />
          <BilingualField label="Headline line 2 (gold gradient)"
            valueEn={hc.relayHeadlinePart2 ?? ''} valueAr={hc.relayHeadlinePart2Ar ?? ''}
            placeholder="every single day." placeholderAr="كل يوم بلا استثناء."
            onChangeEn={v => setHc('relayHeadlinePart2', v)} onChangeAr={v => setHc('relayHeadlinePart2Ar', v)} />
        </div>
      </Accordion>

      {/* AMBIENCE */}
      <Accordion id="ambience">
        <div className="space-y-4">
          <BilingualField label="Eyebrow label"
            valueEn={hc.ambienceTagline ?? ''} valueAr={hc.ambienceTaglineAr ?? ''}
            placeholder="The Space" placeholderAr="المكان"
            onChangeEn={v => setHc('ambienceTagline', v)} onChangeAr={v => setHc('ambienceTaglineAr', v)} />
          <BilingualField label="Headline line 1 (white)"
            valueEn={hc.ambienceHeadline ?? ''} valueAr={hc.ambienceHeadlineAr ?? ''}
            placeholder="Come for the food." placeholderAr="تعال من أجل الطعام."
            onChangeEn={v => setHc('ambienceHeadline', v)} onChangeAr={v => setHc('ambienceHeadlineAr', v)} />
          <BilingualField label="Headline line 2 (gold gradient)"
            valueEn={hc.ambienceHeadlinePart2 ?? ''} valueAr={hc.ambienceHeadlinePart2Ar ?? ''}
            placeholder="Stay for the feeling." placeholderAr="وابقَ من أجل التجربة."
            onChangeEn={v => setHc('ambienceHeadlinePart2', v)} onChangeAr={v => setHc('ambienceHeadlinePart2Ar', v)} />
        </div>
        <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--card-border)' }}>
          <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Ambience Photos</p>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Add as many photos as you like. First 4 show at once; extras rotate automatically every 6 s.
          </p>
          {(() => {
            const imgs: string[] = Array.isArray(hc.ambienceImages) ? hc.ambienceImages : []
            const setImgs = (next: string[]) => setHc('ambienceImages', next)
            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-4">
                  {imgs.map((url, idx) => (
                    <div key={idx} className="relative">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Photo {idx + 1}</p>
                        <button type="button" onClick={() => setImgs(imgs.filter((_, i) => i !== idx))}
                          className="flex items-center gap-1 text-xs transition-colors hover:opacity-70"
                          style={{ color: '#ef4444' }}>
                          <Trash2 size={11} /> Remove
                        </button>
                      </div>
                      <ImageUpload
                        value={url}
                        onChange={v => { const next = [...imgs]; next[idx] = v ?? ''; setImgs(next) }}
                        folder="general"
                        publicId={`amb${idx + 1}`}
                        aspectRatio="free"
                        hint="Recommended: 1400 × 900 px"
                      />
                    </div>
                  ))}
                </div>
                <button type="button"
                  onClick={() => setImgs([...imgs, ''])}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
                  style={{ border: '1.5px dashed var(--card-border)', color: 'var(--brand)', backgroundColor: 'rgba(var(--brand-rgb),0.04)' }}>
                  <Plus size={15} /> Add photo
                </button>
                <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>{imgs.length} photo{imgs.length !== 1 ? 's' : ''} added</p>
              </>
            )
          })()}
        </div>
      </Accordion>

      {/* REVIEWS */}
      <Accordion id="reviews">
        <BilingualField label="Section headline"
          valueEn={hc.reviewsHeadline ?? ''} valueAr={hc.reviewsHeadlineAr ?? ''}
          placeholder="Loved by every table" placeholderAr="محبوب على كل طاولة"
          onChangeEn={v => setHc('reviewsHeadline', v)} onChangeAr={v => setHc('reviewsHeadlineAr', v)} />
      </Accordion>
    </div>
  )
}
