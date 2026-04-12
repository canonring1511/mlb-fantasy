import PRBadge from './PRBadge'

/**
 * Horizontal-scroll table showing PR values per player per category
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
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-800">
              <td className="py-2 pr-3 text-slate-200 sticky left-0 bg-slate-900 text-xs font-medium truncate max-w-[120px]">
                {row.Name}
              </td>
              {categories.map(cat => (
                <td key={cat} className="text-center py-1.5 px-0.5">
                  <PRBadge value={row[cat]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
