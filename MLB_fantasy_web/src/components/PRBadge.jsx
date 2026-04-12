/**
 * Color-coded badge displaying a PR (percentile rank) value
 */
export default function PRBadge({ value, size = 'sm' }) {
  if (value === null || value === undefined) {
    return (
      <span className={`pr-na inline-block rounded px-1 text-center font-mono ${size === 'lg' ? 'text-base px-2 py-0.5' : 'text-xs'}`}>
        —
      </span>
    )
  }

  let cls = 'pr-poor'
  if (value >= 80) cls = 'pr-elite'
  else if (value >= 60) cls = 'pr-good'
  else if (value >= 40) cls = 'pr-average'
  else if (value >= 20) cls = 'pr-below'

  return (
    <span className={`${cls} inline-block rounded px-1 text-center font-mono font-semibold ${size === 'lg' ? 'text-base px-2 py-0.5' : 'text-xs'}`}>
      {value.toFixed(0)}
    </span>
  )
}
