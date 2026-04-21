import { useState } from 'react'
import { analyzeSavant } from '../api'
import { loadSettings, saveSettings } from '../store'
import LoadingSpinner from '../components/LoadingSpinner'
import CategoryPicker from '../components/CategoryPicker'

// ── Batter PR sections ─────────────────────────────────────
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

// ── Pitcher PR sections ────────────────────────────────────
const PITCHER_PR_SECTIONS = [
  {
    title: '★ 三振能力（信號 — 小樣本可信）',
    stable: true,
    metrics: [
      { key: 'SwStr%', label: 'SwStr%★', rawKey: 'swstr', fmt: v => v.toFixed(1) + '%',
        formula: '揮空 ÷ 總投球數，最快穩定的核心指標' },
      { key: 'CSW%',   label: 'CSW%',    rawKey: 'csw',   fmt: v => v.toFixed(1) + '%',
        formula: '(揮空 + 好球帶內稱好球) ÷ 總投球數' },
      { key: 'K%',     label: 'K%',      rawKey: 'k_pct', fmt: v => v.toFixed(1) + '%',
        formula: '三振率，略受捕手接球影響' },
      { key: 'Whiff%', label: 'Whiff%',  rawKey: 'whiff', fmt: v => v.toFixed(1) + '%',
        formula: '揮空 ÷ 揮棒數（注意：不如 SwStr% 純粹）' },
    ],
  },
  {
    title: '控球能力（信號）',
    stable: true,
    metrics: [
      { key: 'BB%↓', label: 'BB%↓', rawKey: 'bb_pct', fmt: v => v.toFixed(1) + '%',
        formula: '保送率（越低越好）', lowerBetter: true },
    ],
  },
  {
    title: '被擊球品質（噪音 — 需大樣本）',
    stable: false,
    metrics: [
      { key: 'HH%↓',   label: 'HH%↓',   rawKey: 'hh',    fmt: v => v.toFixed(1) + '%',
        formula: '被強擊球率（出球速 ≥95mph），越低越好', lowerBetter: true },
      { key: 'Brl%↓',  label: 'Brl%↓',  rawKey: 'brl',   fmt: v => v.toFixed(1) + '%',
        formula: '被 Barrel 率，越低越好', lowerBetter: true },
      { key: 'EV↓',    label: 'EV↓',     rawKey: 'ev',    fmt: v => v.toFixed(1) + ' mph',
        formula: '被擊球平均出球速度，越低越好', lowerBetter: true },
      { key: 'xwOBA↓', label: 'xwOBA↓', rawKey: 'xwoba', fmt: v => v.toFixed(3),
        formula: '對手預期加權上壘率，越低越好', lowerBetter: true },
    ],
  },
  {
    title: '預期數據（噪音 — 需 50+ IP）',
    stable: false,
    metrics: [
      { key: 'xBA↓', label: 'xBA↓', rawKey: 'xba', fmt: v => v.toFixed(3),
        formula: '對手預期打擊率，需大樣本才可信', lowerBetter: true },
    ],
  },
]

// ── Shared helpers ─────────────────────────────────────────
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

// ── Batter PR chart ────────────────────────────────────────
function SavantPRChart({ savantPr, player }) {
  const pr = savantPr || {}

  return (
    <div className="space-y-2">
      <h4 className="text-xs text-slate-400">進階數據 PR（vs 全聯盟）</h4>
      {PR_SECTIONS.map(section => (
        <div key={section.title}>
          <div className="text-[10px] font-semibold text-slate-500 mb-0.5 uppercase tracking-wide">
            {section.title}
          </div>
          <div>
            {section.metrics.map(({ key, label, rawKey, fmt, formula }) => {
              const prVal  = pr[key]
              const raw    = player?.[rawKey]
              const hasPr  = prVal !== null && prVal !== undefined
              const hasRaw = raw !== null && raw !== undefined && !Number.isNaN(raw)
              const pct    = hasPr ? Math.min(100, Math.max(0, prVal)) : 0
              return (
                <div key={key} className="mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 shrink-0 text-right">
                      <span className="text-xs font-mono text-slate-300 leading-none">{label}</span>
                    </div>
                    <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                      {hasPr ? (
                        <div
                          className={`h-full rounded-full transition-all ${prBarColor(prVal)}`}
                          style={{ width: `${pct}%` }}
                        />
                      ) : (
                        <div className="h-full rounded-full bg-slate-600 opacity-30" style={{ width: '100%' }} />
                      )}
                    </div>
                    <div className="w-7 shrink-0 text-right">
                      <span className={`text-xs font-mono font-bold leading-none ${hasPr ? prTextColor(prVal) : 'text-slate-600'}`}>
                        {hasPr ? prVal.toFixed(0) : '—'}
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

// ── Pitcher PR chart ───────────────────────────────────────
// Always renders all sections/metrics; shows "—" for missing data.
function PitcherPRChart({ savantPr, player }) {
  const pr = savantPr || {}

  return (
    <div className="space-y-2">
      <h4 className="text-xs text-slate-400">投手 Savant PR（vs 全聯盟投手）</h4>
      {PITCHER_PR_SECTIONS.map(section => (
        <div key={section.title}>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${section.stable ? 'text-green-500' : 'text-orange-400'}`}>
              {section.title}
            </span>
            {!section.stable && (
              <span className="text-[9px] text-orange-400 bg-orange-900/30 px-1 rounded">小樣本為噪音</span>
            )}
          </div>
          <div>
            {section.metrics.map(({ key, label, rawKey, fmt, formula }) => {
              const prVal = pr[key]
              const raw   = player?.[rawKey]
              const hasPr  = prVal !== null && prVal !== undefined
              const hasRaw = raw !== null && raw !== undefined && !Number.isNaN(Number(raw))
              const pct   = hasPr ? Math.min(100, Math.max(0, prVal)) : 0
              return (
                <div key={key} className="mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 shrink-0 text-right">
                      <span className="text-xs font-mono text-slate-300 leading-none">{label}</span>
                    </div>
                    <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                      {hasPr ? (
                        <div
                          className={`h-full rounded-full transition-all ${prBarColor(prVal)}`}
                          style={{ width: `${pct}%` }}
                        />
                      ) : (
                        <div className="h-full rounded-full bg-slate-600 opacity-30" style={{ width: '100%' }} />
                      )}
                    </div>
                    <div className="w-7 shrink-0 text-right">
                      <span className={`text-xs font-mono font-bold leading-none ${hasPr ? prTextColor(prVal) : 'text-slate-600'}`}>
                        {hasPr ? prVal.toFixed(0) : '—'}
                      </span>
                    </div>
                    <div className="w-16 shrink-0 text-right">
                      <span className="text-xs text-slate-500 font-mono leading-none">
                        {hasRaw ? fmt(Number(raw)) : '—'}
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

// ── Verdict card (shared) ──────────────────────────────────
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

// ── Batter player card ─────────────────────────────────────
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
          {player.summary && (
            <div className="bg-slate-700 rounded-xl p-3">
              <p className="text-slate-300 text-sm leading-relaxed">{player.summary}</p>
            </div>
          )}
          <SavantPRChart savantPr={player.savant_pr} player={player} />
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

// ── Pitcher player card ────────────────────────────────────
function PitcherCard({ player }) {
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
            <div className="text-red-400 text-xs">找不到 Savant 投手數據</div>
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
          {player.summary && (
            <div className="bg-slate-700 rounded-xl p-3">
              <p className="text-slate-300 text-sm leading-relaxed">{player.summary}</p>
            </div>
          )}

          {/* Small sample notice */}
          <div className="bg-orange-900/20 border border-orange-800 rounded-xl px-3 py-2">
            <p className="text-orange-300 text-xs leading-relaxed">
              ⚠️ 賽季初小樣本：優先參考 <strong>SwStr%</strong> 與 <strong>CSW%</strong>（信號穩定快）。
              被擊球數據（HardHit、Barrel、xwOBA）在 50 IP 前為噪音，請謹慎解讀。
            </p>
          </div>

          <PitcherPRChart savantPr={player.savant_pr} player={player} />

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

// ── Page ──────────────────────────────────────────────────
export default function SavantPage() {
  const [year, setYear]           = useState(() => loadSettings().savantYear || new Date().getFullYear())
  const [playerType, setPlayerType] = useState('batter')  // 'batter' | 'pitcher'
  const [batterNames, setBatterNames] = useState('')
  const [pitcherNames, setPitcherNames] = useState('')
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState('')

  function handleYearChange(y) {
    setYear(y)
    saveSettings({ ...loadSettings(), savantYear: y })
  }

  function handleTypeChange(t) {
    setPlayerType(t)
    setResult(null)
    setError('')
  }

  async function handleAnalyze() {
    const names = (playerType === 'batter' ? batterNames : pitcherNames)
      .split('\n').map(s => s.trim()).filter(Boolean)
    if (!names.length) { setError('請輸入球員名字'); return }
    setError('')
    setLoading(true)
    try {
      const data = await analyzeSavant(names, year, playerType)
      setResult(data.players)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  const typeLabel = playerType === 'batter' ? '擊球品質、跑壘速度、揮棒力學全面 PR 排名' : 'SwStr%、CSW%、被擊球品質 PR 排名'

  return (
    <div className="page-content">
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-white">Savant 運氣分析</h1>
          <p className="text-xs text-slate-400">{year} · {typeLabel}</p>
        </div>

        {/* Batter / Pitcher tab */}
        <div className="flex rounded-xl overflow-hidden border border-slate-700">
          <button
            onClick={() => handleTypeChange('batter')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${playerType === 'batter' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
          >
            ⚾ 打者分析
          </button>
          <button
            onClick={() => handleTypeChange('pitcher')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${playerType === 'pitcher' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
          >
            🥎 投手分析
          </button>
        </div>

        {/* Name input */}
        <div className="bg-slate-800 rounded-xl p-3">
          {playerType === 'batter' ? (
            <textarea
              value={batterNames}
              onChange={e => setBatterNames(e.target.value)}
              placeholder={"每行一個打者名字\nAaron Judge\nShohei Ohtani\nFreddie Freeman"}
              rows={6}
              className="w-full bg-slate-900 text-slate-200 text-sm p-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500 resize-none"
            />
          ) : (
            <>
              <p className="text-xs text-orange-300 mb-2">
                ⚠️ 賽季初重點看 SwStr% 和 CSW%，被擊球數據（xwOBA、HardHit%）在 50 IP 前為噪音
              </p>
              <textarea
                value={pitcherNames}
                onChange={e => setPitcherNames(e.target.value)}
                placeholder={"每行一個投手名字\nGerrit Cole\nZack Wheeler\nCorbin Burnes"}
                rows={6}
                className="w-full bg-slate-900 text-slate-200 text-sm p-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500 resize-none"
              />
            </>
          )}
        </div>

        {/* Year picker */}
        <CategoryPicker
          year={year} onYearChange={handleYearChange}
          showPeriod={false} showBatting={false} showPitching={false}
        />

        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-base transition-colors"
        >
          {loading ? '分析中...' : playerType === 'batter' ? '📊 Savant 打者分析' : '📊 Savant 投手分析'}
        </button>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 text-sm rounded-xl p-3">
            {error}
          </div>
        )}

        {loading && (
          <LoadingSpinner message={playerType === 'batter' ? '正在下載 Baseball Savant 打者數據...' : '正在下載 Baseball Savant 投手數據...'} />
        )}

        {result && !loading && (
          <div className="space-y-3">
            {result.map((player, i) =>
              playerType === 'batter'
                ? <PlayerCard key={i} player={player} />
                : <PitcherCard key={i} player={player} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
