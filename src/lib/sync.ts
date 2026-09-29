import type { Category, Item, Recurring, Tx } from '../types'
import { store, type PendingOp, type SyncConfig } from './store'
import { BUCKET_META } from '../data/seed'

// ───────────────────────────────────────────────────────────
// 同期（Cloudflare Worker = 自社バックエンド経由）
//
//   ブラウザ → Worker → Apps Script → スプレッドシート
//
//   ・合言葉(GASの秘密)はブラウザに持たない。Worker の Secrets だけが持つ。
//   ・ブラウザは /login でパスワードを送り、短命セッションを受け取る。
//   ・以降 /pull・/flush はセッション(Bearer)で認証。Worker が CORS を返すので
//     通常の fetch + JSON で読み書きできる（JSONP は不要）。
// ───────────────────────────────────────────────────────────

export interface PullResult {
  tx: Tx[]
  recurring: Recurring[]
  items: Item[]
}

// ── 送信用の行オブジェクト（シートで読みやすいよう費目名なども付ける） ──
export function txToRow(tx: Tx, items: Item[], cats: Category[]): Record<string, unknown> {
  const it = items.find((i) => i.id === tx.itemId)
  const cat = it ? cats.find((c) => c.id === it.categoryId) : undefined
  return {
    id: tx.id, date: tx.date, itemId: tx.itemId,
    catEmoji: cat?.emoji ?? '', catName: cat?.name ?? '', itemName: it?.name ?? '',
    bucket: it ? BUCKET_META[it.bucket].short : '',
    amount: tx.amount, author: tx.author, memo: tx.memo ?? '', createdAt: tx.createdAt,
  }
}

export function recurringToRow(r: Recurring, items: Item[], cats: Category[]): Record<string, unknown> {
  const it = items.find((i) => i.id === r.itemId)
  const cat = it ? cats.find((c) => c.id === it.categoryId) : undefined
  return {
    id: r.id, itemId: r.itemId,
    catEmoji: cat?.emoji ?? '', catName: cat?.name ?? '', itemName: it?.name ?? '',
    bucket: it ? BUCKET_META[it.bucket].short : '',
    amount: r.amount, day: r.day, author: r.author, startYm: r.startYm, endYm: r.endYm ?? '',
    active: r.active ? 1 : 0, skips: (r.skips ?? []).join(','), memo: r.memo ?? '',
  }
}

export function itemToRow(it: Item, cats: Category[]): Record<string, unknown> {
  const cat = cats.find((c) => c.id === it.categoryId)
  return {
    id: it.id, categoryId: it.categoryId, catEmoji: cat?.emoji ?? '', catName: cat?.name ?? '',
    name: it.name, bucket: it.bucket, kind: it.kind, archived: it.archived ? 1 : 0,
  }
}

// ── 行 → ドメインオブジェクト復元 ──
function rowToTx(r: Record<string, unknown>): Tx {
  return {
    id: String(r.id), date: String(r.date).slice(0, 10), itemId: String(r.itemId),
    amount: Number(r.amount) || 0, author: String(r.author),
    memo: r.memo ? String(r.memo) : undefined,
    createdAt: r.createdAt ? String(r.createdAt) : new Date().toISOString(),
  }
}
function rowToRecurring(r: Record<string, unknown>): Recurring {
  return {
    id: String(r.id), itemId: String(r.itemId), amount: Number(r.amount) || 0,
    day: Number(r.day) || 1, author: String(r.author), startYm: String(r.startYm),
    endYm: r.endYm ? String(r.endYm) : undefined,
    active: String(r.active) === '1' || r.active === true,
    skips: r.skips ? String(r.skips).split(',').filter(Boolean) : [],
    memo: r.memo ? String(r.memo) : undefined,
  }
}
function rowToItem(r: Record<string, unknown>): Item {
  return {
    id: String(r.id), categoryId: String(r.categoryId), name: String(r.name),
    bucket: String(r.bucket) as Item['bucket'], kind: String(r.kind) as Item['kind'],
    archived: String(r.archived) === '1' || r.archived === true,
  }
}

/** URL 末尾のスラッシュを整えてパスを連結 */
function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + '/' + path
}

/** セッションを Authorization ヘッダに */
function authHeader(cfg: SyncConfig): Record<string, string> {
  return cfg.session ? { Authorization: `Bearer ${cfg.session}` } : {}
}

/** セッション切れ時に投げる目印（UI 側で「再ログイン」に案内する） */
export const SESSION_EXPIRED = 'SESSION_EXPIRED'

/** Worker にログインしてセッションを取得（パスワードは保存しない） */
export async function login(workerUrl: string, password: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(joinUrl(workerUrl, 'login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
  } catch {
    throw new Error('接続に失敗しました。WorkerのURLを確認してください')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.session) throw new Error(data.error || 'ログインに失敗しました')
  return data.session as string
}

/** 全件取得（Worker 経由。セッションで認証） */
export async function pull(cfg: SyncConfig): Promise<PullResult> {
  const res = await fetch(joinUrl(cfg.url, 'pull'), { headers: authHeader(cfg) })
  if (res.status === 401) throw new Error(SESSION_EXPIRED)
  const data = await res.json().catch(() => ({}))
  if (data && data.error) throw new Error(data.error)
  return {
    tx: (data.tx ?? []).map(rowToTx),
    recurring: (data.recurring ?? []).map(rowToRecurring),
    items: (data.items ?? []).map(rowToItem),
  }
}

/** 保留キューの操作を送信（Worker 経由。セッションで認証） */
export async function flush(cfg: SyncConfig): Promise<void> {
  const pending = store.getPending()
  if (pending.length === 0) return
  const res = await fetch(joinUrl(cfg.url, 'flush'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(cfg) },
    body: JSON.stringify({ ops: pending }),
  })
  if (res.status === 401) throw new Error(SESSION_EXPIRED)
}

/** pull 結果と保留キューを突き合わせ、反映済みの操作をキューから除く */
export function reconcile(pulled: PullResult): void {
  const pending = store.getPending()
  if (pending.length === 0) return
  const sets = {
    tx: new Set(pulled.tx.map((t) => t.id)),
    recurring: new Set(pulled.recurring.map((r) => r.id)),
    item: new Set(pulled.items.map((i) => i.id)),
  }
  const remaining = pending.filter((op) => {
    const set = op.kind === 'tx' ? sets.tx : op.kind === 'recurring' ? sets.recurring : sets.item
    const present = set.has(String(op.row.id))
    // upsert は「まだ無ければ」残す / delete は「まだ有れば」残す
    return op.action === 'upsert' ? !present : present
  })
  store.setPending(remaining)
}

/** 保留キューに操作を積む（同じレコードの古い操作は上書き） */
export function enqueue(op: Omit<PendingOp, 'opId'>) {
  const ops = store.getPending()
  const id = op.row.id
  const filtered = ops.filter((o) => !(o.kind === op.kind && o.row.id === id))
  filtered.push({ ...op, opId: `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` })
  store.setPending(filtered)
}

/** pull 結果に未送信の保留操作を上書き適用（取得直後に未送信変更が消えないように） */
export function applyPending<T extends { id: string }>(
  base: T[],
  kind: PendingOp['kind'],
  fromRow: (row: Record<string, unknown>) => T,
): T[] {
  const pending = store.getPending().filter((o) => o.kind === kind)
  if (pending.length === 0) return base
  const map = new Map(base.map((x) => [x.id, x]))
  for (const op of pending) {
    const id = String(op.row.id)
    if (op.action === 'delete') map.delete(id)
    else map.set(id, fromRow(op.row))
  }
  return [...map.values()]
}

export const rowConverters = { rowToTx, rowToRecurring, rowToItem }
