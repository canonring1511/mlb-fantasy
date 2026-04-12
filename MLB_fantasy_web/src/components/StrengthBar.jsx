/**
 * Horizontal bar showing team average PR per category
 */
export default function StrengthBar({ teamAvg, categories, strengths = [], weaknesses = [] }) {
  if (!teamAvg) return null

  return (
    <div className="space-y-1.5">
      {categories.map(cat => {
        const val = teamAvg[cat]
        if (val === null || val === undefined) return null
        const pct = Math.min(100, Math.max(0, val))

        let barColor = 'bg-red-600'
        if (val >= 80) barColor = 'bg-green-700'
        else if (val >= 60) barColor = 'bg-green-500'
        else if (val >= 40) barColor = 'bg-yellow-500'
        else if (val >= 20) barColor = 'bg-orange-500'

        const isStrength = strengths.includes(cat)
        const isWeakness = weaknesses.includes(cat)

        return (
          <div key={cat} className="flex items-center gap-2">
            <div className={`w-12 text-xs font-mono text-right shrink-0 ${isStrength ? 'text-green-400' : isWeakness ? 'text-red-400' : 'text-slate-300'}`}>
              {cat}
              {isStrength && ' 💪'}
              {isWeakness && ' ⚠️'}
            </div>
            <div className="flex-1 bg-slate-700 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="w-8 text-xs text-slate-400 font-mono shrink-0">
              {val.toFixed(0)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
