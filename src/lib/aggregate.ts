import type { Item, Tx, Bucket } from '../types'
import { START_YM } from '../data/seed'

/** YYYY-MM を取り出す */
export function ym(date: string): string {
  return date.slice(0, 7)
}

/** 会計年度（START_YM 起点）の12ヶ月分の YYYY-MM 配列 */
export function fiscalMonths(startYm: string = START_YM): string[] {
  const [y, m] = startYm.split('-').map(Number)
  const out: string[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(y, m - 1 + i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

/** ある日付が属する年（暦年）の開始月（YYYY-01）を返す。1月〜12月で1年 */
export function fiscalYearStartOf(date: string): string {
  return `${date.slice(0, 4)}-01`
}

/** 年の表示名（例: 2024-01 → 2024年） */
export function fiscalYearLabel(startYm: string): string {
  return `${startYm.slice(0, 4)}年`
}

/** 取引データに含まれる会計年度（開始月）の一覧＋当年度を、新しい順で返す */
export function availableFiscalYears(txs: { date: string }[]): string[] {
  const set = new Set<string>()
  for (const t of txs) set.add(fiscalYearStartOf(t.date))
  set.add(fiscalYearStartOf(new Date().toISOString()))
  return [...set].sort((a, b) => (a < b ? 1 : -1))
}

export function formatYen(n: number): string {
  return '¥' + Math.round(n).toLocaleString('ja-JP')
}

export function formatMonthLabel(ymStr: string): string {
  const [y, m] = ymStr.split('-')
  return `${y}/${Number(m)}`
}

export interface MonthSummary {
  ym: string
  byBucket: Record<Bucket, number>
  income: number // 予算内＋予算外の全収入
  takeHome: number // 手取り（予算内収入のみ）＝ 8割ルールの分母
  expense: number // 敵1〜4 の合計
  invest: number // 投資（手入力）
  saving: number // 貯金（自動算出）＝ 収入 − 支出 − 投資
  investSaving: number // 投資 + 貯金
  expenseRatio: number // 支出 ÷ 手取り
  savingRatio: number // (投資 + 貯金) ÷ 収入合計
  within80: boolean // 支出が手取りの8割以内か
}

const ZERO_BUCKETS = (): Record<Bucket, number> => ({
  income_in: 0,
  income_out: 0,
  teki1: 0,
  teki2: 0,
  teki3: 0,
  teki4: 0,
  invest: 0,
  saving: 0,
})

const EXPENSE_BUCKETS: Bucket[] = ['teki1', 'teki2', 'teki3', 'teki4']

/** バケット別合計から各種指標を組み立てる（貯金は自動算出） */
function buildSummary(ymLabel: string, byBucket: Record<Bucket, number>): MonthSummary {
  const takeHome = byBucket.income_in
  const income = byBucket.income_in + byBucket.income_out
  const expense = EXPENSE_BUCKETS.reduce((s, b) => s + byBucket[b], 0)
  const invest = byBucket.invest
  // 貯金は「収入 − 支出 − 投資」で自動算出（手入力しない。赤字ならマイナス）
  const saving = income - expense - invest
  const investSaving = invest + saving
  const expenseRatio = takeHome > 0 ? expense / takeHome : 0
  const savingRatio = income > 0 ? investSaving / income : 0

  return {
    ym: ymLabel,
    byBucket,
    income,
    takeHome,
    expense,
    invest,
    saving,
    investSaving,
    expenseRatio,
    savingRatio,
    within80: takeHome > 0 ? expense <= takeHome * 0.8 : true,
  }
}

/** 複数月（期間）のサマリを計算。targetYms に含まれる月を合算 */
export function summarizePeriod(txs: Tx[], items: Item[], targetYms: string[]): MonthSummary {
  const itemMap = new Map(items.map((it) => [it.id, it]))
  const ymSet = new Set(targetYms)
  const byBucket = ZERO_BUCKETS()

  for (const tx of txs) {
    if (!ymSet.has(ym(tx.date))) continue
    const it = itemMap.get(tx.itemId)
    if (!it) continue
    byBucket[it.bucket] += tx.amount
  }

  return buildSummary(targetYms.length === 1 ? targetYms[0] : 'period', byBucket)
}

/** 指定月のサマリを計算 */
export function summarizeMonth(txs: Tx[], items: Item[], targetYm: string): MonthSummary {
  const itemMap = new Map(items.map((it) => [it.id, it]))
  const byBucket = ZERO_BUCKETS()

  for (const tx of txs) {
    if (ym(tx.date) !== targetYm) continue
    const it = itemMap.get(tx.itemId)
    if (!it) continue
    byBucket[it.bucket] += tx.amount
  }

  return buildSummary(targetYm, byBucket)
}

/** 会計年度12ヶ月分のサマリ */
export function summarizeYear(txs: Tx[], items: Item[], startYm: string = START_YM): MonthSummary[] {
  return fiscalMonths(startYm).map((m) => summarizeMonth(txs, items, m))
}

export interface CategoryTotal {
  id: string
  emoji: string
  name: string
  amount: number
}

/** 期間内の支出（敵1〜4）を費目（大分類）別に合計し、多い順に返す */
export function expenseByCategory(
  txs: Tx[],
  items: Item[],
  categories: { id: string; emoji: string; name: string }[],
  targetYms: string[],
): CategoryTotal[] {
  const ymSet = new Set(targetYms)
  const itemMap = new Map(items.map((i) => [i.id, i]))
  const catMap = new Map(categories.map((c) => [c.id, c]))
  const totals = new Map<string, number>()
  for (const t of txs) {
    if (!ymSet.has(ym(t.date))) continue
    const it = itemMap.get(t.itemId)
    if (!it || !EXPENSE_BUCKETS.includes(it.bucket)) continue
    totals.set(it.categoryId, (totals.get(it.categoryId) ?? 0) + t.amount)
  }
  return [...totals.entries()]
    .map(([id, amount]) => {
      const c = catMap.get(id)
      return { id, emoji: c?.emoji ?? '', name: c?.name ?? id, amount }
    })
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)
}
