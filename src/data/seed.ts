import type { Category, Item, Bucket, Kind } from '../types'

// あなたのCSV「実績管理シート」から抽出した費目・詳細・分類の初期データ。
// アプリ内でいつでも追加・編集できます。

export const CATEGORIES: Category[] = [
  { id: 'income', emoji: '💰', name: '収入' },
  { id: 'house', emoji: '🏠', name: '住宅' },
  { id: 'utility', emoji: '🚰', name: '水道光熱費' },
  { id: 'comm', emoji: '🛜', name: '通信費' },
  { id: 'subsc', emoji: '📱', name: 'サブスク費' },
  { id: 'insurance', emoji: '💊', name: '保険' },
  { id: 'food', emoji: '🍔', name: '食費' },
  { id: 'daily', emoji: '🧹', name: '日用品' },
  { id: 'beauty', emoji: '👕', name: '衣服・美容' },
  { id: 'health', emoji: '🏥', name: '健康・医療' },
  { id: 'car', emoji: '🚙', name: '自動車' },
  { id: 'tax', emoji: '💲', name: '税・社会保障' },
  { id: 'self', emoji: '💪', name: '自己投資' },
  { id: 'fun', emoji: '⛺️', name: '趣味・娯楽' },
  { id: 'furniture', emoji: '📠', name: '家具・家電' },
  { id: 'special', emoji: '❗️', name: '特別な支出' },
  { id: 'invest', emoji: '📈', name: '投資' },
  { id: 'saving', emoji: '🏦', name: '貯金' },
  { id: 'cash', emoji: '💳', name: '現金・カード' },
  { id: 'kousai', emoji: '☕️', name: '交際費' },
]

type Seed = [categoryId: string, name: string, bucket: Bucket, kind: Kind]

const SEED: Seed[] = [
  // ── 収入・予算内（手取りに含める） ──
  ['income', '給料 (ma)', 'income_in', 'income'],
  ['income', '給料 (chi)', 'income_in', 'income'],
  ['income', '副業', 'income_in', 'income'],
  ['income', 'メルカリ', 'income_in', 'income'],
  ['income', '配当金', 'income_in', 'income'],
  ['income', '児童手当・祝金', 'income_in', 'income'],
  // ── 収入・予算外（残業・賞与など。8割ルールの分母から除外） ──
  ['income', '残業代', 'income_out', 'income'],
  ['income', 'ボーナス・保険', 'income_out', 'income'],
  ['income', '太陽光売電', 'income_out', 'income'],

  // ── 敵1：毎月・固定費 ──
  ['house', '住宅ローン', 'teki1', 'expense'],
  ['house', '町内会費', 'teki1', 'expense'],
  ['utility', '電気代', 'teki1', 'expense'],
  ['utility', '水道代', 'teki1', 'expense'],
  ['comm', '格安SIM', 'teki1', 'expense'],
  ['comm', 'コミュファ光', 'teki1', 'expense'],
  ['subsc', 'クロード・ADOBE', 'teki1', 'expense'],
  ['insurance', '生命保険', 'teki1', 'expense'],

  // ── 敵2：毎月・変動費 ──
  ['food', '食費', 'teki2', 'expense'],
  ['daily', '日用品', 'teki2', 'expense'],
  ['beauty', '被服費', 'teki2', 'expense'],
  ['beauty', '美容費(ma・chi)', 'teki2', 'expense'],
  ['health', '医療費(ma)', 'teki2', 'expense'],
  ['health', '医療費(chi)', 'teki2', 'expense'],
  ['health', '保育園料', 'teki2', 'expense'],
  ['car', 'ガソリン', 'teki2', 'expense'],

  // ── 敵3：不定期・固定費 ──
  ['tax', '固定資産税', 'teki3', 'expense'],
  ['tax', 'ふるさと納税', 'teki3', 'expense'],
  ['tax', '住民税', 'teki3', 'expense'],
  ['subsc', 'NHK', 'teki3', 'expense'],
  ['subsc', 'Amazonプライム', 'teki3', 'expense'],
  ['utility', '浄化槽代', 'teki3', 'expense'],
  ['insurance', '火災保険料', 'teki3', 'expense'],
  ['insurance', '自動車保険', 'teki3', 'expense'],
  ['car', '車検費・自動車税', 'teki3', 'expense'],
  ['self', 'リベシティ', 'teki3', 'expense'],

  // ── 敵4：不定期・変動費 ──
  ['fun', '映画', 'teki4', 'expense'],
  ['fun', '娯楽費', 'teki4', 'expense'],
  ['furniture', '家具・家電', 'teki4', 'expense'],
  ['car', '車諸経費', 'teki4', 'expense'],
  ['food', 'コンビニ', 'teki4', 'expense'],
  ['special', '外食', 'teki4', 'expense'],
  ['special', '旅行費', 'teki4', 'expense'],
  ['special', '冠婚葬祭', 'teki4', 'expense'],
  ['special', 'プレゼント・内祝い', 'teki4', 'expense'],
  ['self', '書籍', 'teki4', 'expense'],

  // ── 投資・貯蓄 ──
  ['invest', 'インデックス投資', 'invest', 'saving'],
  ['invest', 'ETF', 'invest', 'saving'],
  ['invest', '高配当株', 'invest', 'saving'],
  ['saving', '貯金', 'saving', 'saving'],

  // ── 過去データ(2024年度)にあった項目 ──
  ['cash', 'お小遣い(ma)', 'teki1', 'expense'],
  ['cash', 'お小遣い(chi)', 'teki1', 'expense'],
  ['kousai', '交際費', 'teki4', 'expense'],
]

export const ITEMS: Item[] = SEED.map(([categoryId, name, bucket, kind], i) => ({
  id: `it_${i}`,
  categoryId,
  name,
  bucket,
  kind,
}))

/** 分類（バケット）の表示情報 */
export const BUCKET_META: Record<Bucket, { label: string; short: string; color: string; kind: Kind }> = {
  income_in: { label: '収入（予算内）', short: '手取り', color: '#2fa26a', kind: 'income' },
  income_out: { label: '収入（予算外）', short: '予算外', color: '#7cc59b', kind: 'income' },
  teki1: { label: '敵1 毎月・固定費', short: '敵1', color: '#d9534f', kind: 'expense' },
  teki2: { label: '敵2 毎月・変動費', short: '敵2', color: '#e8874a', kind: 'expense' },
  teki3: { label: '敵3 不定期・固定費', short: '敵3', color: '#8e6db3', kind: 'expense' },
  teki4: { label: '敵4 不定期・変動費', short: '敵4', color: '#e0b23c', kind: 'expense' },
  invest: { label: '投資', short: '投資', color: '#3d7bd4', kind: 'saving' },
  saving: { label: '貯金', short: '貯金', color: '#4bb3c4', kind: 'saving' },
}

/** 開始月（会計年度の起点）。CSVは 2025/9 開始 */
export const START_YM = '2025-09'
