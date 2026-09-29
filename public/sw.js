// ふたりの家計簿 — service worker
// アプリ本体（同一オリジン）はネット優先＋オフライン時キャッシュ。
// スプレッドシート同期など外部通信には一切介入しない。
const CACHE = 'kakei-v1'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  // SW の配置場所（例: /kakei-app/）を基準にキャッシュする
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  // GET かつ同一オリジンのみ扱う（外部＝Apps Script などは素通し）
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        return res
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  )
})
