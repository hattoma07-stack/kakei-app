import type { Category, Item, Recurring, Tx } from '../types'
import { store, type PendingOp, type SyncConfig } from './store'
import { BUCKET_META } from '../data/seed'

// ───────────────────────────────────────────────────────────
// Google スプレッドシート同期（Apps Script Web アプリ経由）
//
// Apps Script は通常の fetch だと CORS で弾かれるため、確実に動く方式を使う：
//   ・読み取り(pull) … JSONP（<script> 読み込み。CORS の制約を受けない）
//   ・書き込み(flush) … fetch POST + mode:'no-cors'（送信はできるが応答は読めない）
// 応答が読めない書き込みは、直後の pull で結果を突き合わせて確認する（reconcile）。
// ───────────────────────────────────────────────────────────

export interface PullResult {
  tx: Tx[]
  recurring: Recurring[]
  items: Item[]
}

// ───────────────────────────────────────────────────────────
// HMAC 署名（合言葉を URL・本文に生では載せない）
//   ・送るのは「HMAC-SHA256(合言葉, "アクション:時刻")」の署名だけ
//   ・GAS 側は同じ計算で照合し、時刻の鮮度（±5分）も確認する
//   ・エンコードは base64url（パディング無し）で GAS と揃える
// ───────────────────────────────────────────────────────────

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** HMAC-SHA256(secret, message) を base64url で返す */
async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return b64url(sig)
}

/** アクション用の署名パラメータ（ts=時刻ミリ秒, sig=署名）を作る */
async function authParams(cfg: SyncConfig, action: string): Promise<{ ts: string; sig: string }> {
  const ts = String(Date.now())
  const sig = await hmac(cfg.token, `${action}:${ts}`)
  return { ts, sig }
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

/** JSONP でクロスオリジン取得（CORS を回避） */
function jsonp(url: string, timeoutMs = 20000): Promise<any> {
  return new Promise((resolve, reject) => {
    const cb = `kakei_cb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    const script = document.createElement('script')
    let done = false
    const cleanup = () => {
      done = true
      delete (window as any)[cb]
      script.remove()
      window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      if (!done) {
        cleanup()
        reject(new Error('接続がタイムアウトしました。URLとデプロイ設定を確認してください'))
      }
    }, timeoutMs)
    ;(window as any)[cb] = (data: any) => {
      if (done) return
      cleanup()
      resolve(data)
    }
    script.onerror = () => {
      if (done) return
      cleanup()
      reject(new Error('接続に失敗しました。URL（/exec）とアクセス設定「全員」を確認してください'))
    }
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${cb}`
    document.body.appendChild(script)
  })
}

/** 全件取得（JSONP。合言葉は載せず、署名のみ URL に付ける） */
export async function pull(cfg: SyncConfig): Promise<PullResult> {
  const { ts, sig } = await authParams(cfg, 'pull')
  const url = `${cfg.url}?action=pull&ts=${ts}&sig=${encodeURIComponent(sig)}`
  const data = await jsonp(url)
  if (data && data.error) throw new Error(data.error)
  return {
    tx: (data.tx ?? []).map(rowToTx),
    recurring: (data.recurring ?? []).map(rowToRecurring),
    items: (data.items ?? []).map(rowToItem),
  }
}

/** 保留キューの操作を送信（no-cors。合言葉は載せず、署名で認証する） */
export async function flush(cfg: SyncConfig): Promise<void> {
  const pending = store.getPending()
  if (pending.length === 0) return
  const { ts, sig } = await authParams(cfg, 'flush')
  await fetch(cfg.url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ts, sig, ops: pending }),
  })
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
