import { useState } from 'react'

const ALL_BATTING  = ['H', 'HR', 'RBI', 'SB', 'AVG', 'BB', '2B', '3B', 'K', 'R', 'OBP', 'OPS']
const ALL_PITCHING = ['W', 'SV', 'ERA', 'WHIP', 'SO', 'HLD', 'BB', 'IP', 'R', 'QS', 'L']

export default function CategoryPicker({ batting, pitching, onBattingChange, onPitchingChange }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <span className="text-sm font-medium text-slate-300">計分類別設定</span>
        <span className="text-slate-400 text-xs">{expanded ? '▲ 收起' : '▼ 展開'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700 pt-3">
          <div>
            <p className="text-xs text-slate-400 mb-2">打者類別</p>
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
          <div>
            <p className="text-xs text-slate-400 mb-2">投手類別</p>
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
        </div>
      )}
    </div>
  )
}
