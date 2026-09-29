import { useState } from 'react'
import { useData } from './hooks/useData'
import InputScreen from './screens/InputScreen'
import DashboardScreen from './screens/DashboardScreen'
import HistoryScreen from './screens/HistoryScreen'
import RecurringScreen from './screens/RecurringScreen'
import SettingsScreen from './screens/SettingsScreen'

type Tab = 'input' | 'dashboard' | 'history' | 'recurring' | 'settings'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'input', label: '入力', icon: '➕' },
  { key: 'dashboard', label: '分析', icon: '📊' },
  { key: 'history', label: '履歴', icon: '📒' },
  { key: 'recurring', label: '定期', icon: '🔁' },
  { key: 'settings', label: '設定', icon: '⚙️' },
]

const TITLES: Record<Tab, string> = {
  input: '入力',
  dashboard: 'ダッシュボード',
  history: '履歴',
  recurring: '定期支出',
  settings: '設定',
}

export default function App() {
  const data = useData()
  const [tab, setTab] = useState<Tab>('input')

  return (
    <div className="relative mx-auto flex min-h-screen max-w-md flex-col">
      {/* 全画面の写真背景 ＋ 白ベール（本文の可読性のため） */}
      <div
        className="fixed inset-0 -z-20"
        style={{
          backgroundImage: 'url(/header-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div className="fixed inset-0 -z-10 bg-white/55 backdrop-blur-[1px]" />

      {/* ヘッダー（背景に統合・ごく薄いフェードで可読性確保） */}
      <header
        className="sticky top-0 z-10 flex items-center gap-2 px-4 pb-5 pt-3"
        style={{
          backgroundImage:
            'linear-gradient(to bottom, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.4) 45%, rgba(255,255,255,0) 100%)',
        }}
      >
        <h1 className="text-base font-bold text-gray-800">家計簿アプリmachi</h1>
        <span className="ml-auto text-xs font-medium text-gray-500">{TITLES[tab]}</span>
      </header>

      {/* 本体 */}
      <main className="flex-1">
        {tab === 'input' && <InputScreen data={data} />}
        {tab === 'dashboard' && <DashboardScreen data={data} />}
        {tab === 'history' && <HistoryScreen data={data} />}
        {tab === 'recurring' && <RecurringScreen data={data} />}
        {tab === 'settings' && <SettingsScreen data={data} />}
      </main>

      {/* 下部ナビ */}
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md border-t border-gray-200 bg-white">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex flex-1 flex-col items-center py-2 text-[10px] font-medium ${
              tab === t.key ? 'text-brand-600' : 'text-gray-400'
            }`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            <span className="mt-0.5">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
