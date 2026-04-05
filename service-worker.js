// ══════════════════════════════════════════
// ── Clarix Service Worker               ──
// ══════════════════════════════════════════

const CACHE_NAME = 'clarix-v1'

const STATIC_ASSETS = [
  '/css/style.css',
  '/css/sidebar.css',
  '/js/supabase.js',
  '/js/sidebar.js',
  '/js/lang.js',
  '/js/translations.js',
  '/pages/dashboard.html',
  '/pages/query-borrower.html',
  '/pages/submit-record.html',
  '/pages/my-records.html',
  '/pages/bulk-upload.html',
  '/pages/admin.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
]

// Install — cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  )
})

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  )
})

// Fetch — network first, fall back to cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests and Supabase API calls
  if (event.request.method !== 'GET') return
  if (event.request.url.includes('supabase.co')) return

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses
        if (response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => {
        // Network failed — try cache
        return caches.match(event.request)
      })
  )
})