import type { Recurring, Tx } from '../types'

/** YYYY-MM の大小比較（文字列比較でOK） */
function ymInRange(target: string, start: string, end?: string): boolean {
  if (target < start) return false
  if (end && target > end) return false
  return true
}

/** 指定月に、あるルールが計上する金額を返す（対象外なら null） */
export function recurringAmountFor(rule: Recurring, targetYm: string): number | null {
  if (!rule.active) return null
  if (!ymInRange(targetYm, rule.startYm, rule.endYm)) return null
  if (rule.skips?.includes(targetYm)) return null
  const amt = rule.overrides?.[targetYm] ?? rule.amount
  if (!amt || amt <= 0) return null
  return amt
}

/** 1ルール・1月分の仮想取引を作る */
function virtualTx(rule: Recurring, targetYm: string, amount: number): Tx {
  const day = Math.min(Math.max(rule.day || 1, 1), 28)
  const date = `${targetYm}-${String(day).padStart(2, '0')}`
  return {
    id: `auto_${rule.id}_${targetYm}`,
    date,
    itemId: rule.itemId,
    amount,
    author: rule.author,
    memo: rule.memo,
    createdAt: `${date}T00:00:00.000Z`,
    auto: true,
    ruleId: rule.id,
  }
}

/** 今日（ローカル）の YYYY-MM-DD */
function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 定期支出ルール群を、指定した月配列ぶんの仮想取引に展開する。
 * `until`（既定=今日）より後の日付は「指定日がまだ来ていない」ものとして計上しない。
 * これにより未来の月・未来の計上日ぶんが先に入ってしまうのを防ぐ。
 */
export function expandRecurring(rules: Recurring[], months: string[], until: string = todayYmd()): Tx[] {
  const out: Tx[] = []
  for (const rule of rules) {
    for (const m of months) {
      const amt = recurringAmountFor(rule, m)
      if (amt == null) continue
      const tx = virtualTx(rule, m, amt)
      if (tx.date > until) continue // 指定日が未来（今日より後）ならまだ自動計上しない
      out.push(tx)
    }
  }
  return out
}
