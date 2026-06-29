import Link from 'next/link'
import { UtensilsCrossed, Zap, Clock, CreditCard, Star, MapPin } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="text-orange-500" size={22} />
            <span className="font-bold text-lg">Al Manzil</span>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm text-gray-600">
            <Link href="/menu" className="hover:text-orange-500 transition-colors">Menu</Link>
            <Link href="/menu" className="hover:text-orange-500 transition-colors">Book a Table</Link>
            <Link href="/staff/login" className="text-xs text-gray-400 hover:text-gray-600">Staff Login</Link>
          </div>
          <Link href="/menu" className="bg-orange-500 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-orange-600 transition-colors">
            Order Now
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-16 min-h-screen flex items-center bg-gradient-to-br from-orange-50 via-white to-amber-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></span>
              Now serving — 7AM to 11PM daily
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-4">
              Great food,<br />
              <span className="text-orange-500">delivered fast.</span>
            </h1>
            <p className="text-gray-500 text-lg mb-8 leading-relaxed">
              Scan the QR on your table to order. Track your meal live. Pay instantly. No waiting, no confusion.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/menu" className="bg-orange-500 text-white px-6 py-3.5 rounded-xl font-semibold text-center hover:bg-orange-600 transition-colors">
                View Our Menu
              </Link>
              <Link href="/menu" className="border border-gray-200 text-gray-700 px-6 py-3.5 rounded-xl font-medium text-center hover:bg-gray-50 transition-colors">
                Book a Table
              </Link>
            </div>
            <div className="flex items-center gap-6 mt-8 text-sm text-gray-400">
              <div className="flex items-center gap-1.5"><Star size={14} className="text-yellow-400 fill-yellow-400" /> 4.8 rated</div>
              <div className="flex items-center gap-1.5"><Clock size={14} /> Avg 18 min</div>
              <div className="flex items-center gap-1.5"><MapPin size={14} /> Dubai, UAE</div>
            </div>
          </div>
          <div className="hidden md:flex justify-center">
            <div className="relative w-80 h-80 bg-gradient-to-br from-orange-400 to-amber-500 rounded-3xl flex items-center justify-center shadow-2xl">
              <UtensilsCrossed size={100} className="text-white opacity-80" />
              <div className="absolute -top-4 -right-4 bg-white rounded-2xl shadow-lg p-3 flex flex-col items-center">
                <div className="text-xs text-gray-500">Order #42</div>
                <div className="text-sm font-bold text-green-600">🍳 Preparing</div>
              </div>
              <div className="absolute -bottom-4 -left-4 bg-white rounded-2xl shadow-lg p-3">
                <div className="text-xs text-gray-500">Est. time</div>
                <div className="text-sm font-bold text-orange-500">~18 mins</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-12">How it works</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: '📱', title: 'Scan QR', desc: 'Scan the code on your table — no app download needed' },
              { icon: '🍽️', title: 'Browse & Order', desc: 'Pick your items, customize, and place your order in seconds' },
              { icon: '⚡', title: 'Live Tracking', desc: 'Watch your order status update in real time' },
              { icon: '💳', title: 'Pay Instantly', desc: 'Card, Apple Pay, or cash — your choice' },
            ].map(f => (
              <div key={f.title} className="text-center p-6 rounded-2xl border border-gray-100 hover:border-orange-200 hover:shadow-sm transition-all">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Menu Preview CTA */}
      <section className="py-16 bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Explore our menu</h2>
          <p className="text-gray-400 mb-8 text-lg">From breakfast to late-night bites — fresh, fast, and always flavourful.</p>
          <Link href="/menu" className="inline-block bg-orange-500 text-white px-8 py-3.5 rounded-xl font-semibold hover:bg-orange-600 transition-colors">
            See Full Menu
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <UtensilsCrossed size={16} className="text-orange-400" />
            <span>Al Manzil Hotel — Dubai, UAE</span>
          </div>
          <div className="flex items-center gap-4">
            <span>5% VAT included on all prices</span>
            <Link href="/staff/login" className="hover:text-gray-600">Staff Portal</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
