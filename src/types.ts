// 家計管理アプリのデータ型定義

/** 収支の種類 */
export type Kind = 'income' | 'expense' | 'saving'

/**
 * 分類（あなたのスプレッドシートの「敵1〜4」体系）
 * - income_in  : 収入・予算内（手取りに含める。給料・副業など）
 * - income_out : 収入・予算外（残業・賞与など。8割ルールの分母には入れない）
 * - teki1      : 毎月・固定費
 * - teki2      : 毎月・変動費
 * - teki3      : 不定期・固定費
 * - teki4      : 不定期・変動費
 * - invest     : 投資（インデックス・ETF・高配当株）
 * - saving     : 貯金
 */
export type Bucket =
  | 'income_in'
  | 'income_out'
  | 'teki1'
  | 'teki2'
  | 'teki3'
  | 'teki4'
  | 'invest'
  | 'saving'

/** 費目（大分類。例: 🍔 食費） */
export interface Category {
  id: string
  emoji: string
  name: string // 例: 食費
}

/** 詳細項目（例: 食費 > コンビニ） */
export interface Item {
  id: string
  categoryId: string
  name: string // 詳細名（例: コンビニ）
  bucket: Bucket
  kind: Kind
  archived?: boolean
}

/** 1件の取引（アプリが「取引ログ」に書き込む1行に相当） */
export interface Tx {
  id: string
  date: string // YYYY-MM-DD
  itemId: string
  amount: number // 円（プラスの整数）
  author: 'ma' | 'chi' | string // 入力者
  memo?: string
  createdAt: string // ISO
  auto?: boolean // 定期支出から自動生成された行（実データではなく計算上の仮想行）
  ruleId?: string // 生成元の定期支出ルールID
}

/**
 * 定期支出・定期収入ルール（住宅ローン・保険・サブスク・給料など毎月一定額）
 * 開始月〜（終了月）まで、毎月 amount を自動計上する。
 */
export interface Recurring {
  id: string
  itemId: string
  amount: number
  day: number // 毎月の計上日（1〜28）。日付表示・並び用
  author: 'ma' | 'chi' | string
  startYm: string // YYYY-MM（この月から）
  endYm?: string // YYYY-MM（この月まで。未指定なら無期限）
  active: boolean // 一時停止用
  skips?: string[] // スキップする月（YYYY-MM）
  overrides?: Record<string, number> // 特定月だけ金額変更（YYYY-MM → 金額）
  memo?: string
}

/** 誰が使うか */
export type Author = { id: string; label: string }
