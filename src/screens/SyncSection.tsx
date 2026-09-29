import { useState } from 'react'
import type { DataApi } from '../hooks/useData'

function fmtTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function SyncSection({ data }: { data: DataApi }) {
  const connected = !!data.syncConfig
  // 接続済みなら初期は畳んでおく（接続先を普段は隠す）
  const [open, setOpen] = useState(!connected)
  const [showForm, setShowForm] = useState(false)
  const [url, setUrl] = useState(data.syncConfig?.url ?? '')
  const [token, setToken] = useState(data.syncConfig?.token ?? '')
  const [showToken, setShowToken] = useState(false)
  const [busy, setBusy] = useState(false)

  const statusLabel =
    data.syncStatus === 'syncing'
      ? '同期中…'
      : data.syncStatus === 'error'
        ? '⚠️ エラー'
        : data.syncStatus === 'idle'
          ? '✅ 接続中'
          : '未接続'

  const statusClass =
    data.syncStatus === 'idle'
      ? 'bg-brand-50 text-brand-700'
      : data.syncStatus === 'error'
        ? 'bg-red-50 text-red-600'
        : data.syncStatus === 'syncing'
          ? 'bg-blue-50 text-blue-600'
          : 'bg-gray-100 text-gray-500'

  async function connect() {
    setBusy(true)
    const ok = await data.connectSync(url, token)
    setBusy(false)
    if (ok) setShowForm(false)
  }

  return (
    <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
      {/* ヘッダー（タップで開閉） */}
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <h2 className="text-sm font-semibold text-gray-600">☁️ スプレッドシート同期</h2>
        <span className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusClass}`}>{statusLabel}</span>
          <span className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </span>
      </button>

      {open && connected && !showForm && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>最終同期: {fmtTime(data.syncConfig?.lastSyncAt)}</span>
            {data.pendingCount > 0 && <span className="text-amber-600">未送信 {data.pendingCount} 件</span>}
          </div>
          {data.syncError && <p className="rounded bg-red-50 p-2 text-xs text-red-600">{data.syncError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => data.syncNow()}
              disabled={data.syncStatus === 'syncing'}
              className="flex-1 rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              🔄 今すぐ同期
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600"
            >
              接続先を変更
            </button>
          </div>
          <button
            onClick={() => {
              if (confirm('同期を解除しますか？（この端末のデータは残ります）')) data.disconnectSync()
            }}
            className="w-full text-center text-xs text-gray-400 hover:text-red-500"
          >
            同期を解除する
          </button>
        </div>
      )}

      {open && (!connected || showForm) && (
        <div className="mt-3 space-y-2">
          <p className="text-xs leading-relaxed text-gray-500">
            スプレッドシートの「拡張機能→Apps Script」に受付係のコードを貼り、デプロイして得た
            <b>ウェブアプリURL</b>と<b>合言葉</b>を入力してください。
          </p>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="ウェブアプリURL（https://script.google.com/…/exec）"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex gap-2">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="合言葉（TOKEN）"
              type={showToken ? 'text' : 'password'}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              autoComplete="off"
            />
            <button
              onClick={() => setShowToken((s) => !s)}
              className="rounded-lg border border-gray-200 px-3 text-sm text-gray-500"
              type="button"
            >
              {showToken ? '隠す' : '表示'}
            </button>
          </div>
          {data.syncError && <p className="rounded bg-red-50 p-2 text-xs text-red-600">{data.syncError}</p>}
          <div className="flex gap-2">
            <button
              onClick={connect}
              disabled={busy || !url.trim() || !token.trim()}
              className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? '接続中…' : '接続してテスト'}
            </button>
            {connected && (
              <button onClick={() => setShowForm(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600">
                やめる
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
