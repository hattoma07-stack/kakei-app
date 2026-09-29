import { useMemo, useState } from 'react'
import type { DataApi } from '../hooks/useData'
import type { Bucket, Item } from '../types'
import { BUCKET_META } from '../data/seed'
import { formatYen } from '../lib/aggregate'
import { topItems } from '../lib/frequent'

const KIND_TABS: { key: 'expense' | 'income' | 'saving'; label: string }[] = [
  { key: 'expense', label: '支出' },
  { key: 'income', label: '収入' },
  { key: 'saving', label: '投資' },
]

// プルダウンで表示する分類の順番（種類ごと）
// 貯金は「収入 − 支出 − 投資」で自動算出するため、手入力の対象からは外す
const BUCKETS_BY_KIND: Record<'expense' | 'income' | 'saving', Bucket[]> = {
  expense: ['teki1', 'teki2', 'teki3', 'teki4'],
  income: ['income_in', 'income_out'],
  saving: ['invest'],
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function InputScreen({ data }: { data: DataApi }) {
  const [kind, setKind] = useState<'expense' | 'income' | 'saving'>('expense')
  const [selected, setSelected] = useState<Item | null>(null)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [memo, setMemo] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [editPins, setEditPins] = useState(false)
  const [pickBucket, setPickBucket] = useState<Bucket | ''>('')
  const [showOther, setShowOther] = useState(false)

  const catMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])
  const pinSet = useMemo(() => new Set(data.pins), [data.pins])

  // よく使う上位6件（ピン優先＋入力回数が多い順）
  // 手入力対象のバケットに限定（例：投資タブに旧「貯金」費目を出さない）
  const top6 = useMemo(() => {
    const allowed = new Set<Bucket>(BUCKETS_BY_KIND[kind])
    const items = data.items.filter((it) => allowed.has(it.bucket))
    return topItems(items, data.txs, kind, data.pins, 6)
  }, [data.items, data.txs, kind, data.pins])

  // 編集モードで一覧表示する、この種類の全費目
  const itemsForKind = useMemo(
    () => data.items.filter((it) => it.kind === kind && !it.archived),
    [data.items, kind],
  )

  // プルダウン用：分類ごとの費目（上位6は末尾に「よく使う」印だけ付けて残す）
  const grouped = useMemo(() => {
    const buckets = BUCKETS_BY_KIND[kind]
    return buckets.map((b) => ({
      bucket: b,
      items: data.items.filter((it) => it.bucket === b && !it.archived),
    }))
  }, [data.items, kind])

  function pressKey(k: string) {
    if (k === '←') setAmount((a) => a.slice(0, -1))
    else if (k === '00') setAmount((a) => (a === '' ? '' : a + '00'))
    else
      setAmount((a) => {
        const next = (a + k).replace(/^0+(?=\d)/, '')
        return next.length > 9 ? a : next
      })
  }

  function save() {
    if (!selected) return showToast('費目を選んでください')
    const n = Number(amount)
    if (!n || n <= 0) return showToast('金額を入力してください')
    data.addTx({ date, itemId: selected.id, amount: n, author: data.author, memo: memo.trim() || undefined })
    showToast(`${selected.name} ${formatYen(n)} を記録しました`)
    setAmount('')
    setMemo('')
  }

  function showToast(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 1800)
  }

  function changeKind(k: 'expense' | 'income' | 'saving') {
    setKind(k)
    setSelected(null)
    setPickBucket('')
  }

  return (
    <div className="flex h-[calc(100dvh-112px)] flex-col">
      {/* 上部：入力者・日付・種類（固定） */}
      <div className="shrink-0 space-y-2 p-3">
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-full bg-white shadow-sm">
            {[
              { id: 'ma', label: '夫 (ma)' },
              { id: 'chi', label: '妻 (chi)' },
            ].map((a) => (
              <button
                key={a.id}
                onClick={() => data.setAuthor(a.id)}
                className={`px-4 py-2 text-sm font-medium ${
                  data.author === a.id ? 'bg-brand-500 text-white' : 'text-gray-600'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="tabular ml-auto rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          {KIND_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => changeKind(t.key)}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold ${
                kind === t.key ? 'bg-gray-900 text-white' : 'bg-white text-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 中央：よく使う上位6 ＋ その他プルダウン（スクロール） */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        <div className="mb-1 flex items-center justify-between text-xs font-semibold text-gray-400">
          <span>⭐️ よく使う</span>
          <button onClick={() => setEditPins((e) => !e)} className="text-brand-600">
            {editPins ? '完了' : '✎ 編集'}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {top6.map((it) => {
            const cat = catMap.get(it.categoryId)
            const active = selected?.id === it.id
            const meta = BUCKET_META[it.bucket]
            const pinned = pinSet.has(it.id)
            return (
              <button
                key={it.id}
                onClick={() => (editPins ? data.togglePin(it.id) : setSelected(it))}
                className={`relative flex flex-col items-center justify-center rounded-2xl border p-2 text-center transition ${
                  active && !editPins ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500' : 'border-gray-100 bg-white'
                }`}
                style={{ minHeight: 78 }}
              >
                {editPins && (
                  <span className="absolute right-1 top-1 text-xs">{pinned ? '📌' : '☆'}</span>
                )}
                <span className="text-2xl leading-none">{cat?.emoji}</span>
                <span className="mt-1 text-[11px] font-medium leading-tight text-gray-700">{it.name}</span>
                <span className="mt-0.5 text-[9px]" style={{ color: meta.color }}>
                  {meta.short}
                </span>
              </button>
            )
          })}
        </div>

        {/* 編集モード：全費目からピン留めを選ぶ */}
        {editPins && (
          <div className="mt-3 rounded-2xl bg-white p-3 shadow-sm">
            <p className="mb-2 text-xs text-gray-500">📌をタップして「よく使う」に固定／解除できます</p>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {itemsForKind.map((it) => {
                const cat = catMap.get(it.categoryId)
                const pinned = pinSet.has(it.id)
                return (
                  <button
                    key={it.id}
                    onClick={() => data.togglePin(it.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-gray-50"
                  >
                    <span className="text-lg">{cat?.emoji}</span>
                    <span className="flex-1 text-gray-700">{it.name}</span>
                    <span className="text-base">{pinned ? '📌' : '☆'}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* その他の費目：初期は閉じ、押すと分類が出るアコーディオン */}
        <button
          onClick={() => setShowOther((o) => !o)}
          className="mb-2 mt-4 flex w-full items-center gap-1 text-xs font-semibold text-gray-400"
        >
          <span>📂 その他の費目から選ぶ</span>
          <span className={`transition-transform ${showOther ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {showOther && (
        <div className="space-y-2">
          {BUCKETS_BY_KIND[kind].map((b) => {
            const opened = pickBucket === b
            const bItems = grouped.find((g) => g.bucket === b)?.items ?? []
            return (
              <div key={b} className="overflow-hidden rounded-xl border border-gray-100 bg-white">
                <button
                  onClick={() => setPickBucket(opened ? '' : b)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm"
                >
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: BUCKET_META[b].color }} />
                  <span className="font-medium text-gray-700">{BUCKET_META[b].label}</span>
                  <span className="text-xs text-gray-300">{bItems.length}件</span>
                  <span className={`ml-auto text-gray-400 transition-transform ${opened ? 'rotate-180' : ''}`}>▾</span>
                </button>
                {opened && (
                  <div className="grid grid-cols-3 gap-2 border-t border-gray-50 p-2">
                    {bItems.map((it) => {
                      const cat = catMap.get(it.categoryId)
                      const active = selected?.id === it.id
                      return (
                        <button
                          key={it.id}
                          onClick={() => setSelected(it)}
                          className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center ${
                            active ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500' : 'border-gray-100 bg-gray-50'
                          }`}
                          style={{ minHeight: 64 }}
                        >
                          <span className="text-xl leading-none">{cat?.emoji}</span>
                          <span className="mt-1 text-[11px] font-medium leading-tight text-gray-700">{it.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        )}

        <div className="h-2" />
      </div>

      {/* 下部：金額・テンキー・保存（固定） */}
      <div className="shrink-0 border-t border-gray-200 bg-white p-2.5">
        <div className="mb-2 flex items-center gap-2">
          <span className="truncate text-sm text-gray-500">
            {selected ? `${catMap.get(selected.categoryId)?.emoji} ${selected.name}` : '費目を選択'}
          </span>
          <span className="tabular ml-auto text-2xl font-bold text-gray-900">
            {amount === '' ? '¥0' : formatYen(Number(amount))}
          </span>
        </div>
        <input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="メモ（任意）"
          className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        />
        <div className="grid grid-cols-3 gap-1.5">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '00', '←'].map((k) => (
            <button
              key={k}
              onClick={() => pressKey(k)}
              className="rounded-xl bg-gray-50 py-2.5 text-lg font-semibold text-gray-800 active:bg-gray-200"
            >
              {k}
            </button>
          ))}
        </div>
        <button
          onClick={save}
          className="mt-1.5 w-full rounded-xl bg-brand-500 py-2.5 text-base font-bold text-white active:bg-brand-600"
        >
          記録する
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-gray-900/90 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
