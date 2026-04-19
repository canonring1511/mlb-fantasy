import PRBadge from './PRBadge'

function prTotalColor(v) {
  if (!v && v !== 0) return 'text-slate-400'
  const cats = 9  // rough baseline: ~50 PR avg × 9 cats = 450
  const avg = v / Math.max(cats, 1)
  if (avg >= 70) return 'text-green-400'
  if (avg >= 50) return 'text-yellow-400'
  if (avg >= 30) return 'text-orange-400'
  return 'text-red-400'
}

/**
 * Horizontal-scroll table showing PR values per player per category.
 * Shows Team + Pos under player name; PR_Total at the far right.
 */
export default function PRTable({ rows, categories }) {
  if (!rows || rows.length === 0) return null

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full min-w-max text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left py-2 pr-3 font-medium text-slate-400 sticky left-0 bg-slate-900 min-w-[120px]">
              球員
            </th>
            {categories.map(cat => (
              <th key={cat} className="text-center py-2 px-1 font-medium text-slate-400 min-w-[44px]">
                {cat}
              </th>
            ))}
            <th className="text-center py-2 px-2 font-medium text-slate-400 min-w-[52px] border-l border-slate-700">
              總PR
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const meta = [row.Team, row.Pos].filter(Boolean).join(' · ')
            return (
              <tr key={i} className="border-b border-slate-800">
                <td className="py-2 pr-3 sticky left-0 bg-slate-900 min-w-[120px]">
                  <div className="text-slate-200 text-xs font-medium truncate max-w-[120px]">{row.Name}</div>
                  {meta && (
                    <div className="text-slate-500 text-[10px] leading-tight truncate max-w-[120px]">{meta}</div>
                  )}
                </td>
                {categories.map(cat => (
                  <td key={cat} className="text-center py-1.5 px-0.5">
                    <PRBadge value={row[cat]} />
                  </td>
                ))}
                <td className="text-center py-1.5 px-2 border-l border-slate-700">
                  <span className={`text-xs font-bold font-mono ${prTotalColor(row.PR_Total)}`}>
                    {row.PR_Total != null ? Math.round(row.PR_Total) : '—'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
