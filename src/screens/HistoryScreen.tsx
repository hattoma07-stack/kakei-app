import { useMemo, useState } from 'react'
import type { DataApi } from '../hooks/useData'
import { BUCKET_META } from '../data/seed'
import {
  availableFiscalYears,
  fiscalMonths,
  fiscalYearLabel,
  fiscalYearStartOf,
  formatMonthLabel,
  formatYen,
  ym,
} from '../lib/aggregate'

export default function HistoryScreen({ data }: { data: DataApi }) {
  const fiscalYears = useMemo(() => availableFiscalYears(data.allTxs), [data.allTxs])
  const yearsWithData = useMemo(
    () => new Set(data.allTxs.map((t) => fiscalYearStartOf(t.date))),
    [data.allTxs],
  )
  const [fy, setFy] = useState(() => fiscalYears.find((y) => yearsWithData.has(y)) ?? fiscalYears[0])
  const months = fiscalMonths(fy)
  const [period, setPeriod] = useState<string>('all')
  const yms = useMemo(() => (period === 'all' ? months : [period]), [period, months])

  const itemMap = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items])
  const catMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])

  const rows = useMemo(() => {
    const set = new Set(yms)
    return data.allTxs
      .filter((t) => set.has(ym(t.date)))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt.localeCompare(a.createdAt)))
  }, [data.allTxs, yms])

  const total = rows.reduce((s, t) => {
    const it = itemMap.get(t.itemId)
    if (!it) return s
    return s + (it.kind === 'income' ? t.amount : -t.amount)
  }, 0)

  return (
    <div className="p-3 pb-24">
      <div className="mb-3 flex gap-2">
        <select
          value={fy}
          onChange={(e) => {
            setFy(e.target.value)
            setPeriod('all')
          }}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800"
        >
          {fiscalYears.map((y) => (
            <option key={y} value={y}>
              {fiscalYearLabel(y)}
            </option>
          ))}
        </select>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800"
        >
          <option value="all">年間（すべて）</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {formatMonthLabel(m)}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-2 flex items-center justify-between px-1 text-sm text-gray-500">
        <span>{rows.length} 件</span>
        <span className="tabular">
          月間収支 <b className={total >= 0 ? 'text-brand-600' : 'text-red-500'}>{formatYen(total)}</b>
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">この月の記録はまだありません</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((t) => {
            const it = itemMap.get(t.itemId)
            const cat = it ? catMap.get(it.categoryId) : undefined
            const meta = it ? BUCKET_META[it.bucket] : undefined
            const isIncome = it?.kind === 'income'
            return (
              <li key={t.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
                <span className="text-2xl">{cat?.emoji ?? '❓'}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800">{it?.name ?? '（削除済み費目）'}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{t.date.slice(5).replace('-', '/')}</span>
                    <span>{t.author === 'ma' ? '夫' : t.author === 'chi' ? '妻' : t.author}</span>
                    {meta && <span style={{ color: meta.color }}>{meta.short}</span>}
                    {t.auto && <span className="rounded bg-blue-50 px-1 text-[10px] text-blue-500">🔁自動</span>}
                    {t.memo && <span className="truncate">📝{t.memo}</span>}
                  </div>
                </div>
                <span className={`tabular text-sm font-bold ${isIncome ? 'text-brand-600' : 'text-gray-800'}`}>
                  {isIncome ? '+' : '−'}
                  {formatYen(t.amount)}
                </span>
                {t.auto ? (
                  <button
                    onClick={() => {
                      if (t.ruleId && confirm('この月の自動計上をスキップしますか？（定期支出の設定は残ります）'))
                        data.toggleSkip(t.ruleId, ym(t.date))
                    }}
                    className="ml-1 rounded-lg px-2 py-1 text-xs text-gray-300 hover:bg-amber-50 hover:text-amber-600"
                    title="この月だけスキップ"
                  >
                    停
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (confirm('この記録を削除しますか？')) data.removeTx(t.id)
                    }}
                    className="ml-1 rounded-lg px-2 py-1 text-xs text-gray-300 hover:bg-red-50 hover:text-red-500"
                  >
                    ✕
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
