// Al Manzil Service Worker — handles push notifications on mobile
self.addEventListener('push', event => {
  // Payload may be JSON (our backend) or plain text (DevTools test) — handle both
  let data = {}
  try { data = event.data?.json() ?? {} }
  catch { data = { title: 'Al Manzil', body: event.data?.text() ?? '' } }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Al Manzil', {
      body: data.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag ?? 'almanzil',
      renotify: true,
      data: data.url ? { url: data.url } : undefined,
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})

// Minimal install/activate — no caching, just notifications
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
