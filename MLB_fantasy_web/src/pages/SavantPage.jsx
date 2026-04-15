import { useState } from 'react'
import { analyzeSavant } from '../api'
import { loadSettings } from '../store'
import LoadingSpinner from '../components/LoadingSpinner'

// ── PR bar chart sections ──────────────────────────────────────────
const PR_SECTIONS = [
  {
    title: '預期數據',
    metrics: [
      { key: 'xBA',   label: 'xBA',   hint: '預期打擊率',     rawKey: 'xba',   fmt: v => v.toFixed(3) },
      { key: 'xSLG',  label: 'xSLG',  hint: '預期長打率',     rawKey: 'xslg',  fmt: v => v.toFixed(3) },
      { key: 'xwOBA', label: 'xwOBA', hint: '預期加權上壘率', rawKey: 'xwoba', fmt: v => v.toFixed(3) },
      { key: 'xISO',  label: 'xISO',  hint: '預期純長打率 (xSLG−xBA)', rawKey: 'xiso', fmt: v => v.toFixed(3) },
    ],
  },
  {
    title: '擊球品質',
    metrics: [
      { key: 'Barrel%', label: 'Barrel%', hint: '桶擊率',              rawKey: 'brl',      fmt: v => v.toFixed(1) + '%' },
      { key: 'Brl/PA',  label: 'Brl/PA',  hint: '每打席桶擊率',        rawKey: 'brl_pa',   fmt: v => v.toFixed(1) + '%' },
      { key: 'HH%',     label: 'HH%',     hint: '強擊率 EV95+',        rawKey: 'hard_hit', fmt: v => v.toFixed(1) + '%' },
      { key: 'EV',      label: 'EV',      hint: '平均出球速度 (mph)',   rawKey: 'ev',       fmt: v => v.toFixed(1) },
      { key: 'Sweet%',  label: 'Sweet%',  hint: '甜蜜角度觸球率 8-32°', rawKey: 'sweet',    fmt: v => v.toFixed(1) + '%' },
      { key: 'AvgDist', label: 'AvgDist', hint: '平均打擊距離 (ft)',    rawKey: 'avg_dist', fmt: v => v.toFixed(0) + ' ft' },
    ],
  },
  {
    title: '選球紀律',
    metrics: [
      { key: 'BABIP', label: 'BABIP', hint: '場內球打擊率（運氣指標）', rawKey: 'babip', fmt: v => v.toFixed(3) },
      { key: 'BB%',   label: 'BB%',   hint: '四壞球率',                 rawKey: 'bb_pct', fmt: v => v.toFixed(1) + '%' },
      { key: 'K%',    label: 'K%↓',   hint: '三振率（越低越好）',        rawKey: 'k_pct',  fmt: v => v.toFixed(1) + '%', lowerBetter: true },
    ],
  },
  {
    title: '打球分佈',
    metrics: [
      { key: 'FBLD%', label: 'FBLD%', hint: '飛球+平飛球率（越高越好）', rawKey: 'fbld_rate', fmt: v => v.toFixed(1) + '%' },
      { key: 'GB%',   label: 'GB%↓',  hint: '滾地球率（越低越好）',      rawKey: 'gb_rate',  fmt: v => v.toFixed(1) + '%', lowerBetter: true },
    ],
  },
  {
    title: '跑壘速度',
    metrics: [
      { key: 'Sprint', label: 'Sprint', hint: '衝刺速度 (ft/s)',     rawKey: 'sprint_speed', fmt: v => v.toFixed(1) },
      { key: 'HP-1B',  label: 'HP-1B↓', hint: '本壘到一壘秒數（越低越快）', rawKey: 'hp_to_1b', fmt: v => v.toFixed(2) + 's', lowerBetter: true },
    ],
  },
  {
    title: '揮棒力學',
    metrics: [
      { key: 'BatSpd',   label: 'BatSpd',   hint: '平均揮棒速度 (mph)',   rawKey: 'bat_speed',   fmt: v => v.toFixed(1) },
      { key: 'HardSwg%', label: 'HardSwg%', hint: '爆發揮棒率',           rawKey: 'hard_swing',  fmt: v => (v * 100).toFixed(1) + '%' },
      { key: 'Sqd/Sw',   label: 'Sqd/Sw',   hint: '每揮棒正中率',         rawKey: 'squared_up',  fmt: v => (v * 100).toFixed(1) + '%' },
      { key: 'Blast/Sw', label: 'Blast/Sw', hint: '每揮棒爆發率',         rawKey: 'blast_swing', fmt: v => (v * 100).toFixed(1) + '%' },
      { key: 'Whiff/Sw', label: 'Whiff↓',   hint: '每揮棒揮空率（越低越好）', rawKey: 'whiff_swing', fmt: v => (v * 100).toFixed(1) + '%', lowerBetter: true },
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
    <div className="space-y-4">
      <h4 className="text-xs text-slate-400">進階數據 PR（vs 全聯盟）</h4>
      {sectionsWithData.map(section => (
        <div key={section.title}>
          <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
            {section.title}
          </div>
          <div className="space-y-1.5">
            {section.metrics.map(({ key, label, hint, rawKey, fmt }) => {
              const pr  = savantPr[key]
              const raw = player[rawKey]
              const pct = Math.min(100, Math.max(0, pr))
              const hasRaw = raw !== null && raw !== undefined && !Number.isNaN(raw)
              return (
                <div key={key} className="flex items-center gap-2" title={hint}>
                  <div className="w-16 shrink-0 text-right">
                    <span className="text-xs font-mono text-slate-300">{label}</span>
                  </div>
                  <div className="flex-1 bg-slate-700 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${prBarColor(pr)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-7 shrink-0 text-right">
                    <span className={`text-xs font-mono font-bold ${prTextColor(pr)}`}>
                      {pr.toFixed(0)}
                    </span>
                  </div>
                  <div className="w-16 shrink-0 text-right">
                    <span className="text-xs text-slate-500 font-mono">
                      {hasRaw ? fmt(raw) : '—'}
                    </span>
                  </div>
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
          <div className="text-white font-semibold">{player.name}</div>
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
  const settings = loadSettings()
  const [names, setNames]     = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState('')

  async function handleAnalyze() {
    const nameList = names.split('\n').map(s => s.trim()).filter(Boolean)
    if (!nameList.length) { setError('請輸入球員名字'); return }
    setError('')
    setLoading(true)
    try {
      const data = await analyzeSavant(nameList, settings.year)
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
          <p className="text-xs text-slate-400">擊球品質、跑壘速度、揮棒力學全面 PR 排名</p>
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
