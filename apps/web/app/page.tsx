'use client'
import Link from 'next/link'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { UtensilsCrossed, Star, Clock, ArrowRight, ArrowLeft, Phone, MapPin, ChevronDown, CalendarDays, User, ShoppingCart, Check, LogOut } from 'lucide-react'
import AccountNavLink from '@/components/AccountNavLink'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'
import { useCartStore } from '@/store/cart'
import { useBrandStore } from '@/store/brand'
import { useLangStore, applyLangDir, t } from '@/store/lang'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

const FALLBACK_VIDEO  = 'https://assets.mixkit.co/videos/preview/mixkit-chef-seasoning-food-in-a-restaurant-kitchen-43235-large.mp4'
const FALLBACK_POSTER = 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1920&q=90'

interface MenuItem { id: string; name: string; description?: string; price: string; prepTimeMins: number; imageUrl?: string }
interface HeroConfig {
  line1?: string; line2?: string; subtext?: string; videoUrl?: string; posterUrl?: string
  line1Ar?: string; line2Ar?: string; subtextAr?: string; badgeTextAr?: string
  heroMediaType?: 'video' | 'image'; heroImageUrl?: string
  ctaLabel?: string; ctaSecondaryLabel?: string; badgeText?: string
  dishesHeadline?: string; dishesSubtext?: string; signatureDishIds?: string[]
  customDishes?: Array<{ name: string; desc: string; price: string; time: string; img: string }>
  relayTagline?: string; relayHeadline?: string; relayHeadlinePart2?: string
  ambienceTagline?: string; ambienceHeadline?: string; ambienceHeadlinePart2?: string; ambienceDesc?: string
  reviewsHeadline?: string
  ambienceImg1?: string; ambienceImg2?: string; ambienceImg3?: string; ambienceImg4?: string
  ambienceImg5?: string; ambienceImg6?: string; ambienceImg7?: string; ambienceImg8?: string
}
interface RestaurantSettings {
  restaurantName: string; tagline: string | null; phone: string | null
  address: string | null; logoUrl: string | null; openTime: string; closeTime: string
  heroConfig?: HeroConfig | null
}

const DISHES_FALLBACK = [
  { name: 'Malabar Biriyani',  desc: 'Fragrant basmati with tender chicken & caramelised onions', price: '55', time: 25, img: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=700&q=80',  menuItemId: undefined as string | undefined, basePrice: undefined as number | undefined },
  { name: 'Masala Dosa',       desc: 'Crispy golden crepe, spiced potato filling, fresh chutneys',  price: '22', time: 12, img: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=700&q=80', menuItemId: undefined as string | undefined, basePrice: undefined as number | undefined },
  { name: 'Appam & Stew',      desc: 'Lacy rice pancakes with velvety coconut milk stew',           price: '28', time: 15, img: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=700&q=80', menuItemId: undefined as string | undefined, basePrice: undefined as number | undefined },
  { name: 'Kerala Fish Curry', desc: 'Spiced red curry with wild-caught fish & kudampuli',           price: '48', time: 20, img: 'https://images.unsplash.com/photo-1626508035297-0e8a5f53700b?w=700&q=80', menuItemId: undefined as string | undefined, basePrice: undefined as number | undefined },
  { name: 'Prawn Fry',         desc: 'Crispy prawns in Kerala masala with fresh curry leaves',      price: '65', time: 18, img: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=700&q=80',  menuItemId: undefined as string | undefined, basePrice: undefined as number | undefined },
  { name: 'Puttu & Kadala',    desc: 'Steamed rice cylinders with black chickpea curry',            price: '22', time: 10, img: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=700&q=80',  menuItemId: undefined as string | undefined, basePrice: undefined as number | undefined },
]

const SHOWCASE_FALLBACK = [
  { name: 'Malabar Biriyani',  img: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=1600&q=85' },
  { name: 'Kerala Fish Curry', img: 'https://images.unsplash.com/photo-1626508035297-0e8a5f53700b?w=1600&q=85' },
  { name: 'Masala Dosa',       img: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=1600&q=85' },
  { name: 'Prawn Fry',         img: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=1600&q=85' },
]

const TESTIMONIALS = [
  { name: 'Arjun Nair',          text: 'Best Kerala food outside of home. The Appam & Stew is absolutely perfect — I come every week.', stars: 5 },
  { name: 'Sarah K.',             text: 'Ordered via QR, food arrived in 15 min. Masala Dosa was crispy and delicious. Super smooth experience.', stars: 5 },
  { name: 'Mohammed Al-Rashid',   text: 'The Malabar Biriyani is unreal. Fragrant, rich, and generous portions. Easily the best in Dubai.', stars: 5 },
  { name: 'Priya Menon',          text: 'Feels like eating at my grandmother\'s. The fish curry brings me right back to Kerala every time.', stars: 5 },
  { name: 'James Thornton',       text: 'Stumbled in on a work trip — left absolutely hooked. The prawn moilee was outstanding. Will be back.', stars: 5 },
  { name: 'Fatima Al-Zaabi',      text: 'Intimate setting, warm service, and food that tastes like it was made with real love. Highly recommend.', stars: 5 },
]

const AMBIENCE = [
  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1400&q=90',  // warm dim restaurant interior
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=88', // fine dining table
  'https://images.unsplash.com/photo-1578474846132-4be0e60b7952?w=900&q=88', // candle close-up
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=90', // restaurant wide shot
]

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

// ── Full-bleed food showcase — premium auto-fade ──────────────────────────────
function FoodShowcase({ items }: { items: { name: string; img: string }[] }) {
  const [idx, setIdx] = useState(0)
  const [prev, setPrev] = useState<number | null>(null)
  const [fading, setFading] = useState(false)
  const count = items.length

  useEffect(() => {
    const t = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setPrev(idx)
        setIdx(i => (i + 1) % count)
        setFading(false)
      }, 700)
    }, 5000)
    return () => clearInterval(t)
  }, [idx, count])

  return (
    <div style={{ position: 'relative', height: '62vh', minHeight: 480, overflow: 'hidden', backgroundColor: '#000' }}>
      {/* Outgoing image */}
      {prev !== null && (
        <img key={`prev-${prev}`} src={items[prev].img} alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: fading ? 0 : 1, transition: 'opacity 0.8s ease', zIndex: 1 }} />
      )}
      {/* Incoming image */}
      <img key={`curr-${idx}`} src={items[idx].img} alt={items[idx].name}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: fading ? 0.3 : 1, transition: 'opacity 0.8s ease', zIndex: 2, filter: 'brightness(0.55) saturate(0.85)' }} />

      {/* Gradient */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 3, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)' }} />

      {/* Bottom content */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 4, padding: '0 48px 44px' }}
        className="flex items-end justify-between">
        <div>
          <p style={{ color: 'var(--brand)', fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 10 }}>
            Featured Dish · {idx + 1} / {count}
          </p>
          <h3 style={{ color: '#fff', fontSize: 'clamp(1.8rem,4vw,3rem)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            {items[idx].name}
          </h3>
        </div>
        <Link href="/menu"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, fontWeight: 700, fontSize: 13, color: '#000', backgroundColor: 'var(--brand)', textDecoration: 'none', flexShrink: 0 }}>
          View Menu <ArrowRight size={14} />
        </Link>
      </div>

      {/* Progress bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.08)', zIndex: 5 }}>
        <div style={{ height: '100%', backgroundColor: 'var(--brand)', width: `${((idx + 1) / count) * 100}%`, transition: 'width 5s linear' }} />
      </div>
    </div>
  )
}

// ── Mobile signature gallery — editorial swipe, hero-style ───────────────────
function SignatureDishesMobile({ dishes, mutedColor, dotInactive }: {
  dishes: typeof DISHES_FALLBACK
  mutedColor: string
  dotInactive: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const router = useRouter()

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || !el.children.length) return
    const child = el.children[0] as HTMLElement
    const slideW = child.offsetWidth + 16
    const idx = Math.round(el.scrollLeft / slideW)
    setActive(Math.max(0, Math.min(idx, dishes.length - 1)))
  }, [dishes.length])

  const scrollTo = (i: number) => {
    const el = scrollRef.current
    if (!el || !el.children[i]) return
    const child = el.children[i] as HTMLElement
    el.scrollTo({ left: child.offsetLeft - 16, behavior: 'smooth' })
    setActive(i)
  }

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-1 px-1"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {dishes.map((d, i) => {
          const offset = i - active
          const tiltY = Math.min(Math.max(offset * 6, -18), 18)
          const tiltZ = offset * -0.8
          const scale = i === active ? 1 : 0.94
          return (
          <div
            key={d.name}
            className="snap-center flex-shrink-0 w-[86vw] max-w-[360px]"
            style={{
              cursor: 'pointer',
              transform: `perspective(600px) rotateY(${tiltY}deg) rotateZ(${tiltZ}deg) scale(${scale})`,
              transition: 'transform 0.45s cubic-bezier(0.34,1.1,0.64,1)',
              transformOrigin: i < active ? 'right center' : 'left center',
              animation: `dealCardMobile 0.55s cubic-bezier(0.34,1.1,0.64,1) ${i * 60}ms both`,
            }}
            onClick={() => {
              if (d.menuItemId) {
                router.push(`/menu?open=${d.menuItemId}`)
              } else {
                router.push('/menu')
              }
            }}
          >
            <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] shadow-[0_24px_60px_rgba(0,0,0,0.55)]" style={{ aspectRatio: '3/4.2' }}>
              <img
                src={d.img}
                alt={d.name}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'brightness(0.72) saturate(0.9)' }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-black/10" />
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand)]/10 via-transparent to-transparent" />

              <div className="absolute top-5 left-5 right-5 flex items-start justify-between gap-3">
                <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-[var(--brand)]/90">
                  Signature · {String(i + 1).padStart(2, '0')}
                </span>
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-5 pt-16">
                <h3 className="text-white font-black text-[1.65rem] leading-[1.08] tracking-tight mb-2">
                  {d.name}
                </h3>
                <p className="text-white/55 text-sm leading-relaxed line-clamp-2 mb-5">
                  {d.desc}
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-white/35 text-xs">
                    <Clock size={11} /> {d.time} min
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[var(--brand)] text-xs font-bold">
                    Taste this <ArrowRight size={12} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        )})}
      </div>

      <div className="flex items-center justify-center gap-2 mt-6">
        {dishes.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to dish ${i + 1}`}
            onClick={() => scrollTo(i)}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: i === active ? 24 : 6,
              backgroundColor: i === active ? 'var(--brand)' : dotInactive,
            }}
          />
        ))}
      </div>
      <p className="text-center text-[11px] mt-3 tracking-wide" style={{ color: mutedColor }}>Swipe to explore</p>
    </div>
  )
}

// ── Dish Card — 3D float + rich hover (desktop) ─────────────────────────────
function DishCard({ name, desc, price, time, img, index, menuItemId, basePrice }: {
  name: string; desc: string; price: string; time: number; img: string; index?: number
  menuItemId?: string; basePrice?: number
}) {
  const cardRef  = useRef<HTMLDivElement>(null)
  const imgRef   = useRef<HTMLImageElement>(null)
  const [imgFailed, setImgFailed] = useState(false)
  const [hovered,   setHovered]   = useState(false)
  const router = useRouter()

  const handleClick = useCallback(() => {
    router.push(menuItemId ? `/menu?open=${menuItemId}` : '/menu')
  }, [menuItemId, router])

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current; if (!el) return
    el.style.animationPlayState = 'paused'
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width  - 0.5
    const y = (e.clientY - r.top)  / r.height - 0.5
    el.style.transform = `perspective(900px) rotateY(${x * 18}deg) rotateX(${-y * 12}deg) scale(1.06) translateY(-10px)`
    el.style.transition = 'transform 0.1s ease, box-shadow 0.1s ease'
    el.style.boxShadow = `0 32px 64px rgba(0,0,0,0.7), 0 0 0 1.5px rgba(var(--brand-rgb),0.5), ${x * 12}px ${y * -12}px 40px rgba(var(--brand-rgb),0.14)`
    if (imgRef.current) {
      imgRef.current.style.transform = `scale(1.1) translate(${x * -8}px, ${y * -6}px)`
      imgRef.current.style.transition = 'transform 0.15s ease'
    }
  }, [])

  const onEnter = useCallback(() => {
    setHovered(true)
    const el = cardRef.current; if (!el) return
    el.style.animationPlayState = 'paused'
  }, [])

  const onLeave = useCallback(() => {
    setHovered(false)
    const el = cardRef.current; if (!el) return
    el.style.transform = ''
    el.style.boxShadow = ''
    el.style.transition = 'transform 0.55s cubic-bezier(0.25,0.46,0.45,0.94), box-shadow 0.55s ease'
    if (imgRef.current) {
      imgRef.current.style.transform = 'scale(1) translate(0,0)'
      imgRef.current.style.transition = 'transform 0.55s ease'
    }
    setTimeout(() => { if (cardRef.current) cardRef.current.style.animationPlayState = 'running' }, 600)
  }, [])

  const floatDelay = (index ?? 0) * 0.4

  return (
    <div ref={cardRef} className="dish-card" data-index={index ?? 0}
      style={{
        borderRadius: 20,
        backgroundColor: '#0f0f0f',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        transformOrigin: 'center bottom',
        willChange: 'transform, box-shadow',
        animationDelay: `${floatDelay}s`,
        cursor: 'pointer',
        overflow: 'hidden',
        position: 'relative',
      }}
      onMouseMove={onMove} onMouseEnter={onEnter} onMouseLeave={onLeave}>

      <div style={{
        position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none',
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.35s ease',
        background: 'linear-gradient(135deg, rgba(var(--brand-rgb),0.07) 0%, transparent 55%, rgba(var(--brand-rgb),0.04) 100%)',
      }} />

      <div onClick={handleClick} style={{ display: 'block' }}>
        <div style={{ aspectRatio: '16/10', overflow: 'hidden', position: 'relative' }}>
          {!imgFailed
            ? <img ref={imgRef} src={img} alt={name}
                className="w-full h-full object-cover"
                style={{ transition: 'transform 0.55s ease', willChange: 'transform' }}
                onError={() => setImgFailed(true)} />
            : <div className="w-full h-full flex items-center justify-center" style={{ background: '#1a1000' }}>
                <UtensilsCrossed size={32} className="text-[var(--brand)]/40" />
              </div>
          }

          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)' }} />

          <div style={{
            position: 'absolute', inset: 0, zIndex: 3,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: '0 16px 20px',
            transform: hovered ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 0.38s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              backgroundColor: 'var(--brand)', color: '#000',
              fontWeight: 800, fontSize: 12, letterSpacing: '0.04em',
              padding: '9px 20px', borderRadius: 100,
              boxShadow: '0 4px 20px rgba(var(--brand-rgb),0.5)',
              width: '100%', justifyContent: 'center',
            }}>
              Order Now <ArrowRight size={12} />
            </div>
          </div>

        </div>

        <div style={{ padding: '16px 18px 18px', position: 'relative', zIndex: 2 }}>
          <h3 style={{
            color: '#f5f3ef', fontWeight: 700, fontSize: 15, lineHeight: 1.3, marginBottom: 6,
            transform: hovered ? 'translateX(4px)' : 'translateX(0)',
            transition: 'transform 0.3s ease',
          }}>{name}</h3>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, lineHeight: 1.65 }}>{desc}</p>
          <div className="flex items-center gap-1.5 mt-4" style={{ color: 'rgba(255,255,255,0.22)', fontSize: 11 }}>
            <Clock size={10} /> {time} min
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Mobile reviews — compact carousel, not dominating marquees ───────────────
function ReviewsMobile({ active, onSelect, dark, pal }: {
  active: number
  onSelect: (i: number) => void
  dark: boolean
  pal: { text: string; muted: string }
}) {
  const t = TESTIMONIALS[active]
  const cardBg = dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.85)'
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(var(--brand-rgb),0.15)'

  return (
    <div className="px-4">
      <div
        key={active}
        className="mx-auto max-w-md rounded-[22px] border p-5 shadow-lg"
        style={{
          backgroundColor: cardBg,
          borderColor: border,
          boxShadow: dark ? '0 16px 40px rgba(0,0,0,0.35)' : '0 12px 32px rgba(0,0,0,0.06)',
          animation: 'fadeUp 0.45s ease both',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-0.5">
            {[...Array(t.stars)].map((_, si) => (
              <Star key={si} size={11} style={{ color: 'var(--brand)', fill: 'var(--brand)' }} />
            ))}
          </div>
          <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'rgba(var(--brand-rgb),0.65)' }}>
            {String(active + 1).padStart(2, '0')} / {String(TESTIMONIALS.length).padStart(2, '0')}
          </span>
        </div>

        <p className="text-sm leading-relaxed italic mb-4" style={{ color: pal.text }}>
          &ldquo;{t.text}&rdquo;
        </p>

        <div className="flex items-center gap-3 pt-3 border-t" style={{ borderColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-black flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--brand), var(--brand-dark))' }}
          >
            {t.name[0]}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: pal.text }}>{t.name}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(var(--brand-rgb),0.75)' }}>Verified guest</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 mt-5">
        {TESTIMONIALS.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Review ${i + 1}`}
            onClick={() => onSelect(i)}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: i === active ? 22 : 6,
              backgroundColor: i === active ? 'var(--brand)' : (dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'),
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Flip Review Card — front: quote / back: full review (desktop) ─────────────
function ReviewCard({ t, i, dark }: {
  t: typeof TESTIMONIALS[0]; i: number; dark: boolean
}) {
  const [flipped, setFlipped] = useState(false)

  const cardBg = dark
    ? 'linear-gradient(145deg, rgba(30,24,16,0.95) 0%, rgba(20,16,8,0.98) 100%)'
    : 'linear-gradient(145deg, rgba(255,252,245,0.97) 0%, rgba(255,248,230,0.95) 100%)'
  const border = dark ? '1px solid rgba(var(--brand-rgb),0.18)' : '1px solid rgba(var(--brand-rgb),0.22)'
  const textMain = dark ? '#f5f3ef' : '#1a1714'
  const textMuted = dark ? 'rgba(245,243,239,0.45)' : 'rgba(26,23,20,0.45)'

  const sharedCard: React.CSSProperties = {
    position: 'absolute', inset: 0, borderRadius: 22,
    background: cardBg, border,
    backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
    padding: '26px 24px 22px',
    display: 'flex', flexDirection: 'column',
    boxShadow: dark ? '0 12px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(var(--brand-rgb),0.08)' : '0 8px 32px rgba(0,0,0,0.09)',
    overflow: 'hidden',
  }

  return (
    <div
      style={{ width: 'clamp(240px, 75vw, 300px)', height: 210, flexShrink: 0, perspective: 900, cursor: 'pointer' }}
      onClick={() => setFlipped(f => !f)}>
      <div style={{
        position: 'relative', width: '100%', height: '100%',
        transformStyle: 'preserve-3d',
        transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        transition: 'transform 0.6s cubic-bezier(0.34,1.1,0.64,1)',
      }}>

        {/* ── FRONT ── */}
        <div style={sharedCard}>
          {/* Gold bar top */}
          <div style={{ position: 'absolute', top: 0, left: 24, right: 24, height: 2, background: 'linear-gradient(to right, transparent, var(--brand), transparent)' }} />
          {/* Watermark */}
          <div style={{ position: 'absolute', bottom: 8, right: 16, fontSize: 96, lineHeight: 1, color: 'rgba(var(--brand-rgb),0.06)', fontFamily: 'Georgia,serif', userSelect: 'none', pointerEvents: 'none' }}>&rdquo;</div>

          <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
            {[...Array(t.stars)].map((_, si) => (
              <Star key={si} size={11} style={{ color: 'var(--brand)', fill: 'var(--brand)', filter: 'drop-shadow(0 0 3px rgba(var(--brand-rgb),0.7))' }} />
            ))}
          </div>
          <p style={{ color: textMain, fontSize: 13.5, lineHeight: 1.68, fontStyle: 'italic', flex: 1 }}>
            &ldquo;{t.text.length > 90 ? t.text.slice(0, 88) + '…' : t.text}&rdquo;
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
            <span style={{ color: textMuted, fontSize: 11, fontWeight: 600 }}>{t.name}</span>
            <span style={{ color: 'rgba(var(--brand-rgb),0.5)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em' }}>TAP TO FLIP →</span>
          </div>
        </div>

        {/* ── BACK ── */}
        <div style={{ ...sharedCard, transform: 'rotateY(180deg)', justifyContent: 'space-between' }}>
          <div style={{ position: 'absolute', top: 0, left: 24, right: 24, height: 2, background: 'linear-gradient(to right, transparent, var(--brand), transparent)' }} />

          {/* Avatar + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              background: `conic-gradient(from ${i * 55}deg, var(--brand), var(--brand-dark), var(--brand))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 0 2.5px rgba(var(--brand-rgb),0.25), 0 4px 16px rgba(var(--brand-rgb),0.4)',
              fontSize: 17, fontWeight: 900, color: '#000',
            }}>{t.name[0]}</div>
            <div>
              <p style={{ color: textMain, fontWeight: 800, fontSize: 14 }}>{t.name}</p>
              <p style={{ color: 'rgba(var(--brand-rgb),0.7)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', marginTop: 2 }}>Verified Guest</p>
            </div>
          </div>

          {/* Full quote */}
          <p style={{ color: textMain, fontSize: 13, lineHeight: 1.72, fontStyle: 'italic', flex: 1, margin: '14px 0' }}>
            &ldquo;{t.text}&rdquo;
          </p>

          {/* Stars */}
          <div style={{ display: 'flex', gap: 3 }}>
            {[...Array(t.stars)].map((_, si) => (
              <Star key={si} size={12} style={{ color: 'var(--brand)', fill: 'var(--brand)' }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { dark } = useThemeStore()
  const { user, token, logout } = useAuthStore()
  const showLanguageToggle = useBrandStore(s => s.showLanguageToggle)
  const { lang, setLang } = useLangStore()
  const ar = lang === 'ar'
  useEffect(() => { applyLangDir(lang) }, [lang])
  const pal = dark ? {
    bg: '#0c0c0c', bg2: '#080808', bg3: '#101010',
    text: '#f5f3ef', muted: 'rgba(245,243,239,0.45)', faint: 'rgba(245,243,239,0.18)',
    border: 'rgba(255,255,255,0.07)', card: '#141414',
  } : {
    bg: '#f9f6f2', bg2: '#f2ede6', bg3: '#ede8e0',
    text: '#1a1714', muted: 'rgba(26,23,20,0.5)', faint: 'rgba(26,23,20,0.22)',
    border: 'rgba(26,23,20,0.1)', card: '#fff',
  }

  const [cfg, setCfg] = useState<RestaurantSettings>({
    restaurantName: 'Al Manzil', tagline: 'Kerala & South Indian Cuisine',
    phone: null, address: 'Dubai, UAE', logoUrl: null, openTime: '07:00', closeTime: '23:00',
    heroConfig: null,
  })
  const [dishes,     setDishes]     = useState<typeof DISHES_FALLBACK>(DISHES_FALLBACK)
  const [showcase,   setShowcase]   = useState<typeof SHOWCASE_FALLBACK>(SHOWCASE_FALLBACK)
  const [reviewIdx,  setReviewIdx]  = useState(0)
  const [dishPage,    setDishPage]    = useState(0)
  const [dishPageKey, setDishPageKey] = useState(0)
  const [ambPage,    setAmbPage]    = useState(0)
  const [ambFading,  setAmbFading]  = useState(false)
  const [scrolled,   setScrolled]   = useState(false)
  const [navOpen,    setNavOpen]    = useState(false)
  const [hasActiveOrder, setHasActiveOrder] = useState(false)

  const heroRef        = useRef<HTMLDivElement>(null)
  const videoRef       = useRef<HTMLVideoElement>(null)
  const lenisRef       = useRef<Lenis | null>(null)
  const scrollLockY    = useRef(0)
  const heroTextRef    = useRef<HTMLDivElement>(null)
  const heroBadgeRef   = useRef<HTMLDivElement>(null)
  const heroCtaRef     = useRef<HTMLDivElement>(null)
  const dishGridRef    = useRef<HTMLDivElement>(null)
  const dishHeadRef    = useRef<HTMLDivElement>(null)
  const relayRef       = useRef<HTMLDivElement>(null)
  const ambienceRef    = useRef<HTMLDivElement>(null)
  const reviewsRef     = useRef<HTMLDivElement>(null)
  const ctaRef         = useRef<HTMLDivElement>(null)

  // Check if guest has active orders in localStorage — show "Track Order" pill
  useEffect(() => {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem('almanzil_order_ids') || '[]')
      if (ids.length > 0) setHasActiveOrder(true)
    } catch {}
  }, [])

  // Smooth scroll
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    const lenis = new Lenis({ lerp: 0.13, smoothWheel: true, wheelMultiplier: 1.2 })
    lenisRef.current = lenis
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add((time) => { lenis.raf(time * 1000) })
    gsap.ticker.lagSmoothing(0)
    return () => {
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  // Lock page scroll while mobile nav is open
  useEffect(() => {
    if (!navOpen) return

    scrollLockY.current = window.scrollY
    lenisRef.current?.stop()
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollLockY.current}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'

    return () => {
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollLockY.current)
      lenisRef.current?.scrollTo(scrollLockY.current, { immediate: true })
      lenisRef.current?.start()
    }
  }, [navOpen])

  // GSAP entrance + scroll animations
  useEffect(() => {
    const kill = () => ScrollTrigger.getAll().forEach(t => t.kill())

    // No parallax on hero video — it caused a "drifting away" feeling while still in the hero

    // ── Hero entrance
    if (heroBadgeRef.current) gsap.fromTo(heroBadgeRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7, delay: 0.3, ease: 'power3.out' })
    if (heroTextRef.current) {
      gsap.fromTo(heroTextRef.current.querySelectorAll('.hero-line'),
        { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 1.0, stagger: 0.14, ease: 'power4.out', delay: 0.5 })
    }
    if (heroCtaRef.current) gsap.fromTo(heroCtaRef.current, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, delay: 1.1, ease: 'power3.out' })

    // ── Dishes headline
    if (dishHeadRef.current) {
      gsap.fromTo(dishHeadRef.current.children,
        { y: 32, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, stagger: 0.12, ease: 'power3.out',
          scrollTrigger: { trigger: dishHeadRef.current, start: 'top 82%', once: true } })
    }

    // ── Dish cards stagger
    if (dishGridRef.current) {
      gsap.fromTo(dishGridRef.current.querySelectorAll('.dish-card'),
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, stagger: 0.08, ease: 'power3.out',
          clearProps: 'all',
          scrollTrigger: { trigger: dishGridRef.current, start: 'top 78%', once: true } })
    }

    // ── Food relay center text
    if (relayRef.current) {
      gsap.fromTo(relayRef.current.querySelectorAll('.relay-el'),
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.9, stagger: 0.15, ease: 'power3.out',
          scrollTrigger: { trigger: relayRef.current, start: 'top 60%', once: true } })
    }

    // ── Reviews section
    if (reviewsRef.current) {
      gsap.fromTo(reviewsRef.current.querySelectorAll('.reviews-head'),
        { y: 28, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: 'power3.out',
          scrollTrigger: { trigger: reviewsRef.current, start: 'top 82%', once: true } })
    }

    // ── Ambience photos stagger in
    if (ambienceRef.current) {
      gsap.fromTo(ambienceRef.current.querySelectorAll('.amb-el'),
        { y: 40, opacity: 0, scale: 0.97 },
        { y: 0, opacity: 1, scale: 1, duration: 0.85, stagger: 0.08, ease: 'power3.out',
          scrollTrigger: { trigger: ambienceRef.current, start: 'top 75%', once: true } })
    }

    return kill
  }, [])

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setReviewIdx(i => (i + 1) % TESTIMONIALS.length), 5500)
    return () => clearInterval(t)
  }, [])

  // Auto-rotate ambience photos — only when more than 4 are set
  useEffect(() => {
    const allAmb = [1,2,3,4,5,6,7,8]
      .map(i => cfg.heroConfig?.[`ambienceImg${i}` as keyof typeof cfg.heroConfig] as string | undefined)
      .filter(Boolean) as string[]
    if (allAmb.length <= 4) return
    const pages = Math.ceil(allAmb.length / 4)
    const t = setInterval(() => {
      setAmbFading(true)
      setTimeout(() => { setAmbPage(p => (p + 1) % pages); setAmbFading(false) }, 500)
    }, 6000)
    return () => clearInterval(t)
  }, [cfg.heroConfig])

  // Auto-rotate signature dishes — staggered card reveal
  const goToDishPage = useCallback((next: number) => {
    setDishPage(next)
    setDishPageKey(k => k + 1)
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return // no auto-rotate on mobile
    const pages = Math.ceil(dishes.length / 6)
    if (pages <= 1) return
    const t = setInterval(() => {
      setDishPage(p => {
        const next = (p + 1) % pages
        setDishPageKey(k => k + 1)
        return next
      })
    }, 5000)
    return () => clearInterval(t)
  }, [dishes.length])

  useEffect(() => {
    // Fetch both in parallel, then apply: signatureDishIds (pinned picks) > top-with-image (auto)
    Promise.all([
      fetch(`${API}/settings`).then(r => r.json()).catch(() => null),
      fetch(`${API}/menu/items`).then(r => r.json()).catch(() => null),
    ]).then(([settingsJson, menuJson]) => {
      const s = settingsJson?.data ?? settingsJson
      if (s?.restaurantName) setCfg(s)

      const items: MenuItem[] = menuJson?.data ?? menuJson ?? []
      const withImg = items.filter(i => i.imageUrl)
      if (withImg.length >= 3) setShowcase(withImg.slice(0, 6).map(i => ({ name: i.name, img: i.imageUrl! })))

      const pinnedIds: string[] | undefined = s?.heroConfig?.signatureDishIds
      if (pinnedIds?.length) {
        // Use admin-selected dishes in the order they were chosen, skip any whose ID is gone from menu
        const byId = Object.fromEntries(withImg.map(i => [i.id, i]))
        const pinned = pinnedIds.map(id => byId[id]).filter(Boolean)
        if (pinned.length) {
          setDishes(pinned.map(i => ({ name: i.name, desc: i.description ?? '', price: i.price, time: i.prepTimeMins, img: i.imageUrl!, menuItemId: i.id, basePrice: Number(i.price) })))
          return
        }
      }
      // Auto: top items that have images (no hard cap — rotation handles paging)
      const top = withImg.slice(0, 12)
      if (top.length >= 4) setDishes(top.map(i => ({ name: i.name, desc: i.description ?? '', price: i.price, time: i.prepTimeMins, img: i.imageUrl!, menuItemId: i.id, basePrice: Number(i.price) })))
    })
  }, [])

  return (
    <div style={{ backgroundColor: pal.bg, color: pal.text, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Navbar ── */}
      <nav className="fixed top-0 w-full z-50 transition-all duration-400"
        style={{
          backgroundColor: scrolled ? (dark ? 'rgba(12,12,12,0.95)' : 'rgba(249,246,242,0.95)') : 'transparent',
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
          borderBottom: scrolled ? `1px solid ${pal.border}` : '1px solid transparent',
        }}>
        <div style={{ padding: '0 clamp(1.25rem,5vw,6rem)' }} className="h-[60px] flex items-center gap-4">

          {/* ── Logo ── */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            {cfg.logoUrl
              ? <img src={cfg.logoUrl} alt={cfg.restaurantName} className="w-8 h-8 rounded-lg object-cover" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.35)' }} />
              : <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--brand)' }}><UtensilsCrossed size={14} className="text-black" /></div>
            }
            <span className="hidden sm:block font-black text-sm tracking-tight" style={{ color: scrolled ? pal.text : '#fff' }}>{cfg.restaurantName}</span>
          </Link>

          {/* ── Center nav ── */}
          <div className="hidden md:flex items-center gap-0.5 flex-1 justify-center">
            <Link href="/menu"
              className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
              style={{ color: scrolled ? pal.muted : 'rgba(255,255,255,0.65)' }}
              onMouseEnter={e => { e.currentTarget.style.color = scrolled ? pal.text : '#fff'; e.currentTarget.style.backgroundColor = scrolled ? pal.bg3 : 'rgba(255,255,255,0.08)' }}
              onMouseLeave={e => { e.currentTarget.style.color = scrolled ? pal.muted : 'rgba(255,255,255,0.65)'; e.currentTarget.style.backgroundColor = 'transparent' }}>
              Menu
            </Link>
            <Link href="/book"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
              style={{ color: scrolled ? pal.muted : 'rgba(255,255,255,0.65)' }}
              onMouseEnter={e => { e.currentTarget.style.color = scrolled ? pal.text : '#fff'; e.currentTarget.style.backgroundColor = scrolled ? pal.bg3 : 'rgba(255,255,255,0.08)' }}
              onMouseLeave={e => { e.currentTarget.style.color = scrolled ? pal.muted : 'rgba(255,255,255,0.65)'; e.currentTarget.style.backgroundColor = 'transparent' }}>
              <CalendarDays size={13} style={{ opacity: 0.7 }} />
              Book a Table
            </Link>
            {hasActiveOrder && (
              <Link href="/menu"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse"
                style={{ backgroundColor: 'rgba(var(--brand-rgb),0.15)', color: 'var(--brand)', border: '1px solid rgba(var(--brand-rgb),0.35)' }}>
                🔴 Track Order
              </Link>
            )}
          </div>

          {/* ── Right cluster ── */}
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            {showLanguageToggle && (
              <button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
                className="hidden md:flex items-center px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200"
                style={{ color: scrolled ? pal.muted : 'rgba(255,255,255,0.65)', border: `1px solid ${scrolled ? pal.border : 'rgba(255,255,255,0.18)'}` }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = scrolled ? pal.text : '#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = scrolled ? pal.muted : 'rgba(255,255,255,0.65)' }}>
                {lang === 'en' ? 'ع' : 'EN'}
              </button>
            )}

            {token && user ? (
              <Link href="/account"
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
                style={{ color: scrolled ? pal.muted : 'rgba(255,255,255,0.65)' }}
                onMouseEnter={e => { e.currentTarget.style.color = scrolled ? pal.text : '#fff'; e.currentTarget.style.backgroundColor = scrolled ? pal.bg3 : 'rgba(255,255,255,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.color = scrolled ? pal.muted : 'rgba(255,255,255,0.65)'; e.currentTarget.style.backgroundColor = 'transparent' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: '#000' }}>
                  {user.name?.[0]?.toUpperCase() ?? '?'}
                </div>
                {user.name?.split(' ')[0]}
              </Link>
            ) : (
              <Link href="/login"
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
                style={{ color: scrolled ? pal.muted : 'rgba(255,255,255,0.65)' }}
                onMouseEnter={e => { e.currentTarget.style.color = scrolled ? pal.text : '#fff'; e.currentTarget.style.backgroundColor = scrolled ? pal.bg3 : 'rgba(255,255,255,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.color = scrolled ? pal.muted : 'rgba(255,255,255,0.65)'; e.currentTarget.style.backgroundColor = 'transparent' }}>
                <User size={13} />
                Sign In
              </Link>
            )}

            <Link href="/menu"
              className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200"
              style={{ backgroundColor: 'var(--brand)', color: '#000', boxShadow: '0 2px 12px rgba(var(--brand-rgb),0.3)' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(var(--brand-rgb),0.5)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(var(--brand-rgb),0.3)' }}>
              Order Now
            </Link>

            {token && user && (
              <button onClick={() => logout()} title="Sign out"
                className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200"
                style={{ color: scrolled ? pal.muted : 'rgba(255,255,255,0.45)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.backgroundColor = scrolled ? pal.bg3 : 'rgba(255,255,255,0.08)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = scrolled ? pal.muted : 'rgba(255,255,255,0.45)'; (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}>
                <LogOut size={14} />
              </button>
            )}

            <button onClick={() => setNavOpen(v => !v)} className="md:hidden p-2 rounded-lg transition-colors"
              style={{ color: scrolled ? pal.muted : 'rgba(255,255,255,0.7)', backgroundColor: navOpen ? (scrolled ? pal.bg3 : 'rgba(255,255,255,0.1)') : 'transparent' }}>
              <div className="w-5 flex flex-col gap-[5px]">
                <span className={`h-[1.5px] bg-current rounded transition-all duration-300 ${navOpen ? 'rotate-45 translate-y-[6.5px]' : ''}`} />
                <span className={`h-[1.5px] bg-current rounded transition-all duration-300 ${navOpen ? 'opacity-0 scale-x-0' : ''}`} />
                <span className={`h-[1.5px] bg-current rounded transition-all duration-300 ${navOpen ? '-rotate-45 -translate-y-[6.5px]' : ''}`} />
              </div>
            </button>
          </div>
        </div>

        {/* Mobile sidebar — fixed right drawer */}
        {navOpen && (
          <div
            className="md:hidden fixed inset-0 z-[100]"
            onClick={() => setNavOpen(false)}
            onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault() }}
          >
            {/* Matte frosted backdrop */}
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: 'rgba(6, 5, 4, 0.78)',
                backdropFilter: 'blur(16px) saturate(110%)',
                WebkitBackdropFilter: 'blur(16px) saturate(110%)',
              }}
            />
            {/* Drawer panel — right side in LTR, left side in RTL */}
            <div
              className={`absolute top-0 bottom-0 w-[min(18rem,88vw)] flex flex-col shadow-2xl ${ar ? 'left-0 animate-[slideInLeft_0.28s_ease-out]' : 'right-0 animate-[slideInRight_0.28s_ease-out]'}`}
              style={{
                backgroundColor: dark ? '#0c0c0c' : '#f9f6f2',
                borderLeft: ar ? 'none' : `1px solid ${pal.border}`,
                borderRight: ar ? `1px solid ${pal.border}` : 'none',
                boxShadow: ar ? '8px 0 40px rgba(0,0,0,0.35)' : '-8px 0 40px rgba(0,0,0,0.35)',
              }}
              onClick={e => e.stopPropagation()}
            >

              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: pal.border }}>
                <div className="flex items-center gap-2.5">
                  {cfg.logoUrl
                    ? <img src={cfg.logoUrl} alt={cfg.restaurantName} className="w-8 h-8 rounded-lg object-cover" />
                    : <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--brand)' }}><UtensilsCrossed size={14} className="text-black" /></div>
                  }
                  <span className="font-black text-sm" style={{ color: pal.text }}>{cfg.restaurantName}</span>
                </div>
                <button onClick={() => setNavOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                  style={{ color: pal.muted, backgroundColor: pal.bg3 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>

              {/* Nav links */}
              <nav className="flex-1 p-5 space-y-1">
                {[
                  { href: '/menu',    label: 'Menu',         icon: '🍽️' },
                  ...(hasActiveOrder ? [{ href: '/menu?track=1', label: 'Track Order', icon: '🔴' }] : []),
                  { href: '/book',    label: 'Book a Table', icon: '📅' },
                  { href: token ? '/account' : '/login', label: token && user ? user.name?.split(' ')[0] ?? 'My Account' : 'Sign In', icon: '👤' },
                ].map(n => (
                  <Link key={n.href} href={n.href} onClick={() => setNavOpen(false)}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all"
                    style={{ color: pal.text }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = pal.bg3}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <span>{n.icon}</span>
                    {n.label}
                    {ar ? <ArrowLeft size={13} className="me-auto" style={{ color: 'var(--brand)' }} /> : <ArrowRight size={13} className="ms-auto" style={{ color: 'var(--brand)' }} />}
                  </Link>
                ))}
              </nav>

              {/* Footer actions */}
              <div className="p-5 border-t space-y-3" style={{ borderColor: pal.border }}>
                {showLanguageToggle && (
                  <button
                    onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-2xl font-bold text-sm w-full"
                    style={{ border: `1px solid ${pal.border}`, color: pal.muted }}>
                    {lang === 'en' ? '🇦🇪 العربية' : '🇬🇧 English'}
                  </button>
                )}
                {token && user && (
                  <button onClick={() => { setNavOpen(false); logout() }}
                    className="flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm w-full"
                    style={{ border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
                    <LogOut size={13} /> Sign out
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ══════════════════════════════════════
          HERO
      ══════════════════════════════════════ */}
      <section ref={heroRef} className="relative flex flex-col items-center justify-center overflow-hidden" style={{ height: '100svh', minHeight: 680 }}>
        <div className="absolute inset-0 overflow-hidden">
          {cfg.heroConfig?.heroMediaType === 'image' ? (
            <img
              src={cfg.heroConfig.heroImageUrl || FALLBACK_POSTER}
              alt="Hero background"
              className="w-full h-full object-cover"
              style={{ opacity: 0.5, filter: 'saturate(0.7) brightness(0.85)' }}
            />
          ) : (
            <video
              key={cfg.heroConfig?.videoUrl || FALLBACK_VIDEO}
              ref={videoRef}
              src={cfg.heroConfig?.videoUrl || FALLBACK_VIDEO}
              autoPlay muted loop playsInline
              poster={cfg.heroConfig?.posterUrl || FALLBACK_POSTER}
              className="w-full h-full object-cover"
              style={{ opacity: 0.5, filter: 'saturate(0.7) brightness(0.85)', transformOrigin: 'center center', willChange: 'transform' }}
            />
          )}
        </div>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.4) 75%, rgba(0,0,0,0.98) 100%)' }} />

        {/* Floating ambient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 1 }}>
          <div style={{
            position: 'absolute', width: 600, height: 600, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(var(--brand-rgb),0.12) 0%, transparent 70%)',
            top: '-10%', left: '-8%',
            animation: 'orbFloat1 18s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', width: 480, height: 480, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(var(--brand-rgb),0.08) 0%, transparent 70%)',
            bottom: '10%', right: '-5%',
            animation: 'orbFloat2 22s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', width: 300, height: 300, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(251,191,36,0.1) 0%, transparent 70%)',
            top: '40%', left: '40%',
            animation: 'orbFloat1 14s ease-in-out infinite reverse',
          }} />
        </div>

        <div className="relative z-10 text-center flex flex-col items-center" style={{ padding: '0 clamp(1.5rem,8vw,10rem)', width: '100%' }}>
          <div ref={heroBadgeRef} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-10 opacity-0"
            style={{ backgroundColor: 'rgba(var(--brand-rgb),0.12)', border: '1px solid rgba(var(--brand-rgb),0.28)', color: 'var(--brand)', backdropFilter: 'blur(10px)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--brand)' }} />
            {(lang === 'ar' && cfg.heroConfig?.badgeTextAr) || cfg.heroConfig?.badgeText || `Now Open · ${cfg.address ?? 'Dubai, UAE'}`}
          </div>

          <div ref={heroTextRef}>
            <h1 className="hero-line font-black leading-none opacity-0"
              style={{ fontSize: 'clamp(3.8rem,11vw,9rem)', color: '#fff', letterSpacing: '-0.035em', lineHeight: 0.92 }}>
              {(lang === 'ar' && cfg.heroConfig?.line1Ar) || cfg.heroConfig?.line1 || 'Taste of'}
            </h1>
            <h1 className="hero-line font-black leading-none opacity-0"
              style={{ fontSize: 'clamp(3.8rem,11vw,9rem)', color: 'var(--brand)', letterSpacing: '-0.035em', lineHeight: 0.92, fontStyle: 'italic' }}>
              {(lang === 'ar' && cfg.heroConfig?.line2Ar) || cfg.heroConfig?.line2 || 'Kerala'}
            </h1>
            <p className="hero-line mt-6 font-light opacity-0"
              style={{ fontSize: 'clamp(1rem,2.2vw,1.3rem)', color: 'rgba(255,255,255,0.48)', letterSpacing: '0.01em' }}>
              {(lang === 'ar' && cfg.heroConfig?.subtextAr) || cfg.heroConfig?.subtext || cfg.tagline || 'Authentic South Indian cuisine · Dubai'}
            </p>
          </div>

          <div ref={heroCtaRef} className="flex flex-row gap-2.5 items-center justify-center mt-10 opacity-0 flex-wrap">
            <Link href="/menu"
              className="flex items-center gap-2 rounded-2xl font-bold"
              style={{ backgroundColor: 'var(--brand)', color: '#000', boxShadow: '0 8px 40px rgba(var(--brand-rgb),0.38)', padding: 'clamp(10px,2.5vw,16px) clamp(20px,5vw,32px)', fontSize: 'clamp(13px,3.5vw,16px)' }}>
              {(ar && cfg.heroConfig?.ctaLabelAr) ? cfg.heroConfig.ctaLabelAr : (cfg.heroConfig?.ctaLabel || 'Order Now')} <ArrowRight size={14} />
            </Link>
            <Link href="/book"
              className="flex items-center gap-2 rounded-2xl font-medium"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(12px)', padding: 'clamp(10px,2.5vw,16px) clamp(16px,4vw,32px)', fontSize: 'clamp(13px,3.5vw,16px)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.13)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)' }}>
              {(ar && cfg.heroConfig?.ctaSecondaryLabelAr) ? cfg.heroConfig.ctaSecondaryLabelAr : (cfg.heroConfig?.ctaSecondaryLabel || 'Reserve a Table')}
            </Link>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-8 mt-14"
            style={{ opacity: 0, animation: 'fadeUp 0.7s ease forwards 1.5s' }}>
            {[
              { value: '4.8', label: '500+ reviews', sub: true },
              { value: '18m', label: 'Avg prep time', sub: false },
              { value: fmtTime(cfg.openTime), label: 'Opens daily', sub: false },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-8">
                {i > 0 && <div style={{ width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.1)' }} />}
                <div className="text-center">
                  <p className="font-black text-xl leading-none" style={{ color: '#fff' }}>{s.value}</p>
                  {s.sub && <div className="flex gap-0.5 justify-center my-1">{[...Array(5)].map((_, j) => <Star key={j} size={9} style={{ color: 'var(--brand)', fill: 'var(--brand)' }} />)}</div>}
                  <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.28)' }}>{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5"
          style={{ opacity: 0, animation: 'fadeUp 0.6s ease forwards 2s' }}>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Scroll</span>
          <ChevronDown size={14} style={{ color: 'rgba(255,255,255,0.25)', animation: 'bobY 2.5s ease-in-out infinite' }} />
        </div>
      </section>

      {/* ══════════════════════════════════════
          DIAGONAL STREAMING GALLERY
      ══════════════════════════════════════ */}
      {(() => {
        const galleryItems = showcase.length >= 4 ? showcase : SHOWCASE_FALLBACK
        // Repeat enough times so strips never gap
        const row = [...galleryItems, ...galleryItems, ...galleryItems, ...galleryItems, ...galleryItems]
        const strips = [
          { top: '-12%', height: 'clamp(120px,16vh,200px)', speed: 150, reverse: false,  blur: 0    },
          { top:  '20%', height: 'clamp(160px,21vh,260px)', speed: 110, reverse: true,   blur: 0    },
          { top:  '56%', height: 'clamp(140px,18vh,220px)', speed: 135, reverse: false,  blur: 0    },
          { top:  '86%', height: 'clamp(110px,14vh,180px)', speed: 125, reverse: true,   blur: 0    },
        ]
        return (
          <section ref={relayRef} style={{ position: 'relative', height: '90vh', minHeight: 560, backgroundColor: '#060504', overflow: 'hidden' }}>

            {/* subtle grain texture overlay */}
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E")', opacity: 0.4, pointerEvents: 'none', zIndex: 1 }} />

            {strips.map((s, si) => (
              <div key={si} style={{ position: 'absolute', top: s.top, left: '-22%', width: '144%', transform: 'rotate(-9deg)', zIndex: 0 }}>
                <div style={{ display: 'flex', gap: 12, animation: `marqueeX ${s.speed}s linear infinite ${s.reverse ? 'reverse' : ''}`, width: 'max-content' }}>
                  {row.map((item, i) => (
                    <div key={`${si}-${i}`} className="flex-shrink-0 relative overflow-hidden group"
                      style={{
                        width: si === 1 ? 'clamp(200px,22vw,310px)' : si === 2 ? 'clamp(180px,20vw,270px)' : 'clamp(160px,18vw,240px)',
                        height: s.height,
                        borderRadius: 16,
                        boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}>
                      <img src={item.img} alt={item.name}
                        className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110"
                        style={{ filter: `saturate(${si === 1 ? 0.75 : 0.55}) brightness(${si === 1 ? 0.8 : 0.65})` }} />
                      {/* Gold shimmer on hover */}
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{ background: 'linear-gradient(135deg, rgba(var(--brand-rgb),0.12) 0%, transparent 60%, rgba(var(--brand-rgb),0.06) 100%)' }} />
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400"
                        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 55%)' }} />
                      <p className="absolute bottom-0 left-0 right-0 px-4 py-3 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-400"
                        style={{ color: '#fff', letterSpacing: '0.04em' }}>{item.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Deep radial vignette — frames the centre text */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', background: 'radial-gradient(ellipse 52% 58% at 50% 50%, rgba(6,5,4,0.88) 0%, rgba(6,5,4,0.55) 48%, rgba(6,5,4,0.12) 70%, transparent 90%)' }} />

            {/* Edge vignettes */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(to right, rgba(6,5,4,0.7) 0%, transparent 18%, transparent 82%, rgba(6,5,4,0.7) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(to bottom, rgba(6,5,4,0.6) 0%, transparent 20%, transparent 80%, rgba(6,5,4,0.6) 100%)' }} />

            {/* Centre content */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                {/* Eyebrow with lines */}
                <div className="relay-el" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 20 }}>
                  <span style={{ flex: 1, maxWidth: 40, height: 1, backgroundColor: 'rgba(var(--brand-rgb),0.4)' }} />
                  <p style={{ color: 'var(--brand)', fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', fontWeight: 700 }}>{(ar && cfg.heroConfig?.relayTaglineAr) ? cfg.heroConfig.relayTaglineAr : (cfg.heroConfig?.relayTagline || "The Kitchen's Finest")}</p>
                  <span style={{ flex: 1, maxWidth: 40, height: 1, backgroundColor: 'rgba(var(--brand-rgb),0.4)' }} />
                </div>

                <h2 className="relay-el" style={{ color: '#faf9f5', fontSize: 'clamp(2.6rem,7vw,5.5rem)', fontWeight: 900, lineHeight: 1.04, letterSpacing: '-0.025em', marginBottom: 8 }}>
                  {(ar && cfg.heroConfig?.relayHeadlineAr) ? cfg.heroConfig.relayHeadlineAr : (cfg.heroConfig?.relayHeadline || 'Made fresh,')}
                </h2>
                <h2 className="relay-el" style={{
                  fontSize: 'clamp(2.6rem,7vw,5.5rem)', fontWeight: 900, lineHeight: 1.04, letterSpacing: '-0.025em', marginBottom: 32,
                  backgroundImage: 'linear-gradient(135deg, var(--brand) 0%, var(--brand-dark) 45%, rgba(var(--brand-rgb),0.35) 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}>
                  {(ar && cfg.heroConfig?.relayHeadlinePart2Ar) ? cfg.heroConfig.relayHeadlinePart2Ar : (cfg.heroConfig?.relayHeadlinePart2 || 'every single day.')}
                </h2>

                <Link className="relay-el" href="/menu"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', borderRadius: 100, fontWeight: 700, fontSize: 14, backgroundColor: 'var(--brand)', color: '#000', boxShadow: '0 0 0 1px rgba(var(--brand-rgb),0.3), 0 8px 48px rgba(var(--brand-rgb),0.42)', letterSpacing: '0.01em', textDecoration: 'none', transition: 'transform 0.2s, box-shadow 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 0 0 1px rgba(var(--brand-rgb),0.4), 0 12px 56px rgba(var(--brand-rgb),0.55)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 0 0 1px rgba(var(--brand-rgb),0.3), 0 8px 48px rgba(var(--brand-rgb),0.42)' }}>
                  Explore Menu <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </section>
        )
      })()}

      {/* ══════════════════════════════════════
          SIGNATURE DISHES
      ══════════════════════════════════════ */}
      <section className="px-4 sm:px-6 lg:px-[clamp(1.5rem,6vw,8rem)]" style={{ backgroundColor: pal.bg, paddingTop: 'clamp(3rem,8vh,6rem)', paddingBottom: 'clamp(3rem,8vh,6rem)' }}>
        <div ref={dishHeadRef} className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 md:mb-10 gap-3">
          <div>
            <p style={{ color: 'var(--brand)', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 10 }}>{(ar && cfg.heroConfig?.dishesSubtextAr) ? cfg.heroConfig.dishesSubtextAr : (cfg.heroConfig?.dishesSubtext || 'Signature Dishes')}</p>
            <h2 style={{ color: pal.text, fontSize: 'clamp(1.6rem,7vw,3rem)', fontWeight: 900, lineHeight: 1.12, letterSpacing: '-0.025em' }}>
              {(ar && cfg.heroConfig?.dishesHeadlineAr) ? cfg.heroConfig.dishesHeadlineAr : (cfg.heroConfig?.dishesHeadline || "Dishes you'll dream about.")}
            </h2>
          </div>
          <Link href="/menu" className="flex items-center gap-2 text-sm font-semibold flex-shrink-0 self-start sm:self-auto"
            style={{ color: 'var(--brand)' }}>
            Full Menu <ArrowRight size={14} />
          </Link>
        </div>
        {(() => {
          const visibleDishes    = dishes.slice(dishPage * 6, dishPage * 6 + 6)
          const pages            = Math.ceil(dishes.length / 6)

          return (
            <div ref={dishGridRef}>
              {/* Mobile — all dishes, native swipe, no auto-rotation */}
              <div className="md:hidden">
                <SignatureDishesMobile
                  dishes={dishes}
                  mutedColor={pal.muted}
                  dotInactive={dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)'}
                />
              </div>

              {/* Desktop — paginated grid with crossfade on page change */}
              <div className="hidden md:block">
                <div
                  key={dishPageKey}
                  className="md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4"
                  style={{ animation: 'dishFadeIn 0.45s ease both' }}
                >
                  {visibleDishes.map((d, i) => <DishCard key={d.name} {...d} index={i} />)}
                </div>
              </div>

              {/* Desktop page dots only */}
              {pages > 1 && (
                <div className="hidden md:flex justify-center gap-2 mt-6">
                  {Array.from({ length: pages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => goToDishPage(i)}
                      style={{
                        width: i === dishPage ? 20 : 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: i === dishPage ? 'var(--brand)' : (dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)'),
                        transition: 'all 0.3s ease',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })()}
      </section>


      {/* ══════════════════════════════════════
          AMBIENCE + LOCATION — editorial mosaic
      ══════════════════════════════════════ */}
      {(() => {
        const allAmb = [1,2,3,4,5,6,7,8]
          .map(i => cfg.heroConfig?.[`ambienceImg${i}` as keyof typeof cfg.heroConfig] as string | undefined)
          .filter(Boolean) as string[]
        const fallback = AMBIENCE
        const pool = allAmb.length >= 4 ? allAmb : fallback
        const imgs = pool.slice(ambPage * 4, ambPage * 4 + 4)
        // pad to 4 if last page is short
        while (imgs.length < 4) imgs.push(pool[imgs.length % pool.length])
        return (
      <section ref={ambienceRef} className="px-4 sm:px-6 lg:px-[clamp(1.5rem,5vw,6rem)]" style={{ backgroundColor: '#060606', paddingTop: 'clamp(4rem,9vh,6rem)', paddingBottom: 'clamp(4rem,9vh,6rem)' }}>

        {/* Headline above photos */}
        <div className="amb-el text-center mb-8 md:mb-12 px-1">
          <p style={{ color: 'var(--brand)', fontSize: 10, fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase', marginBottom: 14 }}>{(ar && cfg.heroConfig?.ambienceTaglineAr) ? cfg.heroConfig.ambienceTaglineAr : (cfg.heroConfig?.ambienceTagline || 'The Space')}</p>
          <h2 style={{ color: '#fff', fontSize: 'clamp(1.75rem,8vw,3.8rem)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.03em' }}>
            {(ar && cfg.heroConfig?.ambienceHeadlineAr) ? cfg.heroConfig.ambienceHeadlineAr : (cfg.heroConfig?.ambienceHeadline || 'Come for the food.')}<br />
            <span style={{
              backgroundImage: 'linear-gradient(135deg, var(--brand) 0%, var(--brand-dark) 55%, var(--brand) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>{(ar && cfg.heroConfig?.ambienceHeadlinePart2Ar) ? cfg.heroConfig.ambienceHeadlinePart2Ar : (cfg.heroConfig?.ambienceHeadlinePart2 || 'Stay for the feeling.')}</span>
          </h2>
        </div>

        {/* Photo grid — mobile: 2x2, desktop: left tall + right stacked 3 */}
        <div className="amb-el mb-4 md:mb-2.5">
          <div style={{ opacity: ambFading ? 0 : 1, transition: 'opacity 0.5s ease' }}>
            <div className="md:hidden grid grid-cols-2 gap-2.5">
              {imgs.map((src, i) => (
                <div key={`${ambPage}-${i}`} className="group relative overflow-hidden aspect-[4/5]" style={{ borderRadius: 14 }}>
                  <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'brightness(0.78) saturate(0.85)' }} />
                </div>
              ))}
            </div>
            {/* Desktop: left tall portrait + right 3 stacked */}
            <div className="hidden md:flex gap-2.5" style={{ height: 'clamp(340px,52vh,520px)' }}>
              <div className="group flex-shrink-0 relative overflow-hidden" style={{ width: '52%', borderRadius: 18 }}>
                <img src={imgs[0]} alt="restaurant" className="w-full h-full object-cover transition-all duration-700 group-hover:scale-[1.03]"
                  style={{ filter: 'brightness(0.82) saturate(0.85)' }} />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 45%)' }} />
              </div>
              <div className="flex flex-col gap-2.5 flex-1">
                {imgs.slice(1).map((src, i) => (
                  <div key={`${ambPage}-r${i}`} className="group relative overflow-hidden flex-1" style={{ borderRadius: 18 }}>
                    <img src={src} alt="" className="w-full h-full object-cover transition-all duration-700 group-hover:scale-[1.05]"
                      style={{ filter: 'brightness(0.76) saturate(0.82)' }} />
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                      style={{ background: 'rgba(var(--brand-rgb),0.07)' }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Page dots — only when > 4 ambience images */}
          {pool.length > 4 && (
            <div className="flex justify-center gap-2 mt-4">
              {Array.from({ length: Math.ceil(pool.length / 4) }).map((_, i) => (
                <button key={i}
                  onClick={() => { setAmbFading(true); setTimeout(() => { setAmbPage(i); setAmbFading(false) }, 500) }}
                  style={{ width: i === ambPage ? 20 : 6, height: 6, borderRadius: 3, padding: 0, border: 'none', cursor: 'pointer', transition: 'all 0.3s ease', backgroundColor: i === ambPage ? 'var(--brand)' : 'rgba(255,255,255,0.18)' }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Info strip — stacked cards on mobile, horizontal on desktop */}
        <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.03] overflow-hidden">

          {/* Open badge — full-width row on mobile */}
          <div className="md:hidden flex items-center justify-center gap-2 py-3 border-b border-white/[0.07]">
            <span className="animate-pulse inline-block w-[7px] h-[7px] rounded-full bg-green-500" />
            <span className="text-green-300 text-xs font-semibold">Open now</span>
          </div>

          <div className="flex flex-col divide-y divide-white/[0.07] md:flex-row md:divide-y-0 md:flex-wrap md:items-center">
            {/* Location */}
            <div className="flex items-center gap-3.5 px-4 py-4 md:flex-1 md:min-w-[200px] md:px-6 md:py-5 md:border-r md:border-white/[0.07]">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', border: '1px solid rgba(var(--brand-rgb),0.18)' }}>
                <MapPin size={15} style={{ color: 'var(--brand)' }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold text-sm leading-snug">{cfg.address ?? 'Dubai, UAE'}</p>
                <a href={`https://maps.google.com/?q=${encodeURIComponent(cfg.address ?? 'Dubai UAE')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-block mt-1 text-[11px] font-semibold no-underline"
                  style={{ color: 'var(--brand)' }}>
                  Get directions →
                </a>
              </div>
            </div>

            {/* Hours */}
            <div className="flex items-center gap-3.5 px-4 py-4 md:flex-1 md:min-w-[180px] md:px-6 md:py-5 md:border-r md:border-white/[0.07]">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', border: '1px solid rgba(var(--brand-rgb),0.18)' }}>
                <Clock size={15} style={{ color: 'var(--brand)' }} />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{fmtTime(cfg.openTime)} – {fmtTime(cfg.closeTime)}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Every day</p>
              </div>
            </div>

            {/* Phone */}
            {cfg.phone && (
              <div className="flex items-center gap-3.5 px-4 py-4 md:flex-1 md:min-w-[160px] md:px-6 md:py-5 md:border-r md:border-white/[0.07]">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', border: '1px solid rgba(var(--brand-rgb),0.18)' }}>
                  <Phone size={15} style={{ color: 'var(--brand)' }} />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{cfg.phone}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Reservations</p>
                </div>
              </div>
            )}

            {/* Open badge — inline on desktop only */}
            <div className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-full ml-auto mr-5 my-3 flex-shrink-0"
              style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <span className="animate-pulse inline-block w-[7px] h-[7px] rounded-full bg-green-500" />
              <span className="text-green-300 text-xs font-semibold whitespace-nowrap">Open now</span>
            </div>
          </div>
        </div>
      </section>
        )
      })()}

      {/* ══════════════════════════════════════
          TESTIMONIALS — flip-card relay
      ══════════════════════════════════════ */}
      <section ref={reviewsRef} className="py-12 md:py-[clamp(4rem,9vh,6rem)] overflow-hidden relative" style={{ backgroundColor: dark ? '#050508' : '#f5f1eb' }}>

        {/* Ambient blobs — desktop only */}
        <div className="hidden md:block absolute inset-0 pointer-events-none overflow-hidden">
          <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', top: '-20%', right: '-10%', background: 'radial-gradient(circle, rgba(var(--brand-rgb),0.07) 0%, transparent 65%)', animation: 'orbFloat2 22s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', width: 450, height: 450, borderRadius: '50%', bottom: '-10%', left: '-8%', background: 'radial-gradient(circle, rgba(var(--brand-rgb),0.06) 0%, transparent 65%)', animation: 'orbFloat1 28s ease-in-out infinite' }} />
          {([
            { top: '15%', left: '6%',  delay: '0s',   size: 4 },
            { top: '70%', left: '4%',  delay: '1.2s', size: 3 },
            { top: '20%', left: '90%', delay: '0.7s', size: 4 },
            { top: '75%', left: '88%', delay: '1.8s', size: 5 },
            { top: '45%', left: '50%', delay: '2.3s', size: 3 },
          ] as { top: string; left: string; delay: string; size: number }[]).map((s, i) => (
            <div key={i} style={{
              position: 'absolute', top: s.top, left: s.left,
              width: s.size, height: s.size, borderRadius: '50%',
              backgroundColor: 'var(--brand)',
              animation: `glitterPulse ${2.8 + i * 0.5}s ease-in-out infinite ${s.delay}`,
              boxShadow: `0 0 ${s.size * 4}px rgba(var(--brand-rgb),0.9)`,
            }} />
          ))}
        </div>

        {/* Header */}
        <div className="reviews-head text-center mb-6 md:mb-12 px-4 sm:px-6 lg:px-[clamp(1.5rem,6vw,8rem)] relative z-[1]">
          <p style={{ color: 'var(--brand)', fontSize: 10, fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase', marginBottom: 10 }}>Guest Reviews</p>
          <h2 style={{ color: pal.text, fontSize: 'clamp(1.55rem,6.5vw,3rem)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.08 }}>
            {(ar && cfg.heroConfig?.reviewsHeadlineAr) ? cfg.heroConfig.reviewsHeadlineAr : (cfg.heroConfig?.reviewsHeadline || 'Loved by every table')}
          </h2>
          <p className="hidden md:block" style={{ color: pal.muted, fontSize: 13, marginTop: 10 }}>Tap any card to read the full review</p>
        </div>

        {/* Mobile — single compact carousel */}
        <div className="md:hidden relative z-[1]">
          <ReviewsMobile active={reviewIdx} onSelect={setReviewIdx} dark={dark} pal={pal} />
        </div>

        {/* Desktop — dual marquee strips */}
        <div className="hidden md:block">
          <div style={{ position: 'relative', marginBottom: 16, zIndex: 1 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 120, zIndex: 2, pointerEvents: 'none', background: `linear-gradient(to right, ${dark ? '#050508' : '#f5f1eb'}, transparent)` }} />
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 120, zIndex: 2, pointerEvents: 'none', background: `linear-gradient(to left, ${dark ? '#050508' : '#f5f1eb'}, transparent)` }} />
            <div className="review-relay-strip" style={{ display: 'flex', gap: 16, width: 'max-content', animation: 'marqueeX 38s linear infinite', padding: '8px 16px' }}
              onMouseEnter={e => (e.currentTarget.style.animationPlayState = 'paused')}
              onMouseLeave={e => (e.currentTarget.style.animationPlayState = 'running')}>
              {[...TESTIMONIALS, ...TESTIMONIALS].map((t, i) => (
                <ReviewCard key={i} t={t} i={i % TESTIMONIALS.length} dark={dark} />
              ))}
            </div>
          </div>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 120, zIndex: 2, pointerEvents: 'none', background: `linear-gradient(to right, ${dark ? '#050508' : '#f5f1eb'}, transparent)` }} />
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 120, zIndex: 2, pointerEvents: 'none', background: `linear-gradient(to left, ${dark ? '#050508' : '#f5f1eb'}, transparent)` }} />
            <div style={{ display: 'flex', gap: 16, width: 'max-content', animation: 'marqueeX 44s linear infinite reverse', padding: '8px 16px 4px' }}
              onMouseEnter={e => (e.currentTarget.style.animationPlayState = 'paused')}
              onMouseLeave={e => (e.currentTarget.style.animationPlayState = 'running')}>
              {[...TESTIMONIALS.slice().reverse(), ...TESTIMONIALS.slice().reverse()].map((t, i) => (
                <ReviewCard key={i} t={t} i={i % TESTIMONIALS.length} dark={dark} />
              ))}
            </div>
          </div>
        </div>

        {/* Rating row */}
        <div className="reviews-head flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-3 mt-6 md:mt-10 relative z-[1]">
          <div className="flex items-center gap-2">
            <div style={{ display: 'flex', gap: 3 }}>
              {[...Array(5)].map((_, i) => <Star key={i} size={12} style={{ color: 'var(--brand)', fill: 'var(--brand)' }} />)}
            </div>
            <span style={{ color: pal.text, fontWeight: 800, fontSize: 14 }}>4.9</span>
          </div>
          <span style={{ color: pal.muted, fontSize: 12 }}>Based on 200+ reviews</span>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ backgroundColor: '#060606', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Mobile quick actions */}
        <div className="md:hidden px-4 pt-8 pb-6 border-b border-white/[0.05]">
          <div className="grid grid-cols-2 gap-2.5 mb-2.5">
            <Link href="/menu"
              className="col-span-2 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold no-underline"
              style={{ backgroundColor: 'var(--brand)', color: '#000', boxShadow: '0 8px 28px rgba(var(--brand-rgb),0.28)' }}>
              Order Now <ArrowRight size={14} />
            </Link>
            <Link href="/book"
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-semibold no-underline border border-white/10"
              style={{ color: 'rgba(255,255,255,0.75)', backgroundColor: 'rgba(255,255,255,0.03)' }}>
              <CalendarDays size={13} style={{ color: 'var(--brand)' }} /> Book Table
            </Link>
            <a href={`https://maps.google.com/?q=${encodeURIComponent(cfg.address ?? 'Dubai UAE')}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-semibold no-underline border border-white/10"
              style={{ color: 'rgba(255,255,255,0.75)', backgroundColor: 'rgba(255,255,255,0.03)' }}>
              <MapPin size={13} style={{ color: 'var(--brand)' }} /> Directions
            </a>
          </div>
        </div>

        {/* Main footer body */}
        <div className="px-4 sm:px-6 lg:px-[clamp(1.5rem,6vw,8rem)] py-8 md:py-[clamp(2.5rem,5vh,3.5rem)] border-b border-white/[0.05]">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 lg:gap-10">

            {/* Brand — centered on mobile */}
            <div className="w-full lg:max-w-[300px] text-center lg:text-left">
              <div className="flex items-center gap-3 mb-3 justify-center lg:justify-start">
                {cfg.logoUrl
                  ? <img src={cfg.logoUrl} alt={cfg.restaurantName} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }} />
                  : <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: 'var(--brand)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
                      <UtensilsCrossed size={16} className="text-black" />
                    </div>
                }
                <div className="text-left">
                  <div className="font-black text-sm tracking-tight" style={{ color: '#f5f3ef' }}>{cfg.restaurantName}</div>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{cfg.tagline ?? ''}</div>
                </div>
              </div>
              {cfg.tagline && (
                <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 12, lineHeight: 1.7 }}>
                  {cfg.tagline}
                </p>
              )}
            </div>

            {/* Mobile: visit cards */}
            <div className="md:hidden w-full grid grid-cols-1 gap-2.5">
              <a href={`https://maps.google.com/?q=${encodeURIComponent(cfg.address ?? 'Dubai UAE')}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-3.5 rounded-2xl border border-white/[0.07] no-underline"
                style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', border: '1px solid rgba(var(--brand-rgb),0.18)' }}>
                  <MapPin size={14} style={{ color: 'var(--brand)' }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 2 }}>Location</p>
                  <p className="text-sm truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{cfg.address ?? 'Dubai, UAE'}</p>
                </div>
                <ArrowRight size={14} style={{ color: 'var(--brand)', flexShrink: 0 }} />
              </a>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex items-center gap-2.5 p-3.5 rounded-2xl border border-white/[0.07]"
                  style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', border: '1px solid rgba(var(--brand-rgb),0.18)' }}>
                    <Clock size={14} style={{ color: 'var(--brand)' }} />
                  </div>
                  <div>
                    <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Hours</p>
                    <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>{fmtTime(cfg.openTime)} – {fmtTime(cfg.closeTime)}</p>
                  </div>
                </div>
                {cfg.phone ? (
                  <a href={`tel:${cfg.phone.replace(/\s/g, '')}`}
                    className="flex items-center gap-2.5 p-3.5 rounded-2xl border border-white/[0.07] no-underline"
                    style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: 'rgba(var(--brand-rgb),0.1)', border: '1px solid rgba(var(--brand-rgb),0.18)' }}>
                      <Phone size={14} style={{ color: 'var(--brand)' }} />
                    </div>
                    <div className="min-w-0">
                      <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Call</p>
                      <p className="text-xs font-semibold truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{cfg.phone}</p>
                    </div>
                  </a>
                ) : (
                  <div className="flex items-center gap-2.5 p-3.5 rounded-2xl border border-white/[0.07]"
                    style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    </div>
                    <div>
                      <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Status</p>
                      <p className="text-xs font-semibold text-green-400">Open now</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Nav columns — 2-col grid on mobile, row on desktop */}
            <div className="w-full lg:w-auto grid grid-cols-2 md:flex md:flex-wrap gap-6 md:gap-12">
              <div>
                <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 12 }}>Explore</p>
                {[{ href: '/menu', l: 'Menu' }, { href: '/book', l: 'Reserve a Table' }].map(n => (
                  <Link key={n.href} href={n.href} className="block mb-2.5 text-sm transition-colors py-0.5"
                    style={{ color: 'rgba(255,255,255,0.45)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--brand)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}>
                    {n.l}
                  </Link>
                ))}
              </div>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 12 }}>Account</p>
                {[
                  { href: token && user ? '/account' : '/login', l: token && user ? user.name?.split(' ')[0] ?? 'My Account' : 'Sign In' },
                  { href: '/staff/login', l: 'Staff Portal' },
                ].map(n => (
                  <Link key={n.href} href={n.href} className="block mb-2.5 text-sm transition-colors py-0.5"
                    style={{ color: 'rgba(255,255,255,0.45)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--brand)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}>
                    {n.l}
                  </Link>
                ))}
              </div>
              <div className="hidden md:block">
                <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 14 }}>Visit</p>
                <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{cfg.address ?? 'Dubai, UAE'}</p>
                <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{fmtTime(cfg.openTime)} – {fmtTime(cfg.closeTime)}</p>
                {cfg.phone && <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>{cfg.phone}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="px-4 sm:px-6 lg:px-[clamp(1.5rem,6vw,8rem)] py-4 md:py-3.5 flex flex-col items-center justify-center md:flex-row md:justify-between gap-3 text-center md:text-left">
          <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: 11 }}>© 2026 {cfg.restaurantName}. All rights reserved.</p>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-green-500/20"
            style={{ backgroundColor: 'rgba(34,197,94,0.06)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-green-500" />
            <span className="text-green-400/80 text-[11px] font-medium">Open now · Kitchen accepting orders</span>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes marqueeX {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bobY {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(5px); }
        }
        @keyframes cardFloat3d {
          0%,  100% { transform: translateY(0)     rotateY(-1.5deg) scale(1);    }
          50%        { transform: translateY(-10px) rotateY(1.5deg)  scale(1.02); }
        }
        @media (max-width: 767px) {
          .dish-card {
            animation: none !important;
            transform: none !important;
            box-shadow: 0 8px 28px rgba(0,0,0,0.35) !important;
          }
        }
        @media (min-width: 768px) {
          .dish-card {
            animation: cardFloat3d 6s ease-in-out infinite;
          }
        }
        @keyframes orbFloat1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%     { transform: translate(40px,-30px) scale(1.08); }
          66%     { transform: translate(-20px,20px) scale(0.94); }
        }
        @keyframes orbFloat2 {
          0%,100% { transform: translate(0,0) scale(1); }
          40%     { transform: translate(-50px,30px) scale(1.06); }
          70%     { transform: translate(30px,-20px) scale(0.97); }
        }
        @keyframes glitterPulse {
          0%,100% { opacity: 0.3; transform: scale(1) rotate(0deg); }
          50%     { opacity: 1;   transform: scale(1.4) rotate(180deg); }
        }
        @keyframes reviewCardIn {
          from { opacity: 0; transform: translateY(40px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
