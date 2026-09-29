import { useMemo, useState } from 'react'
import type { DataApi } from '../hooks/useData'
import type { Bucket } from '../types'
import { BUCKET_META } from '../data/seed'
import {
  availableFiscalYears,
  expenseByCategory,
  fiscalMonths,
  fiscalYearLabel,
  fiscalYearStartOf,
  formatMonthLabel,
  formatYen,
  summarizePeriod,
  summarizeYear,
} from '../lib/aggregate'
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const EXPENSE_BUCKETS: Bucket[] = ['teki1', 'teki2', 'teki3', 'teki4']
const CAT_COLORS = ['#d9534f', '#e8874a', '#e0b23c', '#5aa469', '#3d7bd4', '#8e6db3', '#4bb3c4', '#c96b9a', '#7a8b99', '#b07a4a', '#5c9e7e', '#d08770']

export default function DashboardScreen({ data }: { data: DataApi }) {
  const fiscalYears = useMemo(() => availableFiscalYears(data.allTxs), [data.allTxs])
  const yearsWithData = useMemo(
    () => new Set(data.allTxs.map((t) => fiscalYearStartOf(t.date))),
    [data.allTxs],
  )
  const [fy, setFy] = useState(() => fiscalYears.find((y) => yearsWithData.has(y)) ?? fiscalYears[0])
  // period: 'all'（年間）または 'YYYY-MM'
  const [period, setPeriod] = useState<string>('all')
  const [catOpen, setCatOpen] = useState(false)

  const months = fiscalMonths(fy)
  const yms = period === 'all' ? months : [period]
  const isYear = period === 'all'
  const periodLabel = isYear ? `${fiscalYearLabel(fy)}（年間）` : formatMonthLabel(period)

  const summary = useMemo(
    () => summarizePeriod(data.allTxs, data.items, yms),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.allTxs, data.items, yms.join(',')],
  )
  const year = useMemo(
    () => summarizeYear(data.allTxs, data.items, fy),
    [data.allTxs, data.items, fy],
  )
  const catTotals = useMemo(
    () => expenseByCategory(data.allTxs, data.items, data.categories, yms),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.allTxs, data.items, data.categories, yms.join(',')],
  )
  const catMax = catTotals.length ? catTotals[0].amount : 0

  const expensePie = EXPENSE_BUCKETS.map((b) => ({
    short: BUCKET_META[b].short,
    value: summary.byBucket[b],
    color: BUCKET_META[b].color,
  })).filter((d) => d.value > 0)

  const trend = year.map((m) => ({
    name: formatMonthLabel(m.ym),
    収入: m.takeHome,
    支出: m.expense,
    投資: m.invest,
    貯金: m.saving,
  }))

  const ratioPct = Math.round(summary.expenseRatio * 100)
  const barColor = summary.within80 ? '#2fa26a' : '#d9534f'

  return (
    <div className="p-3 pb-24 space-y-3">
      {/* 年・期間セレクタ（プルダウン） */}
      <div className="flex gap-2">
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

      {/* 8割ルール判定カード */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-600">支出は手取りの8割以内？</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              summary.within80 ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-600'
            }`}
          >
            {summary.takeHome === 0 ? '—' : summary.within80 ? '✅ 達成' : '⚠️ オーバー'}
          </span>
        </div>
        <div className="mt-1 text-xs text-gray-400">{periodLabel}</div>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <div className="text-xs text-gray-400">手取り（予算内収入）</div>
            <div className="tabular text-lg font-bold text-gray-800">{formatYen(summary.takeHome)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">支出</div>
            <div className="tabular text-lg font-bold" style={{ color: barColor }}>
              {formatYen(summary.expense)}
            </div>
          </div>
        </div>
        <div className="relative mt-3 h-4 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(ratioPct, 100)}%`, backgroundColor: barColor }}
          />
          <div className="absolute inset-y-0" style={{ left: '80%' }}>
            <div className="h-full w-0.5 bg-gray-800/60" />
          </div>
        </div>
        <div className="mt-1 flex justify-between text-xs text-gray-400">
          <span>支出率 {summary.takeHome === 0 ? '—' : `${ratioPct}%`}</span>
          <span>目標ライン 80%</span>
        </div>
      </div>

      {/* サマリ数値 */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="収入合計" value={formatYen(summary.income)} accent="#2fa26a" />
        <StatCard label="支出合計" value={formatYen(summary.expense)} accent="#e8874a" />
        <StatCard label="投資" value={formatYen(summary.invest)} accent="#3d7bd4" />
        <StatCard
          label="貯金（自動）"
          value={formatYen(summary.saving)}
          accent={summary.saving < 0 ? '#d9534f' : '#2fa26a'}
          sub={summary.income === 0 ? '収入 − 支出 − 投資' : `貯蓄率 ${Math.round(summary.savingRatio * 100)}%`}
        />
      </div>

      {/* 費目別の内訳（ランキング・折りたたみ） */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <button
          onClick={() => setCatOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left"
        >
          <h2 className="text-sm font-semibold text-gray-600">費目別の内訳</h2>
          <span className="flex items-center gap-2 text-xs text-gray-400">
            {!catOpen && catTotals.length > 0 && (
              <span>
                {catTotals[0].emoji}
                {catTotals[0].name}ほか{catTotals.length}件
              </span>
            )}
            <span className={`transition-transform ${catOpen ? 'rotate-180' : ''}`}>▾</span>
          </span>
        </button>
        {catOpen &&
          (catTotals.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">この期間の支出データはまだありません</p>
          ) : (
            <div className="mt-3 space-y-2.5">
            {catTotals.map((c, i) => (
              <div key={c.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-gray-700">
                    <span className="text-base">{c.emoji}</span>
                    {c.name}
                  </span>
                  <span className="tabular font-medium text-gray-800">
                    {formatYen(c.amount)}
                    <span className="ml-1 text-xs text-gray-400">
                      {summary.expense > 0 ? Math.round((c.amount / summary.expense) * 100) : 0}%
                    </span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${catMax ? (c.amount / catMax) * 100 : 0}%`, backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }}
                  />
                </div>
              </div>
            ))}
            </div>
          ))}
      </div>

      {/* 敵1〜4 内訳 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-600">敵1〜4の内訳</h2>
        {expensePie.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">この期間の支出データはまだありません</p>
        ) : (
          <div className="flex items-center">
            <div className="shrink-0" style={{ width: 160, height: 180 }}>
              <PieChart width={160} height={180}>
                <Pie
                  data={expensePie}
                  dataKey="value"
                  nameKey="short"
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={74}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {expensePie.map((d) => (
                    <Cell key={d.short} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatYen(v)} />
              </PieChart>
            </div>
            <div className="flex-1 space-y-1.5">
              {EXPENSE_BUCKETS.map((b) => (
                <div key={b} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: BUCKET_META[b].color }} />
                    <span className="text-gray-600">{BUCKET_META[b].short}</span>
                  </span>
                  <span className="tabular font-medium text-gray-800">{formatYen(summary.byBucket[b])}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 年間推移 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-600">{fiscalYearLabel(fy)}の月別推移</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trend} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={40} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 10000 ? `${v / 10000}万` : `${v}`)} />
            <Tooltip formatter={(v: number) => formatYen(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="収入" fill="#2fa26a" radius={[3, 3, 0, 0]} />
            <Bar dataKey="支出" fill="#e8874a" radius={[3, 3, 0, 0]} />
            <Bar dataKey="投資" fill="#3d7bd4" radius={[3, 3, 0, 0]} />
            <Bar dataKey="貯金" fill="#4bb3c4" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function StatCard({ label, value, accent, sub }: { label: string; value: string; accent: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="tabular mt-1 text-base font-bold" style={{ color: accent }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>}
    </div>
  )
}
