import { useMemo, useState } from 'react'
import type { DataApi } from '../hooks/useData'
import type { Bucket, Kind } from '../types'
import { BUCKET_META } from '../data/seed'
import SyncSection from './SyncSection'

const BUCKET_ORDER: Bucket[] = ['income_in', 'income_out', 'teki1', 'teki2', 'teki3', 'teki4', 'invest', 'saving']

export default function SettingsScreen({ data }: { data: DataApi }) {
  const catMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState(data.categories[0]?.id ?? '')
  const [bucket, setBucket] = useState<Bucket>('teki2')
  const [openBuckets, setOpenBuckets] = useState<Set<Bucket>>(new Set())
  const toggleBucket = (b: Bucket) =>
    setOpenBuckets((prev) => {
      const next = new Set(prev)
      next.has(b) ? next.delete(b) : next.add(b)
      return next
    })

  const grouped = useMemo(() => {
    const g: Record<Bucket, typeof data.items> = {
      income_in: [], income_out: [], teki1: [], teki2: [], teki3: [], teki4: [], invest: [], saving: [],
    }
    for (const it of data.items) g[it.bucket].push(it)
    return g
  }, [data.items])

  function addItem() {
    if (!name.trim() || !categoryId) return
    const kind: Kind = BUCKET_META[bucket].kind
    data.addItem({ name: name.trim(), categoryId, bucket, kind })
    setName('')
    setOpen(false)
  }

  return (
    <div className="p-3 pb-24">
      <SyncSection data={data} />

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-600">費目・分類の管理</h2>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-full bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white"
        >
          ＋ 費目を追加
        </button>
      </div>

      {open && (
        <div className="mb-3 space-y-2 rounded-2xl bg-white p-3 shadow-sm">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="詳細名（例: サブスク○○）"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-2 py-2 text-sm"
            >
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value as Bucket)}
              className="flex-1 rounded-lg border border-gray-200 px-2 py-2 text-sm"
            >
              {BUCKET_ORDER.map((b) => (
                <option key={b} value={b}>
                  {BUCKET_META[b].label}
                </option>
              ))}
            </select>
          </div>
          <button onClick={addItem} className="w-full rounded-lg bg-gray-900 py-2 text-sm font-semibold text-white">
            追加する
          </button>
        </div>
      )}

      <div className="space-y-2">
        {BUCKET_ORDER.map((b) => (
          <div key={b} className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <button
              onClick={() => toggleBucket(b)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
            >
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: BUCKET_META[b].color }} />
              <span className="text-xs font-semibold text-gray-600">{BUCKET_META[b].label}</span>
              <span className="text-xs text-gray-300">{grouped[b].length}件</span>
              <span className={`ml-auto text-gray-400 transition-transform ${openBuckets.has(b) ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {openBuckets.has(b) && (
              <div className="border-t border-gray-50">
                {grouped[b].length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-300">なし</div>
                ) : (
                  grouped[b].map((it) => {
                  const cat = catMap.get(it.categoryId)
                  return (
                    <div key={it.id} className="flex items-center gap-2 border-b border-gray-50 px-3 py-2 last:border-0">
                      <span className="text-lg">{cat?.emoji}</span>
                      <span className="flex-1 text-sm text-gray-700">{it.name}</span>
                      <span className="text-xs text-gray-300">{cat?.name}</span>
                      <button
                        onClick={() => {
                          if (confirm(`「${it.name}」を削除しますか？（過去の記録は残ります）`)) data.removeItem(it.id)
                        }}
                        className="rounded px-2 py-0.5 text-xs text-gray-300 hover:bg-red-50 hover:text-red-500"
                      >
                        削除
                      </button>
                    </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 px-1 text-center text-xs text-gray-400">
        {data.syncConfig
          ? 'データはスプレッドシートと同期されています。'
          : 'データはこの端末内に保存されています。上の「スプレッドシート同期」で2人共有にできます。'}
      </p>
    </div>
  )
}
