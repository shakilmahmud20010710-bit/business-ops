import { Page } from '../components/Page'
import { Tile } from '../components/Tile'
import { Pending } from '../components/Pending'
import { BarChart } from '../components/BarChart'
import { api, money } from '../lib/api'
import { useAsync } from '../lib/useAsync'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December']

/** The month the figures on this page cover.
 *
 * Derived from the period the server reports, not from the clock and never hardcoded:
 * both were literal "September 2026" until the calendar rolled over and the page began
 * labelling October's figures as September's.
 */
function periodMonth(summary) {
  const iso = summary?.period_start
  if (!iso) return ''
  const [y, m] = iso.split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

export function Dashboard() {
  const summary = useAsync(() => api.summary())
  const monthly = useAsync(() => api.monthly(6))
  const categories = useAsync(() => api.byCategory())
  const upcoming = useAsync(() => api.upcoming())
  const balances = useAsync(() => api.balances())

  const s = summary.data
  const totalCash = (balances.data ?? []).reduce((acc, a) => acc + a.balance_minor, 0)

  return (
    <Page
      title="Dashboard"
      subtitle={periodMonth(s)}
      actions={<span className="label">Updated just now</span>}
    >
      <div className="cols-4">
        <Tile
          label="Cash on hand"
          value={balances.loading ? '—' : money(totalCash)}
          note={`across ${balances.data?.length ?? 0} accounts`}
          lead
          to="/accounts"
        />
        <Tile label="Money in" value={s ? money(s.money_in_minor) : '—'} note="this month"
              to={`/transactions?type=income&from=${s?.period_start ?? ''}&to=${s?.period_end ?? ''}`} />
        <Tile label="Money out" value={s ? money(s.money_out_minor) : '—'} note="this month"
              to={`/transactions?type=expense&from=${s?.period_start ?? ''}&to=${s?.period_end ?? ''}`} />
        <Tile
          label="Net cash flow"
          value={s ? money(s.net_minor, { sign: s.net_minor >= 0 }) : '—'}
          note="income less expenses"
          to="/report"
        />
      </div>

      {summary.error && (
        <Pending
          title="Headline figures not computed yet"
          fn="period_totals() and cash_on_hand()"
          question="“How much cash do I have right now?” and “am I making or losing money this month?”"
        >
          <p style={{ marginTop: 8 }} className="muted">
            Cash on hand above is live — it comes from the worked example{' '}
            <code>account_balances()</code>, which shows the query shape the others need.
          </p>
        </Pending>
      )}

      <div className="cols-2">
        <section className="panel panel--accent">
          <div className="panel__head">
            <h2>Money in vs money out</h2>
            <span className="label">last 6 months</span>
          </div>
          <div className="panel__body">
            {monthly.error ? (
              <Pending
                title="Six-month trend not computed yet"
                fn="monthly_series()"
                question="“Is the business improving or slipping?”"
              />
            ) : monthly.loading ? (
              <div className="center muted">Loading…</div>
            ) : (
              <BarChart months={monthly.data.months} />
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2>Where the money went</h2>
            <span className="label">{periodMonth(s).split(' ')[0]}</span>
          </div>
          <div className="panel__body">
            {categories.error ? (
              <Pending
                title="Not computed yet"
                fn="spending_by_category()"
                question="“Where is my money going?”"
              />
            ) : (
              <CategoryList rows={categories.data?.categories ?? []} loading={categories.loading} />
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel__head">
          <h2>Due in the next 30 days</h2>
          <span className="label">receivables &amp; payables</span>
        </div>
        <div className="panel__body">
          {upcoming.error ? (
            <Pending
              title="Not computed yet"
              fn="due_next_30_days()"
              question="“Will I be short next month?” — the question the whole feature exists for."
            />
          ) : upcoming.loading ? (
            <div className="center muted">Loading…</div>
          ) : (
            <Upcoming data={upcoming.data} />
          )}
        </div>
      </section>
    </Page>
  )
}

function Upcoming({ data }) {
  const { money_in_minor, invoice_count, money_out_minor, bill_count, overdue = [] } = data
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
        <div>
          <div className="label">Money in</div>
          <div className="tile__value money pos" style={{ fontSize: 24 }}>
            {money(money_in_minor, { sign: true })}
          </div>
          <div className="tile__note">{invoice_count} unpaid customer invoices</div>
        </div>
        <div>
          <div className="label">Money out</div>
          <div className="tile__value money" style={{ fontSize: 24 }}>
            {money(-money_out_minor)}
          </div>
          <div className="tile__note">{bill_count} unpaid supplier bills</div>
        </div>
      </div>

      {overdue.length > 0 && (
        <table className="ledger">
          <tbody>
            {overdue.slice(0, 6).map((o) => (
              <tr key={`${o.type}-${o.id}`}>
                <td>
                  <div>{o.customer_name ?? o.supplier_name}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {o.number ?? 'supplier bill'}
                  </div>
                </td>
                <td className="right">
                  <div className="money">{money(o.amount_minor)}</div>
                  <div style={{ marginTop: 3 }}>
                    <span className="chip chip--late">{o.days_overdue} days overdue</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function CategoryList({ rows, loading }) {
  if (loading) return <div className="center muted">Loading…</div>
  if (!rows.length) return <div className="center muted">Nothing recorded this month.</div>
  const max = Math.max(...rows.map((r) => r.total_minor), 1)
  return (
    <div className="stack" style={{ gap: 16 }}>
      {rows.map((r) => (
        <div key={r.category}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span>{r.category}</span>
            <span className="money">{money(r.total_minor)}</span>
          </div>
          <div className="meter">
            <div className="meter__fill" style={{ width: `${(r.total_minor / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
