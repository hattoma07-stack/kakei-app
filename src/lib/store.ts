import type { Category, Item, Tx, Recurring } from '../types'
import { CATEGORIES, ITEMS } from '../data/seed'

// ───────────────────────────────────────────────────────────
// データ保存層
// 今は localStorage に保存します。あとで同じインターフェイスのまま
// Google スプレッドシート接続版に差し替えられるように分離しています。
// ───────────────────────────────────────────────────────────

const KEYS = {
  tx: 'kakei.tx.v1',
  items: 'kakei.items.v1',
  categories: 'kakei.categories.v1',
  author: 'kakei.author.v1',
  recurring: 'kakei.recurring.v1',
  sync: 'kakei.sync.v1',
  pending: 'kakei.pending.v1',
  pins: 'kakei.pins.v1',
}

/**
 * 同期設定。
 * url     : Cloudflare Worker（自社バックエンド）のURL
 * session : ログインで得た短命セッション（秘密ではない。合言葉はブラウザに保存しない）
 */
export interface SyncConfig {
  url: string
  session?: string
  lastSyncAt?: string
}

/** サーバーへまだ送れていない操作（オフライン時などに貯める） */
export interface PendingOp {
  opId: string
  kind: 'tx' | 'recurring' | 'item'
  action: 'upsert' | 'delete'
  row: Record<string, unknown>
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ストレージが使えない環境（プライベートブラウズ等）では黙って無視 */
  }
}

export const store = {
  // ── 取引 ──
  getTx(): Tx[] {
    return read<Tx[]>(KEYS.tx, [])
  },
  setTx(txs: Tx[]) {
    write(KEYS.tx, txs)
  },
  addTx(tx: Tx) {
    const all = store.getTx()
    all.push(tx)
    store.setTx(all)
  },
  updateTx(tx: Tx) {
    const all = store.getTx().map((t) => (t.id === tx.id ? tx : t))
    store.setTx(all)
  },
  removeTx(id: string) {
    store.setTx(store.getTx().filter((t) => t.id !== id))
  },

  // ── 費目・詳細（初回はシードを使用） ──
  getCategories(): Category[] {
    return read<Category[]>(KEYS.categories, CATEGORIES)
  },
  setCategories(cats: Category[]) {
    write(KEYS.categories, cats)
  },
  getItems(): Item[] {
    return read<Item[]>(KEYS.items, ITEMS)
  },
  setItems(items: Item[]) {
    write(KEYS.items, items)
  },

  // ── 定期支出・定期収入 ──
  getRecurring(): Recurring[] {
    return read<Recurring[]>(KEYS.recurring, [])
  },
  setRecurring(rules: Recurring[]) {
    write(KEYS.recurring, rules)
  },

  // ── 入力者 ──
  getAuthor(): string {
    return read<string>(KEYS.author, 'ma')
  },
  setAuthor(a: string) {
    write(KEYS.author, a)
  },

  // ── 同期設定 ──
  getSync(): SyncConfig | null {
    return read<SyncConfig | null>(KEYS.sync, null)
  },
  setSync(cfg: SyncConfig | null) {
    write(KEYS.sync, cfg)
  },

  // ── 保留中の操作キュー ──
  getPending(): PendingOp[] {
    return read<PendingOp[]>(KEYS.pending, [])
  },
  setPending(ops: PendingOp[]) {
    write(KEYS.pending, ops)
  },

  // ── よく使う費目のピン留め（この端末の設定） ──
  getPins(): string[] {
    return read<string[]>(KEYS.pins, [])
  },
  setPins(ids: string[]) {
    write(KEYS.pins, ids)
  },
}

/** 簡易ID生成 */
export function uid(prefix = 'tx'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}
