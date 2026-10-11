import { money } from '../lib/api'

/**
 * Money in vs money out, six months (FR-13).
 * Hand-rolled SVG rather than a chart library — the shape is simple and it keeps
 * the bundle small. Renders whatever monthly_series() returns.
 */
export function BarChart({ months }) {
  if (!months?.length) return <div className="center muted">No data.</div>

  const W = 640
  const H = 220
  const PAD = { top: 16, right: 8, bottom: 30, left: 8 }
  const max = Math.max(...months.flatMap((m) => [m.money_in_minor, m.money_out_minor]), 1)
  const plotH = H - PAD.top - PAD.bottom
  const band = (W - PAD.left - PAD.right) / months.length
  const barW = Math.min(22, band / 3)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Money in versus money out by month">
      <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom}
            stroke="var(--bo-rule)" strokeWidth="1" />
      {months.map((m, i) => {
        const cx = PAD.left + band * i + band / 2
        const hIn = (m.money_in_minor / max) * plotH
        const hOut = (m.money_out_minor / max) * plotH
        return (
          <g key={m.month}>
            <rect x={cx - barW - 2} y={H - PAD.bottom - hIn} width={barW} height={hIn}
                  fill="var(--bo-accent)" />
            <rect x={cx + 2} y={H - PAD.bottom - hOut} width={barW} height={hOut}
                  fill="none" stroke="var(--bo-ink)" strokeWidth="1.5" />
            <text x={cx} y={H - 10} textAnchor="middle" fontSize="12"
                  fill="var(--bo-ink-soft)" fontFamily="var(--bo-sans)">
              {m.month.slice(5)}
            </text>
            <title>{`${m.month} — in ${money(m.money_in_minor)}, out ${money(m.money_out_minor)}`}</title>
          </g>
        )
      })}
    </svg>
  )
}
