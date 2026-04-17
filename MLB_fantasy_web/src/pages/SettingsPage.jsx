import { useState } from 'react'
import { loadSettings, saveSettings } from '../store'

export default function SettingsPage() {
  const [settings, setSettings] = useState(loadSettings)
  const [saved, setSaved] = useState(false)

  function handleSave() {
    saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="page-content">
      <div className="p-4 space-y-6">
        <h1 className="text-lg font-bold text-white">⚙️ 設定</h1>

        {/* API Key */}
        <section className="bg-slate-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">Google Gemini API Key</h2>
          <p className="text-xs text-slate-400">
            截圖 OCR 功能需要。前往{' '}
            <span className="text-blue-400">aistudio.google.com/apikey</span> 免費取得
          </p>
          <input
            type="password"
            value={settings.geminiKey}
            onChange={e => setSettings(p => ({ ...p, geminiKey: e.target.value }))}
            placeholder="AIza..."
            className="w-full bg-slate-900 text-slate-200 text-sm px-3 py-2.5 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
          />
        </section>

        <section className="bg-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400">年份、時間範圍、計分類別設定已移至各功能頁面，可在「我的陣容」、「FA 分析」和「Savant 分析」分別設定。</p>
        </section>

        {/* Save */}
        <button
          onClick={handleSave}
          className={`w-full font-bold py-3.5 rounded-xl text-base transition-colors ${
            saved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          {saved ? '✅ 已儲存' : '儲存設定'}
        </button>

        {/* About */}
        <section className="text-center space-y-1 pb-4">
          <p className="text-slate-500 text-xs">MLB Fantasy 分析 v1.0</p>
          <p className="text-slate-600 text-xs">數據來源：MLB Stats API · Baseball Savant</p>
        </section>
      </div>
    </div>
  )
}
