import { Link } from 'react-router-dom'

/**
 * A dashboard figure. When `to` is given the whole tile becomes a link to the list that
 * produced it (FR-21) — a number you cannot drill into is a number you have to take on
 * trust, which is the opposite of what this dashboard is for.
 */
export function Tile({ label, value, note, lead = false, to }) {
  const inner = (
    <>
      <div className="label">{label}</div>
      <div className="tile__value money">{value}</div>
      {note && <div className="tile__note">{note}</div>}
      {to && <div className="tile__link">View the entries →</div>}
    </>
  )

  const className = `panel tile${lead ? ' tile--lead' : ''}${to ? ' tile--link' : ''}`
  return to ? <Link className={className} to={to}>{inner}</Link> : <div className={className}>{inner}</div>
}
