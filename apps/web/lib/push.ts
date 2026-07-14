import { API_BASE } from './api'

// Subscribe this browser to server web-push. Safe to call repeatedly —
// re-uses the existing subscription. Requires notification permission and a
// logged-in user (silently no-ops otherwise). Uses raw fetch so a 401 here
// can never trigger the global logout redirect.
export async function subscribeToPush() {
  if (typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) return false
  const token = localStorage.getItem('token')
  if (!token) return false // not logged in — nothing to register

  try {
    if (Notification.permission === 'default') await Notification.requestPermission()
    if (Notification.permission !== 'granted') return false

    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
    }
    const json = sub.toJSON()
    const res = await fetch(`${API_BASE}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    })
    return res.ok
  } catch {
    return false
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}
