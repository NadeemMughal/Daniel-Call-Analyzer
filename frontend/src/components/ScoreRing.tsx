type Props = {
  score: number | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showLabel?: boolean
}

const SIZES = {
  sm: { px: 44, stroke: 4, font: 13 },
  md: { px: 64, stroke: 5, font: 18 },
  lg: { px: 96, stroke: 7, font: 26 },
  xl: { px: 140, stroke: 9, font: 40 },
}

function colorFor(s: number | null) {
  if (s === null || s === undefined) return { hex: '#64748b', name: 'N/A' }
  if (s >= 8) return { hex: '#10b981', name: 'Excellent' }
  if (s >= 6) return { hex: '#3b82f6', name: 'Good' }
  if (s >= 4) return { hex: '#f59e0b', name: 'Needs work' }
  return { hex: '#ef4444', name: 'Poor' }
}

export default function ScoreRing({ score, size = 'lg', showLabel = false }: Props) {
  const { px, stroke, font } = SIZES[size]
  const r = (px - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = score === null ? 0 : Math.max(0, Math.min(10, score)) / 10
  const offset = c - c * pct
  const { hex, name } = colorFor(score)

  return (
    <div className="inline-flex flex-col items-center gap-1.5">
      <div className="relative inline-flex items-center justify-center" style={{ width: px, height: px }}>
        <svg width={px} height={px} className="-rotate-90">
          <circle
            cx={px / 2} cy={px / 2} r={r}
            fill="none" stroke="hsl(222, 32%, 18%)" strokeWidth={stroke}
          />
          <circle
            cx={px / 2} cy={px / 2} r={r}
            fill="none" stroke={hex} strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.34, 1.56, 0.64, 1)', filter: `drop-shadow(0 0 6px ${hex}55)` }}
          />
        </svg>
        <span
          className="absolute font-bold"
          style={{ color: hex, fontSize: font }}
        >
          {score === null ? '–' : score.toFixed(1)}
        </span>
      </div>
      {showLabel && (
        <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: hex }}>{name}</span>
      )}
    </div>
  )
}
