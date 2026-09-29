import { useMemo, useState } from 'react'
import type { DataApi } from '../hooks/useData'
import type { Recurring } from '../types'
import { BUCKET_META } from '../data/seed'
import { formatMonthLabel, formatYen } from '../lib/aggregate'

function currentYm() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function RecurringScreen({ data }: { data: DataApi }) {
  // 開始・終了月の選択肢：昨年〜来年の各1〜12月
  const months = useMemo(() => {
    const y = new Date().getFullYear()
    const ms: string[] = []
    for (let yr = y - 1; yr <= y + 1; yr++) for (let m = 1; m <= 12; m++) ms.push(`${yr}-${String(m).padStart(2, '0')}`)
    return ms
  }, [])
  const itemMap = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items])
  const catMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])

  const [open, setOpen] = useState(false)
  const [itemId, setItemId] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('1')
  const [startYm, setStartYm] = useState(months.includes(currentYm()) ? currentYm() : months[0])
  const [endYm, setEndYm] = useState('')
  const [rAuthor, setRAuthor] = useState(data.author)

  // 毎月・固定費（敵1）＋固定的な項目を候補の上位に
  const candidates = useMemo(
    () => data.items.filter((it) => !it.archived),
    [data.items],
  )

  function resetForm() {
    setItemId('')
    setAmount('')
    setDay('1')
    setEndYm('')
    setOpen(false)
  }

  function add() {
    const n = Number(amount)
    if (!itemId || !n || n <= 0) return
    data.addRecurring({
      itemId,
      amount: n,
      day: Math.min(Math.max(Number(day) || 1, 1), 28),
      author: rAuthor,
      startYm,
      endYm: endYm || undefined,
      active: true,
    })
    resetForm()
  }

  const monthlyTotal = data.recurring
    .filter((r) => r.active)
    .reduce((s, r) => s + (itemMap.get(r.itemId)?.kind === 'income' ? 0 : r.amount), 0)

  return (
    <div className="p-3 pb-24">
      <div className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="text-xs text-gray-400">毎月自動で計上される固定支出の合計</div>
        <div className="tabular mt-1 text-2xl font-bold text-gray-800">{formatYen(monthlyTotal)}</div>
        <p className="mt-1 text-xs text-gray-400">
          住宅ローン・保険・サブスクなど「毎月同じ金額」を登録すると、毎月自動で支出に計上されます。
        </p>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-600">定期支出・定期収入</h2>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-full bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white"
        >
          ＋ 追加
        </button>
      </div>

      {open && (
        <div className="mb-3 space-y-2 rounded-2xl bg-white p-3 shadow-sm">
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
          >
            <option value="">費目を選択…</option>
            {candidates.map((it) => {
              const cat = catMap.get(it.categoryId)
              return (
                <option key={it.id} value={it.id}>
                  {cat?.emoji} {it.name}（{BUCKET_META[it.bucket].short}）
                </option>
              )
            })}
          </select>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="金額"
              className="tabular flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <div className="flex items-center rounded-lg border border-gray-200 px-2">
              <span className="text-xs text-gray-400">毎月</span>
              <input
                inputMode="numeric"
                value={day}
                onChange={(e) => setDay(e.target.value.replace(/[^0-9]/g, ''))}
                className="tabular w-8 py-2 text-center text-sm"
              />
              <span className="text-xs text-gray-400">日</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">開始</label>
            <select
              value={startYm}
              onChange={(e) => setStartYm(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-2 py-2 text-sm"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonthLabel(m)}
                </option>
              ))}
            </select>
            <label className="text-xs text-gray-400">終了</label>
            <select
              value={endYm}
              onChange={(e) => setEndYm(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-2 py-2 text-sm"
            >
              <option value="">なし</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonthLabel(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex overflow-hidden rounded-full bg-gray-100 text-sm">
            {[
              { id: 'ma', label: '夫 (ma)' },
              { id: 'chi', label: '妻 (chi)' },
            ].map((a) => (
              <button
                key={a.id}
                onClick={() => setRAuthor(a.id)}
                className={`flex-1 py-1.5 font-medium ${rAuthor === a.id ? 'bg-brand-500 text-white' : 'text-gray-500'}`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button onClick={add} className="w-full rounded-lg bg-gray-900 py-2 text-sm font-semibold text-white">
            登録する
          </button>
        </div>
      )}

      {data.recurring.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">
          まだ定期支出はありません。<br />「＋ 追加」から住宅ローンなどを登録しましょう。
        </p>
      ) : (
        <ul className="space-y-1.5">
          {data.recurring.map((r) => (
            <RuleRow
              key={r.id}
              rule={r}
              emoji={catMap.get(itemMap.get(r.itemId)?.categoryId ?? '')?.emoji}
              name={itemMap.get(r.itemId)?.name ?? '（削除済み費目）'}
              bucketColor={itemMap.get(r.itemId) ? BUCKET_META[itemMap.get(r.itemId)!.bucket].color : '#999'}
              bucketShort={itemMap.get(r.itemId) ? BUCKET_META[itemMap.get(r.itemId)!.bucket].short : ''}
              onToggle={() => data.updateRecurring({ ...r, active: !r.active })}
              onRemove={() => {
                if (confirm('この定期支出を削除しますか？')) data.removeRecurring(r.id)
              }}
              onEditAmount={(v) => data.updateRecurring({ ...r, amount: v })}
              onUnskip={(m) => data.toggleSkip(r.id, m)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function RuleRow({
  rule,
  emoji,
  name,
  bucketColor,
  bucketShort,
  onToggle,
  onRemove,
  onEditAmount,
  onUnskip,
}: {
  rule: Recurring
  emoji?: string
  name: string
  bucketColor: string
  bucketShort: string
  onToggle: () => void
  onRemove: () => void
  onEditAmount: (v: number) => void
  onUnskip: (ym: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(rule.amount))
  return (
    <li className={`rounded-xl bg-white p-3 shadow-sm ${rule.active ? '' : 'opacity-50'}`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{emoji ?? '🔁'}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-800">{name}</div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span style={{ color: bucketColor }}>{bucketShort}</span>
            <span>毎月{rule.day}日</span>
            <span>{rule.author === 'ma' ? '夫' : rule.author === 'chi' ? '妻' : rule.author}</span>
            <span>
              {formatMonthLabel(rule.startYm)}〜{rule.endYm ? formatMonthLabel(rule.endYm) : ''}
            </span>
          </div>
        </div>
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              inputMode="numeric"
              value={val}
              onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ''))}
              className="tabular w-20 rounded border border-gray-200 px-2 py-1 text-sm"
            />
            <button
              onClick={() => {
                const n = Number(val)
                if (n > 0) onEditAmount(n)
                setEditing(false)
              }}
              className="rounded bg-brand-500 px-2 py-1 text-xs font-semibold text-white"
            >
              OK
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="tabular text-sm font-bold text-gray-800">
            {formatYen(rule.amount)}
          </button>
        )}
      </div>
      {rule.skips && rule.skips.length > 0 && (
        <div className="mt-2 rounded-lg bg-amber-50 p-2">
          <div className="mb-1 text-[11px] font-medium text-amber-700">
            スキップ中の月（タップで解除＝また自動計上されます）
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[...rule.skips].sort().map((m) => (
              <button
                key={m}
                onClick={() => onUnskip(m)}
                className="flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs text-amber-700 shadow-sm"
                title="スキップを解除する"
              >
                {formatMonthLabel(m)}
                <span className="text-amber-400">✕</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center justify-end gap-2 text-xs">
        <button
          onClick={onToggle}
          className={`rounded-full px-2.5 py-1 font-medium ${
            rule.active ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {rule.active ? '有効' : '停止中'}
        </button>
        <button onClick={onRemove} className="rounded-full px-2.5 py-1 text-gray-300 hover:bg-red-50 hover:text-red-500">
          削除
        </button>
      </div>
    </li>
  )
}
