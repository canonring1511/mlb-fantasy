import { useState } from 'react'
import { analyzeSavant } from '../api'
import { loadSettings, saveSettings } from '../store'
import LoadingSpinner from '../components/LoadingSpinner'
import CategoryPicker from '../components/CategoryPicker'

// ── PR bar chart sections ──────────────────────────────────────────
// formula 欄位：顯示在 bar 下方的計算說明（手機上 hint/tooltip 沒用）
const PR_SECTIONS = [
  {
    title: '預期數據',
    metrics: [
      { key: 'xBA',   label: 'xBA',   rawKey: 'xba',   fmt: v => v.toFixed(3),
        formula: '根據擊球品質推算的預期打擊率' },
      { key: 'xwOBA', label: 'xwOBA', rawKey: 'xwoba', fmt: v => v.toFixed(3),
        formula: '根據擊球品質推算的預期加權上壘率' },
      { key: 'xISO',  label: 'xISO',  rawKey: 'xiso',  fmt: v => v.toFixed(3),
        formula: 'xSLG − xBA，預期長打能力指標' },
    ],
  },
  {
    title: '擊球品質',
    metrics: [
      { key: 'Barrel%', label: 'Barrel%', rawKey: 'brl',      fmt: v => v.toFixed(1) + '%',
        formula: '出球速度 ≥98mph 且仰角在最佳區間的打球比率' },
      { key: 'HH%',     label: 'HH%',     rawKey: 'hard_hit', fmt: v => v.toFixed(1) + '%',
        formula: '出球速度 ≥95mph（EV95+）的打球比率' },
      { key: 'EV',      label: 'EV',      rawKey: 'ev',       fmt: v => v.toFixed(1) + ' mph' },
      { key: 'Sweet%',  label: 'Sweet%',  rawKey: 'sweet',    fmt: v => v.toFixed(1) + '%',
        formula: '仰角落在 8–32° 的觸球比率（最佳擊球角度區間）' },
    ],
  },
  {
    title: '選球紀律',
    metrics: [
      { key: 'BABIP', label: 'BABIP', rawKey: 'babip',  fmt: v => v.toFixed(3),
        formula: '(安打 − 全壘打) ÷ (打數 − 三振 − 全壘打)，反映運氣成分' },
      { key: 'BB%',   label: 'BB%',   rawKey: 'bb_pct', fmt: v => v.toFixed(1) + '%' },
      { key: 'K%',    label: 'K%↓',   rawKey: 'k_pct',  fmt: v => v.toFixed(1) + '%', lowerBetter: true },
    ],
  },
  {
    title: '跑壘速度',
    metrics: [
      { key: 'Sprint', label: 'Sprint', rawKey: 'sprint_speed', fmt: v => v.toFixed(1) + ' ft/s' },
      { key: 'HP-1B',  label: 'HP-1B↓', rawKey: 'hp_to_1b',    fmt: v => v.toFixed(2) + 's',
        formula: '從本壘跑到一壘的秒數（越低越快）', lowerBetter: true },
    ],
  },
  {
    title: '揮棒力學',
    metrics: [
      { key: 'BatSpd',   label: 'BatSpd',  rawKey: 'bat_speed',   fmt: v => v.toFixed(1) + ' mph',
        formula: '平均揮棒速度，反映原始爆發力' },
      { key: 'Sqd/Sw',   label: 'Sqd/Sw',  rawKey: 'squared_up',  fmt: v => (v * 100).toFixed(1) + '%',
        formula: '揮棒正中（球棒甜蜜點正面擊球）次數 ÷ 揮棒數' },
      { key: 'Whiff/Sw', label: 'Whiff↓',  rawKey: 'whiff_swing', fmt: v => (v * 100).toFixed(1) + '%',
        formula: '揮空次數 ÷ 揮棒數（越低接觸球能力越強）', lowerBetter: true },
    ],
  },
]

function prBarColor(val) {
  if (val >= 80) return 'bg-green-500'
  if (val >= 60) return 'bg-green-400'
  if (val >= 40) return 'bg-yellow-500'
  if (val >= 20) return 'bg-orange-500'
  return 'bg-red-600'
}

function prTextColor(val) {
  if (val >= 80) return 'text-green-400'
  if (val >= 60) return 'text-green-300'
  if (val >= 40) return 'text-yellow-400'
  if (val >= 20) return 'text-orange-400'
  return 'text-red-400'
}

function SavantPRChart({ savantPr, player }) {
  if (!savantPr) return null

  const sectionsWithData = PR_SECTIONS.map(section => ({
    ...section,
    metrics: section.metrics.filter(
      m => savantPr[m.key] !== null && savantPr[m.key] !== undefined
    ),
  })).filter(s => s.metrics.length > 0)

  if (sectionsWithData.length === 0) return null

  return (
    <div className="space-y-2">
      <h4 className="text-xs text-slate-400">進階數據 PR（vs 全聯盟）</h4>
      {sectionsWithData.map(section => (
        <div key={section.title}>
          <div className="text-[10px] font-semibold text-slate-500 mb-0.5 uppercase tracking-wide">
            {section.title}
          </div>
          <div>
            {section.metrics.map(({ key, label, rawKey, fmt, formula }) => {
              const pr  = savantPr[key]
              const raw = player[rawKey]
              const pct = Math.min(100, Math.max(0, pr))
              const hasRaw = raw !== null && raw !== undefined && !Number.isNaN(raw)
              return (
                <div key={key} className="mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 shrink-0 text-right">
                      <span className="text-xs font-mono text-slate-300 leading-none">{label}</span>
                    </div>
                    <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${prBarColor(pr)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-7 shrink-0 text-right">
                      <span className={`text-xs font-mono font-bold leading-none ${prTextColor(pr)}`}>
                        {pr.toFixed(0)}
                      </span>
                    </div>
                    <div className="w-16 shrink-0 text-right">
                      <span className="text-xs text-slate-500 font-mono leading-none">
                        {hasRaw ? fmt(raw) : '—'}
                      </span>
                    </div>
                  </div>
                  {formula && (
                    <div className="ml-[72px] mt-0.5">
                      <span className="text-[9px] text-slate-500 leading-none">{formula}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Verdict card ──────────────────────────────────────────────────
const VERDICT_STYLE = {
  up:   { icon: '📈', label: '看漲', color: 'text-green-400', bg: 'bg-green-900/30 border-green-700' },
  hold: { icon: '➡️', label: '維持', color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-800' },
  down: { icon: '📉', label: '看跌', color: 'text-red-400', bg: 'bg-red-900/30 border-red-700' },
}

function VerdictCard({ category, verdict }) {
  if (!verdict) return null
  const style = VERDICT_STYLE[verdict.verdict] || VERDICT_STYLE.hold
  return (
    <div className={`border rounded-xl p-3 ${style.bg}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-base">{verdict.icon}</span>
        <span className="font-semibold text-sm text-white">{category}</span>
        <span className={`text-xs ${style.color} ml-auto`}>{verdict.label}</span>
      </div>
      {verdict.reasons?.map((r, i) => (
        <p key={i} className="text-slate-300 text-xs leading-relaxed">{r}</p>
      ))}
    </div>
  )
}

// ── Player card ───────────────────────────────────────────────────
function PlayerCard({ player }) {
  const [expanded, setExpanded] = useState(false)

  const upCount   = Object.values(player.verdicts || {}).filter(v => v.verdict === 'up').length
  const downCount = Object.values(player.verdicts || {}).filter(v => v.verdict === 'down').length

  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between"
      >
        <div className="text-left">
          <div className="flex items-baseline gap-2">
            <span className="text-white font-semibold">{player.name}</span>
            {(player.Team || player.Pos) && (
              <span className="text-slate-400 text-xs">
                {[player.Team, player.Pos].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          {!player.found && (
            <div className="text-red-400 text-xs">找不到 Savant 數據</div>
          )}
          {player.found && (
            <div className="flex gap-2 mt-1">
              {upCount   > 0 && <span className="text-green-400 text-xs">📈 {upCount} 看漲</span>}
              {downCount > 0 && <span className="text-red-400   text-xs">📉 {downCount} 看跌</span>}
              {upCount === 0 && downCount === 0 && (
                <span className="text-yellow-400 text-xs">➡️ 維持</span>
              )}
            </div>
          )}
        </div>
        <div className="text-slate-400 text-lg">{expanded ? '▲' : '▼'}</div>
      </button>

      {expanded && player.found && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-700 pt-3">
          {/* Summary */}
          {player.summary && (
            <div className="bg-slate-700 rounded-xl p-3">
              <p className="text-slate-300 text-sm leading-relaxed">{player.summary}</p>
            </div>
          )}

          {/* PR bar chart — all sections */}
          <SavantPRChart savantPr={player.savant_pr} player={player} />

          {/* Per-category verdicts */}
          {Object.keys(player.verdicts || {}).length > 0 && (
            <div>
              <h4 className="text-xs text-slate-400 mb-2">各類別預測</h4>
              <div className="space-y-2">
                {Object.entries(player.verdicts).map(([cat, verdict]) => (
                  <VerdictCard key={cat} category={cat} verdict={verdict} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────
export default function SavantPage() {
  const [year, setYear]       = useState(() => loadSettings().savantYear || new Date().getFullYear())
  const [names, setNames]     = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState('')

  function handleYearChange(y) {
    setYear(y)
    saveSettings({ ...loadSettings(), savantYear: y })
  }

  async function handleAnalyze() {
    const nameList = names.split('\n').map(s => s.trim()).filter(Boolean)
    if (!nameList.length) { setError('請輸入球員名字'); return }
    setError('')
    setLoading(true)
    try {
      const data = await analyzeSavant(nameList, year)
      setResult(data.players)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-content">
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-white">Savant 運氣分析</h1>
          <p className="text-xs text-slate-400">{year} · 擊球品質、跑壘速度、揮棒力學全面 PR 排名</p>
        </div>

        <div className="bg-slate-800 rounded-xl p-3">
          <textarea
            value={names}
            onChange={e => setNames(e.target.value)}
            placeholder={"每行一個打者名字\nAaron Judge\nShohei Ohtani\nFreddie Freeman"}
            rows={6}
            className="w-full bg-slate-900 text-slate-200 text-sm p-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* Year picker — Savant is batters-only, no period */}
        <CategoryPicker
          year={year} onYearChange={handleYearChange}
          showPeriod={false} showPitching={false}
        />

        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-base transition-colors"
        >
          {loading ? '分析中...' : '📊 Savant 分析'}
        </button>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 text-sm rounded-xl p-3">
            {error}
          </div>
        )}

        {loading && <LoadingSpinner message="正在下載 Baseball Savant 數據..." />}

        {result && !loading && (
          <div className="space-y-3">
            {result.map((player, i) => (
              <PlayerCard key={i} player={player} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
