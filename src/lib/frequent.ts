import type { Item, Tx, Kind } from '../types'

/**
 * 入力画面の「よく使う」順を決めるための初期優先度。
 * 履歴がまだ少ないうちに、変動費のよく使う費目を上位に出す。
 * 数字が小さいほど上位。
 */
const DEFAULT_PRIORITY: Record<string, number> = {
  食費: 1,
  コンビニ: 2,
  日用品: 3,
  外食: 4,
  ガソリン: 5,
  娯楽費: 6,
  被服費: 7,
  '医療費(ma)': 8,
  '医療費(chi)': 9,
  '美容費(ma・chi)': 10,
  // 収入
  '給料 (ma)': 1,
  '給料 (chi)': 2,
  副業: 3,
  // 投資・貯金
  貯金: 1,
  インデックス投資: 2,
}

/** 手入力の取引から、費目ごとの入力回数を数える（自動計上ぶんは除く） */
export function countByItem(txs: Tx[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of txs) {
    if (t.auto) continue
    m.set(t.itemId, (m.get(t.itemId) ?? 0) + 1)
  }
  return m
}

/**
 * 指定した種類（支出/収入/投資貯金）で「よく使う」上位を返す。
 * ピン留めした費目を先頭（ピンした順）に固定し、残りを
 * 入力回数が多い順 → 初期優先度 → 元の並び順 で埋める。
 */
export function topItems(items: Item[], txs: Tx[], kind: Kind, pins: string[] = [], n = 6): Item[] {
  const counts = countByItem(txs)
  const indexOf = new Map(items.map((it, i) => [it.id, i]))
  const ofKind = items.filter((it) => it.kind === kind && !it.archived)

  // ピン留め（この種類のもの）をピンした順に
  const pinned = pins
    .map((id) => ofKind.find((it) => it.id === id))
    .filter((it): it is Item => !!it)
  const pinnedSet = new Set(pinned.map((it) => it.id))

  // 残りを頻度順に
  const rest = ofKind
    .filter((it) => !pinnedSet.has(it.id))
    .sort((a, b) => {
      const ca = counts.get(a.id) ?? 0
      const cb = counts.get(b.id) ?? 0
      if (cb !== ca) return cb - ca
      const pa = DEFAULT_PRIORITY[a.name] ?? 999
      const pb = DEFAULT_PRIORITY[b.name] ?? 999
      if (pa !== pb) return pa - pb
      return (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0)
    })

  // ピンは全部見せる。残りで n 件まで埋める（最低でもピン数）
  return [...pinned, ...rest].slice(0, Math.max(n, pinned.length))
}
