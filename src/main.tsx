import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// PWA: service worker を登録（本番のみ）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // ベースパス（GitHub Pages では /kakei-app/）配下の sw.js を登録
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {})
  })
}
