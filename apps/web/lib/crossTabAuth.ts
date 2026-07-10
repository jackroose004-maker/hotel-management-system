const LOGOUT_KEY = 'al_manzil_force_logout'

type LogoutHandler = () => void

let handler: LogoutHandler | null = null
let channel: BroadcastChannel | null = null

export function initCrossTabAuth(onLogout: LogoutHandler) {
  handler = onLogout

  // BroadcastChannel: fastest path — same-origin tabs
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('al_manzil_auth')
    channel.onmessage = (e) => {
      if (e.data?.type === 'force_logout') handler?.()
    }
  }

  // localStorage fallback: catches tabs that miss the BroadcastChannel message
  window.addEventListener('storage', onStorage)
}

export function broadcastLogout() {
  // Signal all other tabs
  channel?.postMessage({ type: 'force_logout' })
  // localStorage fallback for browsers without BroadcastChannel
  localStorage.setItem(LOGOUT_KEY, Date.now().toString())
  localStorage.removeItem(LOGOUT_KEY)
}

export function teardownCrossTabAuth() {
  channel?.close()
  channel = null
  handler = null
  if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
}

function onStorage(e: StorageEvent) {
  if (e.key === LOGOUT_KEY && e.newValue) handler?.()
}
