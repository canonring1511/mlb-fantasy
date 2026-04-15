import { useState } from 'react'
import { analyzeSavant } from '../api'
import { loadSettings } from '../store'
import LoadingSpinner from '../components/LoadingSpinner'

// 進階數據 PR bar chart
const SAVANT_PR_METRICS = [
  { key: 'xBA',     label: 'xBA',     hint: '預期打擊率' },
  { key: 'xSLG',    label: 'xSLG',    hint: '預期長打率' },
  { key: 'xwOBA',   label: 'xwOBA',   hint: '預期加權上壘率' },
  { key: 'BABIP',   label: 'BABIP',   hint: '場內球打擊率（運氣指標）' },
  { key: 'Barrel%', label: 'Barrel%', hint: '桶擊率' },
  { key: 'HH%',     label: 'HH%',     hint: '強擊率 (EV95+)' },
  { key: 'EV',      label: 'EV',      hint: '平均初速' },
]

function prBarColor(val) {
  if (val >= 80) return 'bg-green-500'
  if (val >= 60) return 'bg-green-400'
  if (val >= 40) return 'bg-yellow-500'
  if (val >= 20) return 'bg-orange-500'
  return 'bg-red-600'
}

function SavantPRChart({ savantPr }) {
  if (!savantPr || Object.keys(savantPr).length === 0) return null
  const rows = SAVANT_PR_METRICS.filter(m => savantPr[m.key] !== null && savantPr[m.key] !== undefined)
  if (rows.length === 0) return null

  return (
    <div>
      <h4 className="text-xs text-slate-400 mb-2">進階數據 PR 排名（vs 全聯盟）</h4>
      <div className="space-y-2">
        {rows.map(({ key, label, hint }) => {
          const val = savantPr[key]
          const pct = Math.min(100, Math.max(0, val))
          return (
            <div key={key} className="flex items-center gap-2">
              <div className="w-16 shrink-0 text-right">
                <span className="text-xs font-mono text-slate-300" title={hint}>{label}</span>
              </div>
              <div className="flex-1 bg-slate-700 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${prBarColor(val)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="w-8 shrink-0 text-right">
                <span className={`text-xs font-mono font-semibold ${
                  val >= 80 ? 'text-green-400' :
                  val >= 60 ? 'text-green-300' :
                  val >= 40 ? 'text-yellow-400' :
                  val >= 20 ? 'text-orange-400' : 'text-red-400'
                }`}>{val.toFixed(0)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const VERDICT_STYLE = {
  up:   { icon: '📈', label: '看漲', color: 'text-green-400', bg: 'bg-green-900/30 border-green-700' },
  hold: { icon: '➡️', label: '維持', color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-800' },
  down: { icon: '📉', label: '看跌', color: 'text-red-400', bg: 'bg-red-900/30 border-red-700' },
}

function MetricTile({ label, value, decimals = 3 }) {
  const display = value !== null && value !== undefined
    ? value.toFixed(decimals)
    : '—'
  return (
    <div className="bg-slate-700 rounded-lg p-2 text-center">
      <div className="text-slate-400 text-xs">{label}</div>
      <div className="text-white font-mono text-sm font-semibold">{display}</div>
    </div>
  )
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

function PlayerCard({ player }) {
  const [expanded, setExpanded] = useState(false)

  const upCount = Object.values(player.verdicts || {}).filter(v => v.verdict === 'up').length
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
              {upCount > 0 && <span className="text-green-400 text-xs">📈 {upCount} 看漲</span>}
              {downCount > 0 && <span className="text-red-400 text-xs">📉 {downCount} 看跌</span>}
              {upCount === 0 && downCount === 0 && <span className="text-yellow-400 text-xs">➡️ 維持</span>}
            </div>
          )}
        </div>
        <div className="text-slate-400 text-lg">{expanded ? '▲' : '▼'}</div>
      </button>

      {expanded && player.found && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-700 pt-3">
          {/* Overall summary */}
          {player.summary && (
            <div className="bg-slate-700 rounded-xl p-3">
              <p className="text-slate-300 text-sm leading-relaxed">{player.summary}</p>
            </div>
          )}

          {/* Metrics grid */}
          <div>
            <h4 className="text-xs text-slate-400 mb-2">擊球品質</h4>
            <div className="grid grid-cols-3 gap-2">
              <MetricTile label="BA" value={player.ba} />
              <MetricTile label="xBA" value={player.xba} />
              <MetricTile label="BABIP" value={player.babip} />
              <MetricTile label="SLG" value={player.slg} />
              <MetricTile label="xSLG" value={player.xslg} />
              <MetricTile label="wOBA" value={player.woba} />
              <MetricTile label="xwOBA" value={player.xwoba} />
              <MetricTile label="Barrel%" value={player.brl} decimals={1} />
              <MetricTile label="HH%" value={player.hard_hit} decimals={1} />
              <MetricTile label="EV" value={player.ev} decimals={1} />
              <MetricTile label="LA°" value={player.la} decimals={1} />
            </div>
          </div>

          {/* Savant PR bar chart */}
          <SavantPRChart savantPr={player.savant_pr} />

          {/* Plate discipline */}
          {(player.o_swing != null || player.swstr != null || player.bb_pct != null) && (
            <div>
              <h4 className="text-xs text-slate-400 mb-2">選球紀律 (Plate Discipline)</h4>
              <div className="grid grid-cols-3 gap-2">
                <MetricTile label="Chase%" value={player.o_swing} decimals={1} />
                <MetricTile label="Z-Swing%" value={player.z_swing} decimals={1} />
                <MetricTile label="SwStr%" value={player.swstr} decimals={1} />
                <MetricTile label="CSW%" value={player.csw} decimals={1} />
                <MetricTile label="BB%" value={player.bb_pct} decimals={1} />
                <MetricTile label="K%" value={player.k_pct} decimals={1} />
              </div>
            </div>
          )}

          {/* Per-category verdicts */}
          <div>
            <h4 className="text-xs text-slate-400 mb-2">各類別預測</h4>
            <div className="space-y-2">
              {Object.entries(player.verdicts || {}).map(([cat, verdict]) => (
                <VerdictCard key={cat} category={cat} verdict={verdict} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SavantPage() {
  const settings = loadSettings()
  const [names, setNames] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function handleAnalyze() {
    const nameList = names.split('\n').map(s => s.trim()).filter(Boolean)
    if (!nameList.length) {
      setError('請輸入球員名字')
      return
    }
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
          <p className="text-xs text-slate-400">分析擊球品質，預測各類別走勢</p>
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
