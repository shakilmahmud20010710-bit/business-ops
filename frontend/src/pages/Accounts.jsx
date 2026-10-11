import { Page } from '../components/Page'
import { api, money } from '../lib/api'
import { useAsync } from '../lib/useAsync'

export function Accounts() {
  const balances = useAsync(() => api.balances())
  const rows = balances.data ?? []
  const total = rows.reduce((acc, a) => acc + a.balance_minor, 0)

  return (
    <Page title="Accounts" subtitle="Opening balance plus every transaction recorded against it">
      <section className="panel panel--accent">
        <table className="ledger">
          <thead>
            <tr>
              <th>Account</th>
              <th>Type</th>
              <th className="right">Opening balance</th>
              <th className="right">Current balance</th>
            </tr>
          </thead>
          <tbody>
            {balances.loading && <tr><td colSpan={4} className="center muted">Loading…</td></tr>}
            {rows.map((a) => (
              <tr key={a.account_id}>
                <td>{a.name}</td>
                <td className="muted">{a.type ?? '—'}</td>
                <td className="right money muted">{money(a.opening_balance_minor)}</td>
                <td className="right money"><strong>{money(a.balance_minor)}</strong></td>
              </tr>
            ))}
            {!balances.loading && rows.length > 0 && (
              <tr>
                <td colSpan={3} className="right label">Total cash on hand</td>
                <td className="right money"><strong>{money(total)}</strong></td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="callout">
        <div className="callout__title">This figure is derived, never stored</div>
        <p>
          Design decision 4. The balance above is recomputed from the transaction rows on every
          request, so it cannot drift out of step with the ledger. <code>account_balances()</code>{' '}
          in <code>backend/app/cashflow.py</code> is the worked example for the rest of the module.
        </p>
      </div>
    </Page>
  )
}
