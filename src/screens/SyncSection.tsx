import { useState } from 'react'
import type { DataApi } from '../hooks/useData'
import { WORKER_URL } from '../config'

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
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
    const ok = await data.connectSync(WORKER_URL, password)
    setBusy(false)
    if (ok) {
      setPassword('') // パスワードは保持しない
      setShowForm(false)
    }
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
              再ログイン
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
            <b>ログインパスワード</b>を入力してください。接続先はアプリに組み込み済みです。
            パスワードはこの端末に保存されません（ログイン後は短時間有効なセッションだけを保持します）。
          </p>
          <div className="flex gap-2">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="ログインパスワード"
              type={showPassword ? 'text' : 'password'}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              autoComplete="off"
            />
            <button
              onClick={() => setShowPassword((s) => !s)}
              className="rounded-lg border border-gray-200 px-3 text-sm text-gray-500"
              type="button"
            >
              {showPassword ? '隠す' : '表示'}
            </button>
          </div>
          {data.syncError && <p className="rounded bg-red-50 p-2 text-xs text-red-600">{data.syncError}</p>}
          <div className="flex gap-2">
            <button
              onClick={connect}
              disabled={busy || !password.trim()}
              className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'ログイン中…' : 'ログイン'}
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
