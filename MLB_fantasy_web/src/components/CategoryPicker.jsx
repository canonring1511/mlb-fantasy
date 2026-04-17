import { useState } from 'react'

const ALL_BATTING  = ['H', 'HR', 'RBI', 'SB', 'AVG', 'BB', '2B', '3B', 'K', 'R', 'OBP', 'OPS']
const ALL_PITCHING = ['W', 'SV', 'ERA', 'WHIP', 'SO', 'HLD', 'BB', 'IP', 'R', 'QS', 'L']

const PERIOD_OPTIONS = [
  { value: 'season', label: '全季' },
  { value: '30d',    label: '近30天' },
  { value: '14d',    label: '近14天' },
]

/**
 * Collapsible settings panel for year, period, and per-type categories.
 * Pass showPitching=false on Savant page (batters only).
 */
export default function CategoryPicker({
  year, period, onYearChange, onPeriodChange,
  batting, pitching, onBattingChange, onPitchingChange,
  showPitching = true,
  showPeriod = true,
}) {
  const [expanded, setExpanded] = useState(false)

  const periodLabel = PERIOD_OPTIONS.find(o => o.value === period)?.label ?? period

  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <span className="text-sm font-medium text-slate-300">分析設定</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{year} · {periodLabel}</span>
          <span className="text-slate-400 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-700 pt-3">
          {/* Year & Period */}
          <div className="flex gap-3">
            <div className={showPeriod ? 'w-24 shrink-0' : 'flex-1'}>
              <label className="text-xs text-slate-400 block mb-1">賽季年份</label>
              <input
                type="number"
                value={year}
                onChange={e => onYearChange(parseInt(e.target.value) || year)}
                className="w-full bg-slate-900 text-slate-200 text-sm px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            {showPeriod && (
              <div className="flex-1">
                <label className="text-xs text-slate-400 block mb-1">時間範圍</label>
                <div className="flex rounded-lg overflow-hidden border border-slate-600">
                  {PERIOD_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => onPeriodChange(o.value)}
                      className={`flex-1 py-2 text-xs font-medium transition-colors ${
                        period === o.value
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Batting categories */}
          {batting && onBattingChange && (
            <div>
              <p className="text-xs text-slate-400 mb-2">打者計分類別</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_BATTING.map(cat => (
                  <button
                    key={cat}
                    onClick={() => onBattingChange(
                      batting.includes(cat)
                        ? batting.filter(c => c !== cat)
                        : [...batting, cat]
                    )}
                    className={`px-2.5 py-1 rounded-full text-xs font-mono font-medium transition-colors ${
                      batting.includes(cat)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pitching categories */}
          {showPitching && pitching && onPitchingChange && (
            <div>
              <p className="text-xs text-slate-400 mb-2">投手計分類別</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_PITCHING.map(cat => (
                  <button
                    key={cat}
                    onClick={() => onPitchingChange(
                      pitching.includes(cat)
                        ? pitching.filter(c => c !== cat)
                        : [...pitching, cat]
                    )}
                    className={`px-2.5 py-1 rounded-full text-xs font-mono font-medium transition-colors ${
                      pitching.includes(cat)
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
