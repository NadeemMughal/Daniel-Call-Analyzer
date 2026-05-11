import { scoreColor } from '@/lib/utils'

interface ScoreRingProps {
  score: number | null
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: { outer: 40, stroke: 4, fontSize: 'text-xs' },
  md: { outer: 64, stroke: 5, fontSize: 'text-base' },
  lg: { outer: 96, stroke: 6, fontSize: 'text-2xl' },
}

export default function ScoreRing({ score, size = 'md' }: ScoreRingProps) {
  const { outer, stroke, fontSize } = sizes[size]
  const radius = (outer - stroke * 2) / 2
  const circumference = 2 * Math.PI * radius
  const pct = score !== null ? score / 10 : 0
  const offset = circumference - pct * circumference

  const color = score === null ? '#d1d5db' : score >= 8 ? '#16a34a' : score >= 6 ? '#d97706' : '#dc2626'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: outer, height: outer }}>
      <svg width={outer} height={outer} className="-rotate-90">
        <circle
          cx={outer / 2}
          cy={outer / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={stroke}
        />
        <circle
          cx={outer / 2}
          cy={outer / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <span className={`absolute font-bold ${fontSize} ${scoreColor(score)}`}>
        {score !== null ? score.toFixed(1) : '—'}
      </span>
    </div>
  )
}
