'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { UtensilsCrossed, Clock, Star, MapPin, Moon, Sun, ChevronRight, Menu, X, Phone } from 'lucide-react'
import AccountNavLink from '@/components/AccountNavLink'
import { useThemeStore } from '@/store/theme'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

interface MenuItem {
  id: string
  name: string
  description: string
  price: string
  imageUrl?: string
  prepTimeMins: number
}

interface RestaurantSettings {
  restaurantName: string
  tagline: string | null
  phone: string | null
  address: string | null
  logoUrl: string | null
  openTime: string
  closeTime: string
}

// A few hero food images from Unsplash for the rotating hero
const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1630383249896-424e482df921?w=1400&q=85',
  'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=1400&q=85',
  'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=1400&q=85',
]

const TESTIMONIALS = [
  { name: 'Arjun Nair', text: 'Best Kerala food outside of home. The Appam & Stew is absolutely perfect.', stars: 5, avatar: 'AN' },
  { name: 'Sarah K.', text: 'Ordered via QR, food arrived in 15 minutes. Masala Dosa was crispy and delicious!', stars: 5, avatar: 'SK' },
  { name: 'Mohammed Al-Rashid', text: 'The Malabar Biriyani is unreal. Coming back every week for sure.', stars: 5, avatar: 'MA' },
]

export default function LandingPage() {
  const { dark, toggle } = useThemeStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [heroIdx, setHeroIdx] = useState(0)
  const [featuredItems, setFeaturedItems] = useState<MenuItem[]>([])
  const [scrolled, setScrolled] = useState(false)
  const [cfg, setCfg] = useState<RestaurantSettings>({
    restaurantName: 'Al Manzil',
    tagline: 'Kerala & South Indian Cuisine',
    phone: null,
    address: 'Dubai, UAE',
    logoUrl: null,
    openTime: '07:00',
    closeTime: '23:00',
  })

  useEffect(() => {
    const t = setInterval(() => setHeroIdx(i => (i + 1) % HERO_IMAGES.length), 5000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    // Fetch restaurant settings
    fetch(`${API}/settings`)
      .then(r => r.json())
      .then(json => { const s = json?.data ?? json; if (s?.restaurantName) setCfg(s) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    // Fetch a few popular items from the menu API
    fetch(`${API}/menu/items`)
      .then(r => r.json())
      .then(json => {
        const items: MenuItem[] = json?.data ?? json ?? []
        // Pick 6 items with images
        const withImg = items.filter((i: MenuItem) => i.imageUrl).slice(0, 6)
        setFeaturedItems(withImg.length >= 4 ? withImg : items.slice(0, 6))
      })
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 transition-colors">

      {/* ─── Nav ─── */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 dark:bg-gray-950/95 backdrop-blur shadow-sm border-b border-gray-100 dark:border-gray-800'
          : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            {cfg.logoUrl
              ? <img src={cfg.logoUrl} alt={cfg.restaurantName} className="w-8 h-8 rounded-lg object-cover" />
              : <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center"><UtensilsCrossed size={16} className="text-white" /></div>
            }
            <span className={`font-bold text-lg transition-colors ${scrolled ? 'text-gray-900 dark:text-white' : 'text-white'}`}>
              {cfg.restaurantName}
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {[
              { href: '/menu', label: 'Menu' },
              { href: '/book', label: 'Reserve' },
            ].map(item => (
              <Link key={item.href} href={item.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  scrolled
                    ? 'text-gray-600 dark:text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}>
                {item.label}
              </Link>
            ))}
            <div className={`text-sm transition-colors ${scrolled ? '' : '[&_a]:text-white/80 [&_a:hover]:text-white'}`}>
              <AccountNavLink />
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <button onClick={toggle}
              className={`p-2 rounded-full transition-colors ${
                scrolled
                  ? 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  : 'hover:bg-white/10'
              }`}>
              {dark
                ? <Sun size={18} className="text-yellow-400" />
                : <Moon size={18} className={scrolled ? 'text-gray-500' : 'text-white'} />}
            </button>
            <Link href="/menu"
              className="hidden sm:block bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors shadow-lg shadow-orange-500/30">
              Order Now
            </Link>
            {/* Mobile hamburger */}
            <button onClick={() => setMobileMenuOpen(v => !v)}
              className={`md:hidden p-2 rounded-lg transition-colors ${scrolled ? 'hover:bg-gray-100 dark:hover:bg-gray-800' : 'hover:bg-white/10'}`}>
              {mobileMenuOpen
                ? <X size={20} className={scrolled ? 'text-gray-700 dark:text-gray-300' : 'text-white'} />
                : <Menu size={20} className={scrolled ? 'text-gray-700 dark:text-gray-300' : 'text-white'} />}
            </button>
          </div>
        </div>

        {/* Mobile menu drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-4 py-4 space-y-1 shadow-xl">
            <Link href="/menu" onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between px-4 py-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-600 font-medium">
              View Menu <ChevronRight size={16} />
            </Link>
            <Link href="/book" onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between px-4 py-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-600 font-medium">
              Reserve a Table <ChevronRight size={16} />
            </Link>
            <Link href="/account" onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between px-4 py-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-600 font-medium">
              My Account <ChevronRight size={16} />
            </Link>
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <Link href="/menu" onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-semibold transition-colors">
                Order Now
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative h-screen min-h-[600px] max-h-[900px] overflow-hidden">
        {/* Background images */}
        {HERO_IMAGES.map((src, i) => (
          <div key={src}
            className="absolute inset-0 transition-opacity duration-1000"
            style={{ opacity: i === heroIdx ? 1 : 0 }}>
            <img src={src} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Content */}
        <div className="relative h-full flex items-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 bg-orange-500/20 backdrop-blur-sm border border-orange-500/30 text-orange-300 px-3 py-1.5 rounded-full text-xs font-medium mb-6">
                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse" />
                {cfg.tagline ?? 'Kerala & South Indian Cuisine'} · {cfg.address ?? 'Dubai, UAE'}
              </div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-[1.05] mb-6">
                Authentic<br />
                <span className="text-orange-400">Kerala Flavours</span><br />
                <span className="text-3xl sm:text-4xl lg:text-5xl font-normal text-white/80">in the heart of Dubai</span>
              </h1>
              <p className="text-white/70 text-lg sm:text-xl mb-8 leading-relaxed max-w-lg">
                From crispy Masala Dosa to fragrant Malabar Biriyani — every dish is made fresh, with love, and ready in minutes.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mb-10">
                <Link href="/menu"
                  className="bg-orange-500 hover:bg-orange-400 text-white px-8 py-4 rounded-2xl font-bold text-lg text-center transition-all shadow-2xl shadow-orange-500/40 hover:shadow-orange-400/50 hover:scale-[1.02] active:scale-100">
                  Order Now
                </Link>
                <Link href="/book"
                  className="bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white px-8 py-4 rounded-2xl font-semibold text-lg text-center transition-all">
                  Reserve a Table
                </Link>
              </div>
              <div className="flex items-center gap-6 text-sm text-white/60">
                <div className="flex items-center gap-1.5">
                  <Star size={14} className="text-yellow-400 fill-yellow-400" />
                  <span className="text-white font-medium">4.8</span> rated
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock size={14} />
                  Avg 18 min
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin size={14} />
                  Dubai, UAE
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dot indicators */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
          {HERO_IMAGES.map((_, i) => (
            <button key={i} onClick={() => setHeroIdx(i)}
              className={`rounded-full transition-all ${i === heroIdx ? 'w-6 h-2 bg-orange-400' : 'w-2 h-2 bg-white/40 hover:bg-white/60'}`} />
          ))}
        </div>
      </section>

      {/* ─── Social proof strip ─── */}
      <section className="bg-orange-500 py-4 overflow-hidden">
        <div className="flex gap-12 whitespace-nowrap animate-[marquee_20s_linear_infinite]">
          {[...Array(3)].map((_, rep) => (
            <div key={rep} className="flex gap-12 flex-shrink-0">
              {['🍛 Kerala Sadya', '🥞 Appam & Stew', '🍖 Malabar Biriyani', '☕ Sulaimani Tea', '🐟 Fish Curry', '🥗 Aviyal', '🫓 Parotta & Curry', '🍚 Ghee Rice'].map(item => (
                <span key={item} className="text-white font-medium text-sm">{item}</span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Featured Dishes ─── */}
      <section className="py-20 bg-white dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <div className="inline-block text-orange-500 text-sm font-semibold uppercase tracking-wider mb-3">Our Specialities</div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Dishes you'll dream about
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-lg max-w-xl mx-auto">
              Every dish made from scratch with authentic Kerala spices. No shortcuts, no compromises.
            </p>
          </div>

          {featuredItems.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredItems.map((item, i) => (
                <FoodCard key={item.id} item={item} featured={i === 0} />
              ))}
            </div>
          ) : (
            // Fallback static cards while loading
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {STATIC_DISHES.map((dish, i) => (
                <StaticDishCard key={dish.name} dish={dish} featured={i === 0} />
              ))}
            </div>
          )}

          <div className="text-center mt-10">
            <Link href="/menu"
              className="inline-flex items-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-8 py-4 rounded-2xl font-bold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors">
              See Full Menu <ChevronRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <div className="inline-block text-orange-500 text-sm font-semibold uppercase tracking-wider mb-3">Simple &amp; Fast</div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">Order in 4 easy steps</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { step: '01', emoji: '📱', title: 'Scan QR', desc: 'Scan the code on your table — no app download needed, works on any phone' },
              { step: '02', emoji: '🍛', title: 'Pick Your Meal', desc: 'Browse Kerala classics, add items with a tap, customize your order' },
              { step: '03', emoji: '⚡', title: 'Live Tracking', desc: 'Watch your order go from kitchen to table in real time' },
              { step: '04', emoji: '💳', title: 'Pay Your Way', desc: 'Card, Apple Pay, or cash at the counter — your choice' },
            ].map(f => (
              <div key={f.step}
                className="relative bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-700 hover:shadow-lg hover:shadow-orange-50 dark:hover:shadow-none transition-all group">
                <div className="text-5xl mb-4">{f.emoji}</div>
                <div className="absolute top-5 right-5 text-4xl font-black text-gray-100 dark:text-gray-700 group-hover:text-orange-100 dark:group-hover:text-orange-900/30 transition-colors select-none">
                  {f.step}
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-2 text-lg">{f.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section className="py-20 bg-white dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <div className="inline-block text-orange-500 text-sm font-semibold uppercase tracking-wider mb-3">Reviews</div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">What our guests say</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} size={14} className="text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed mb-4">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-xs font-bold text-orange-600 dark:text-orange-400">
                    {t.avatar}
                  </div>
                  <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Big CTA banner ─── */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0">
          <img src="https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=1400&q=80"
            alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/75" />
        </div>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
            Hungry? Your table is ready.
          </h2>
          <p className="text-white/70 text-lg mb-8">
            Order online for dine-in or takeaway. Fresh Kerala food, ready in minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/menu"
              className="bg-orange-500 hover:bg-orange-400 text-white px-10 py-4 rounded-2xl font-bold text-lg transition-all shadow-2xl shadow-orange-500/40 hover:scale-[1.02] active:scale-100">
              Order Now
            </Link>
            <Link href="/book"
              className="bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/30 text-white px-10 py-4 rounded-2xl font-semibold text-lg transition-all">
              Book a Table
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="bg-gray-900 text-gray-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid sm:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
                  <UtensilsCrossed size={14} className="text-white" />
                </div>
                <span className="font-bold text-white text-base">{cfg.restaurantName}</span>
              </div>
              <p className="text-sm leading-relaxed mb-4">
                {cfg.tagline ?? 'Authentic Kerala & South Indian cuisine'}. Open {fmtTime(cfg.openTime)} – {fmtTime(cfg.closeTime)} daily.
              </p>
              {cfg.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone size={14} />
                  <span>{cfg.phone}</span>
                </div>
              )}
            </div>

            <div>
              <div className="font-semibold text-white mb-3 text-sm">Quick Links</div>
              <div className="space-y-2 text-sm">
                <Link href="/menu" className="block hover:text-orange-400 transition-colors">Our Menu</Link>
                <Link href="/book" className="block hover:text-orange-400 transition-colors">Reserve a Table</Link>
                <Link href="/account" className="block hover:text-orange-400 transition-colors">My Account</Link>
                <Link href="/staff/login" className="block hover:text-gray-300 transition-colors text-gray-600">Staff Portal</Link>
              </div>
            </div>

            <div>
              <div className="font-semibold text-white mb-3 text-sm">Find Us</div>
              <div className="text-sm space-y-1 mb-4">
                <div>{cfg.restaurantName}</div>
                <div>{cfg.address ?? 'Dubai, United Arab Emirates'}</div>
                <div className="mt-2 text-orange-400 font-medium">Open {fmtTime(cfg.openTime)} – {fmtTime(cfg.closeTime)} · 7 days a week</div>
              </div>
              <div className="flex gap-3">
                <a href="#" className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center hover:bg-orange-500 transition-colors text-sm font-bold text-white">
                  IG
                </a>
                <a href="#" className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center hover:bg-orange-500 transition-colors text-sm font-bold text-white">
                  FB
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
            <span>© 2026 {cfg.restaurantName} · {cfg.address ?? 'Dubai, UAE'}</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              5% VAT included on all prices
            </span>
          </div>
        </div>
      </footer>

      {/* Marquee keyframes */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
      `}</style>
    </div>
  )
}

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

// Dynamic food card from API
function FoodCard({ item, featured }: { item: MenuItem; featured: boolean }) {
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <Link href="/menu"
      className={`group relative overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-orange-200 dark:hover:border-orange-700 hover:shadow-xl hover:shadow-orange-50 dark:hover:shadow-orange-900/10 transition-all ${
        featured ? 'sm:col-span-2 lg:col-span-1' : ''
      }`}>
      <div className={`relative overflow-hidden ${featured ? 'h-64' : 'h-48'}`}>
        {item.imageUrl && !imgFailed ? (
          <img src={item.imageUrl} alt={item.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgFailed(true)} />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 flex items-center justify-center">
            <UtensilsCrossed size={40} className="text-orange-300" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-4 right-4">
          <div className="text-white font-bold text-lg leading-tight">{item.name}</div>
          <div className="text-white/70 text-xs mt-0.5 line-clamp-1">{item.description}</div>
        </div>
      </div>
      <div className="p-4 flex items-center justify-between bg-white dark:bg-gray-900">
        <div>
          <div className="font-bold text-gray-900 dark:text-white">AED {item.price}</div>
          <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
            <Clock size={11} /> ~{item.prepTimeMins} min
          </div>
        </div>
        <div className="bg-orange-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full group-hover:bg-orange-600 transition-colors">
          Order →
        </div>
      </div>
    </Link>
  )
}

// Static fallback dishes for before API loads
const STATIC_DISHES = [
  {
    name: 'Masala Dosa',
    desc: 'Crispy crepe with spiced potato filling, sambar & chutneys',
    price: '22',
    time: 12,
    img: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&q=80',
  },
  {
    name: 'Malabar Biriyani',
    desc: 'Fragrant basmati rice with tender chicken, fried onions & raita',
    price: '55',
    time: 25,
    img: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80',
  },
  {
    name: 'Appam & Stew',
    desc: 'Lacy rice pancakes with coconut milk stew & vegetables',
    price: '28',
    time: 15,
    img: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=600&q=80',
  },
  {
    name: 'Fish Curry',
    desc: 'Spiced Kerala red fish curry with coconut oil & kudampuli',
    price: '48',
    time: 20,
    img: 'https://images.unsplash.com/photo-1626508035297-0e8a5f53700b?w=600&q=80',
  },
  {
    name: 'Puttu & Kadala',
    desc: 'Steamed rice cylinders with black chickpea curry',
    price: '22',
    time: 10,
    img: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80',
  },
  {
    name: 'Kerala Prawn Fry',
    desc: 'Crispy prawns in Kerala masala with curry leaves',
    price: '65',
    time: 18,
    img: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80',
  },
]

function StaticDishCard({ dish, featured }: { dish: typeof STATIC_DISHES[0]; featured: boolean }) {
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <Link href="/menu"
      className="group relative overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-orange-200 dark:hover:border-orange-700 hover:shadow-xl hover:shadow-orange-50 dark:hover:shadow-orange-900/10 transition-all">
      <div className={`relative overflow-hidden ${featured ? 'h-64' : 'h-48'}`}>
        {!imgFailed ? (
          <img src={dish.img} alt={dish.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgFailed(true)} />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 flex items-center justify-center">
            <UtensilsCrossed size={40} className="text-orange-300" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-4 right-4">
          <div className="text-white font-bold text-lg leading-tight">{dish.name}</div>
          <div className="text-white/70 text-xs mt-0.5 line-clamp-1">{dish.desc}</div>
        </div>
      </div>
      <div className="p-4 flex items-center justify-between bg-white dark:bg-gray-900">
        <div>
          <div className="font-bold text-gray-900 dark:text-white">AED {dish.price}</div>
          <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
            <Clock size={11} /> ~{dish.time} min
          </div>
        </div>
        <div className="bg-orange-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full group-hover:bg-orange-600 transition-colors">
          Order →
        </div>
      </div>
    </Link>
  )
}
