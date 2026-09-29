import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Category, Item, Tx, Recurring } from '../types'
import { store, uid, type SyncConfig } from '../lib/store'
import { expandRecurring } from '../lib/recurring'
import {
  applyPending,
  enqueue,
  flush,
  itemToRow,
  login,
  pull,
  reconcile,
  recurringToRow,
  rowConverters,
  SESSION_EXPIRED,
  txToRow,
} from '../lib/sync'

/** 同期エラーを利用者向けの文言に変換 */
function syncErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg === SESSION_EXPIRED) return 'ログインの有効期限が切れました。「接続先を変更」から再ログインしてください'
  return msg
}

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error'

/** アプリ全体のデータを管理するフック */
export function useData() {
  const [txs, setTxs] = useState<Tx[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [recurring, setRecurring] = useState<Recurring[]>([])
  const [author, setAuthorState] = useState<string>('ma')
  const [pins, setPins] = useState<string[]>([])

  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('off')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  // 最新の items/categories を副作用内から参照するための ref
  const itemsRef = useRef<Item[]>([])
  const catsRef = useRef<Category[]>([])
  itemsRef.current = items
  catsRef.current = categories

  const refreshPending = useCallback(() => setPendingCount(store.getPending().length), [])

  useEffect(() => {
    setTxs(store.getTx())
    setItems(store.getItems())
    setCategories(store.getCategories())
    setRecurring(store.getRecurring())
    setAuthorState(store.getAuthor())
    setPins(store.getPins())
    const cfg = store.getSync()
    setSyncConfig(cfg)
    setSyncStatus(cfg ? 'idle' : 'off')
    refreshPending()
  }, [refreshPending])

  // ── サーバーから取得してローカルへ反映（未送信分は保持） ──
  const doPull = useCallback(async (cfg: SyncConfig) => {
    const res = await pull(cfg)
    // 送信済み（サーバーに反映済み）の保留操作をキューから除く
    reconcile(res)
    const nextTx = applyPending(res.tx, 'tx', rowConverters.rowToTx)
    const nextRec = applyPending(res.recurring, 'recurring', rowConverters.rowToRecurring)
    // 費目マスタ：サーバーが空なら初期シードを維持
    const nextItems = res.items.length > 0 ? applyPending(res.items, 'item', rowConverters.rowToItem) : store.getItems()
    store.setTx(nextTx)
    store.setRecurring(nextRec)
    store.setItems(nextItems)
    setTxs(nextTx)
    setRecurring(nextRec)
    setItems(nextItems)
  }, [])

  /** 送信→取得の順で同期。手動ボタン・起動時・復帰時に呼ぶ */
  const syncNow = useCallback(
    async (cfgArg?: SyncConfig) => {
      const cfg = cfgArg ?? store.getSync()
      if (!cfg) return
      setSyncStatus('syncing')
      setSyncError(null)
      try {
        await flush(cfg)
        refreshPending()
        await doPull(cfg)
        const saved: SyncConfig = { ...cfg, lastSyncAt: new Date().toISOString() }
        store.setSync(saved)
        setSyncConfig(saved)
        setSyncStatus('idle')
      } catch (e) {
        setSyncError(syncErrorMessage(e))
        setSyncStatus('error')
      }
    },
    [doPull, refreshPending],
  )

  // 変更をキューに積んで自動送信（デバウンス）
  const flushTimer = useRef<number | null>(null)
  const scheduleFlush = useCallback(() => {
    refreshPending()
    if (!store.getSync()) return
    if (flushTimer.current) window.clearTimeout(flushTimer.current)
    flushTimer.current = window.setTimeout(() => {
      syncNow().catch(() => {})
    }, 800)
  }, [refreshPending, syncNow])

  // ── 取引 ──
  const addTx = useCallback(
    (input: Omit<Tx, 'id' | 'createdAt'>) => {
      const tx: Tx = { ...input, id: uid('tx'), createdAt: new Date().toISOString() }
      store.addTx(tx)
      setTxs(store.getTx())
      enqueue({ kind: 'tx', action: 'upsert', row: txToRow(tx, itemsRef.current, catsRef.current) })
      scheduleFlush()
      return tx
    },
    [scheduleFlush],
  )

  const updateTx = useCallback(
    (tx: Tx) => {
      store.updateTx(tx)
      setTxs(store.getTx())
      enqueue({ kind: 'tx', action: 'upsert', row: txToRow(tx, itemsRef.current, catsRef.current) })
      scheduleFlush()
    },
    [scheduleFlush],
  )

  const removeTx = useCallback(
    (id: string) => {
      store.removeTx(id)
      setTxs(store.getTx())
      enqueue({ kind: 'tx', action: 'delete', row: { id } })
      scheduleFlush()
    },
    [scheduleFlush],
  )

  // ── 費目・詳細 ──
  const addItem = useCallback(
    (input: Omit<Item, 'id'>) => {
      const item: Item = { ...input, id: uid('it') }
      const next = [...store.getItems(), item]
      store.setItems(next)
      setItems(next)
      enqueue({ kind: 'item', action: 'upsert', row: itemToRow(item, catsRef.current) })
      scheduleFlush()
      return item
    },
    [scheduleFlush],
  )

  const updateItem = useCallback(
    (item: Item) => {
      const next = store.getItems().map((i) => (i.id === item.id ? item : i))
      store.setItems(next)
      setItems(next)
      enqueue({ kind: 'item', action: 'upsert', row: itemToRow(item, catsRef.current) })
      scheduleFlush()
    },
    [scheduleFlush],
  )

  const removeItem = useCallback(
    (id: string) => {
      const next = store.getItems().filter((i) => i.id !== id)
      store.setItems(next)
      setItems(next)
      enqueue({ kind: 'item', action: 'delete', row: { id } })
      scheduleFlush()
    },
    [scheduleFlush],
  )

  // ── 定期支出・定期収入 ──
  const pushRecurring = useCallback(
    (rule: Recurring, action: 'upsert' | 'delete' = 'upsert') => {
      enqueue({
        kind: 'recurring',
        action,
        row: action === 'delete' ? { id: rule.id } : recurringToRow(rule, itemsRef.current, catsRef.current),
      })
      scheduleFlush()
    },
    [scheduleFlush],
  )

  const addRecurring = useCallback(
    (input: Omit<Recurring, 'id'>) => {
      const rule: Recurring = { ...input, id: uid('rec') }
      const next = [...store.getRecurring(), rule]
      store.setRecurring(next)
      setRecurring(next)
      pushRecurring(rule)
      return rule
    },
    [pushRecurring],
  )

  const updateRecurring = useCallback(
    (rule: Recurring) => {
      const next = store.getRecurring().map((r) => (r.id === rule.id ? rule : r))
      store.setRecurring(next)
      setRecurring(next)
      pushRecurring(rule)
    },
    [pushRecurring],
  )

  const removeRecurring = useCallback(
    (id: string) => {
      const rule = store.getRecurring().find((r) => r.id === id)
      const next = store.getRecurring().filter((r) => r.id !== id)
      store.setRecurring(next)
      setRecurring(next)
      if (rule) pushRecurring(rule, 'delete')
    },
    [pushRecurring],
  )

  const toggleSkip = useCallback(
    (ruleId: string, ym: string) => {
      let updated: Recurring | undefined
      const next = store.getRecurring().map((r) => {
        if (r.id !== ruleId) return r
        const skips = new Set(r.skips ?? [])
        if (skips.has(ym)) skips.delete(ym)
        else skips.add(ym)
        updated = { ...r, skips: [...skips] }
        return updated
      })
      store.setRecurring(next)
      setRecurring(next)
      if (updated) pushRecurring(updated)
    },
    [pushRecurring],
  )

  const setAuthor = useCallback((a: string) => {
    store.setAuthor(a)
    setAuthorState(a)
  }, [])

  const togglePin = useCallback((itemId: string) => {
    const cur = store.getPins()
    const next = cur.includes(itemId) ? cur.filter((id) => id !== itemId) : [...cur, itemId]
    store.setPins(next)
    setPins(next)
  }, [])

  // ── 同期の接続・解除 ──
  const connectSync = useCallback(
    async (url: string, password: string) => {
      setSyncStatus('syncing')
      setSyncError(null)
      try {
        // まずログインして短命セッションを取得（パスワードは保存しない）
        const session = await login(url.trim(), password)
        const cfg: SyncConfig = { url: url.trim(), session }
        // 接続確認を兼ねて取得
        const remote = await pull(cfg)
        const localTx = store.getTx()
        const localRec = store.getRecurring()
        const localItems = store.getItems()
        const serverEmpty = remote.tx.length === 0 && remote.recurring.length === 0 && remote.items.length === 0
        if (serverEmpty) {
          // 初回：この端末のデータをすべてアップロード（費目マスタも）
          for (const it of localItems) enqueue({ kind: 'item', action: 'upsert', row: itemToRow(it, catsRef.current) })
          for (const t of localTx) enqueue({ kind: 'tx', action: 'upsert', row: txToRow(t, localItems, catsRef.current) })
          for (const r of localRec)
            enqueue({ kind: 'recurring', action: 'upsert', row: recurringToRow(r, localItems, catsRef.current) })
        }
        await flush(cfg)
        await doPull(cfg)
        const saved: SyncConfig = { ...cfg, lastSyncAt: new Date().toISOString() }
        store.setSync(saved)
        setSyncConfig(saved)
        setSyncStatus('idle')
        refreshPending()
        return true
      } catch (e) {
        setSyncError(syncErrorMessage(e))
        setSyncStatus('error')
        return false
      }
    },
    [doPull, refreshPending],
  )

  const disconnectSync = useCallback(() => {
    store.setSync(null)
    setSyncConfig(null)
    setSyncStatus('off')
    setSyncError(null)
  }, [])

  // 起動時：設定済みなら同期。ウィンドウ復帰時にも取得
  useEffect(() => {
    const cfg = store.getSync()
    if (cfg) syncNow(cfg)
    const onFocus = () => {
      if (store.getSync()) syncNow()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 定期支出を展開する対象月（データのある年＋今年の各月。ただし今月まで） */
  const recurringMonths = useMemo(() => {
    const now = new Date()
    const curYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const years = new Set<number>()
    years.add(now.getFullYear())
    for (const t of txs) years.add(Number(t.date.slice(0, 4)))
    const ms: string[] = []
    for (const y of [...years])
      for (let m = 1; m <= 12; m++) {
        const ym = `${y}-${String(m).padStart(2, '0')}`
        if (ym <= curYm) ms.push(ym) // 未来月は展開しない（先に入って見えづらくなるのを防ぐ）
      }
    return ms
  }, [txs])

  /** 実データ ＋ 定期支出の自動生成ぶんを合成 */
  const allTxs = useMemo(
    () => [...txs, ...expandRecurring(recurring, recurringMonths)],
    [txs, recurring, recurringMonths],
  )

  return {
    txs,
    allTxs,
    items,
    categories,
    recurring,
    author,
    pins,
    togglePin,
    // sync
    syncConfig,
    syncStatus,
    syncError,
    pendingCount,
    connectSync,
    disconnectSync,
    syncNow,
    // mutations
    addTx,
    updateTx,
    removeTx,
    addItem,
    updateItem,
    removeItem,
    addRecurring,
    updateRecurring,
    removeRecurring,
    toggleSkip,
    setAuthor,
  }
}

export type DataApi = ReturnType<typeof useData>
