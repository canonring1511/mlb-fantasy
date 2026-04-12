import { useState } from 'react'
import { loadSettings, saveSettings } from '../store'

const ALL_BATTING = ['H', 'HR', 'RBI', 'SB', 'AVG', 'BB', '2B', '3B', 'K', 'R', 'OBP', 'OPS']
const ALL_PITCHING = ['W', 'SV', 'ERA', 'WHIP', 'SO', 'HLD', 'BB', 'IP', 'QS', 'L']

export default function SettingsPage() {
  const [settings, setSettings] = useState(loadSettings)
  const [saved, setSaved] = useState(false)

  function toggle(key, cat) {
    setSettings(prev => {
      const list = prev[key]
      const next = list.includes(cat) ? list.filter(c => c !== cat) : [...list, cat]
      return { ...prev, [key]: next }
    })
  }

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

        {/* Year & Period */}
        <section className="bg-slate-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">數據設定</h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">賽季年份</label>
              <input
                type="number"
                value={settings.year}
                onChange={e => setSettings(p => ({ ...p, year: parseInt(e.target.value) }))}
                className="w-full bg-slate-900 text-slate-200 text-sm px-3 py-2.5 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">時間範圍</label>
              <select
                value={settings.period}
                onChange={e => setSettings(p => ({ ...p, period: e.target.value }))}
                className="w-full bg-slate-900 text-slate-200 text-sm px-3 py-2.5 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
              >
                <option value="season">全季</option>
                <option value="30d">近 30 天</option>
              </select>
            </div>
          </div>
        </section>

        {/* Batting categories */}
        <section className="bg-slate-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">打者計分類別</h2>
          <div className="flex flex-wrap gap-2">
            {ALL_BATTING.map(cat => {
              const on = settings.battingCategories.includes(cat)
              return (
                <button
                  key={cat}
                  onClick={() => toggle('battingCategories', cat)}
                  className={`px-3 py-1.5 rounded-full text-sm font-mono font-medium transition-colors ${
                    on ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {cat}
                </button>
              )
            })}
          </div>
        </section>

        {/* Pitching categories */}
        <section className="bg-slate-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">投手計分類別</h2>
          <div className="flex flex-wrap gap-2">
            {ALL_PITCHING.map(cat => {
              const on = settings.pitchingCategories.includes(cat)
              return (
                <button
                  key={cat}
                  onClick={() => toggle('pitchingCategories', cat)}
                  className={`px-3 py-1.5 rounded-full text-sm font-mono font-medium transition-colors ${
                    on ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {cat}
                </button>
              )
            })}
          </div>
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
