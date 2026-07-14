import toast from 'react-hot-toast'

let swReg: ServiceWorkerRegistration | null = null
let audioCtx: AudioContext | null = null

// Two-tone chime via Web Audio — no asset file needed. Works while any tab of
// the app is open (background tabs included); closed-browser alerts come from
// the OS notification sound via web push.
export function playChime(kind: 'new' | 'ready' = 'new') {
  if (typeof window === 'undefined') return
  try {
    audioCtx = audioCtx ?? new (window.AudioContext || (window as any).webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const notes = kind === 'new' ? [880, 1174.66] : [1046.5, 1318.5]
    notes.forEach((freq, i) => {
      const osc = audioCtx!.createOscillator()
      const gain = audioCtx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = audioCtx!.currentTime + i * 0.18
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
      osc.connect(gain).connect(audioCtx!.destination)
      osc.start(t)
      osc.stop(t + 0.5)
    })
  } catch {}
}

// Register service worker and request permission — call once on mount
export async function requestNotifyPermission() {
  if (typeof window === 'undefined') return
  if (!('Notification' in window)) return

  // Register SW first (required for mobile notifications)
  if ('serviceWorker' in navigator) {
    try {
      swReg = await navigator.serviceWorker.register('/sw.js')
      // Use any existing registration if already active
      const existing = await navigator.serviceWorker.getRegistration()
      if (existing) swReg = existing
    } catch {}
  }

  if (Notification.permission === 'default') {
    await Notification.requestPermission()
  }
}

async function push(title: string, body?: string) {
  if (typeof window === 'undefined') return
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  try {
    // Prefer SW notification (works on mobile + background tabs)
    const reg = swReg ?? await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, { body, tag: title, silent: false })
    } else {
      // Fallback: desktop only (SW not available)
      new Notification(title, { body, tag: title })
    }
  } catch {}
}

export const notify = {
  success(msg: string, pushTitle?: string) {
    toast.success(msg)
    push(pushTitle ?? msg)
  },
  error(msg: string, pushTitle?: string) {
    toast.error(msg)
    push(pushTitle ?? `⚠ ${msg}`)
  },
  info(msg: string, pushTitle?: string, toastOpts?: Parameters<typeof toast>[1]) {
    toast(msg, toastOpts)
    push(pushTitle ?? msg)
  },
  order: {
    new(label: string) {
      toast.success(`New order — ${label}`)
      push('🛎 New Order', label)
      playChime('new')
    },
    ready(label: string) {
      toast.success(`Order ready — ${label}`)
      push('✅ Order Ready', `${label} is ready to serve`)
      playChime('ready')
    },
    accepted(_label: string) {
      toast.success('✅ Your order has been confirmed!')
      push('Order Confirmed', 'Your order is being prepared')
    },
    preparing(_label: string) {
      toast('👨‍🍳 Chef is now preparing your order', { icon: '🍳' })
      push('In the Kitchen', 'Chef is on it')
    },
    readyGuest() {
      toast.success('🎉 Your order is ready!')
      push('🎉 Your Order is Ready!', 'Please collect or wait for your server')
    },
    cancelled() {
      toast.error('❌ Your order was cancelled. Please speak to a staff member.')
      push('Order Cancelled', 'Please speak to a staff member')
    },
    cashCollected(amount: string) {
      toast.success(`Cash collected — AED ${amount} ✓`)
      push('💵 Payment Collected', `AED ${amount} received`)
    },
  },
}
