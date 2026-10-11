import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'

import { DocumentForm } from '../components/DocumentForm'
import { Page } from '../components/Page'
import { PayDialog } from '../components/PayDialog'
import { Pending } from '../components/Pending'
import { api, money } from '../lib/api'
import { useAsync } from '../lib/useAsync'

const VIEWS = [
  ['unpaid', 'Outstanding'],
  ['paid', 'Settled'],
  ['all', 'All'],
]

/** Invoices and bills — what is owed to you, and what you owe (US-11, FR-15 to FR-17). */
export function Receivables() {
  const [nonce, setNonce] = useState(0)
  const [view, setView] = useState('unpaid')
  const [paying, setPaying] = useState(null)
  const [creating, setCreating] = useState(null)
  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  const invoices = useAsync(() => api.invoices(), [nonce])
  const bills = useAsync(() => api.bills(), [nonce])
  const upcoming = useAsync(() => api.upcoming(), [nonce])
  const accounts = useAsync(() => api.accounts())
  const categories = useAsync(() => api.categories())

  const keep = (r) => (view === 'all' ? r.status !== 'cancelled' : r.status === view)
  // In the mixed view, what is still owed goes first — settled documents are history,
  // and burying the actionable rows under them defeats the point of the page.
  const order = (rows) =>
    [...rows].sort((a, b) => (a.status === 'paid') - (b.status === 'paid'))
  const shownInvoices = order((invoices.data ?? []).filter(keep))
  const shownBills = order((bills.data ?? []).filter(keep))
  const sum = (rows) => rows.reduce((acc, r) => acc + r.amount_minor, 0)

  // The headline count always describes what is still outstanding, whatever is on
  // screen — that is the number the owner actually acts on.
  const stillOwed = (invoices.data ?? []).filter((i) => i.status === 'unpaid').length
    + (bills.data ?? []).filter((b) => b.status === 'unpaid').length

  return (
    <Page
      title="Invoices & Bills"
      subtitle="What is owed to you, and what you owe"
      actions={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="toggle">
            {VIEWS.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={view === key}
                      onClick={() => setView(key)}>
                {label}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => setCreating('bill')}>+ New bill</button>
          <button className="btn btn--primary" onClick={() => setCreating('invoice')}>
            + New invoice
          </button>
        </div>
      }
    >
      <div className="formnote">
        {stillOwed} document{stillOwed === 1 ? '' : 's'} still outstanding.
        {view === 'paid' && ' Showing settled items — these no longer affect what is due.'}
      </div>

      <div className="cols-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Ledger
          title="Owed to you"
          note={`${shownInvoices.length} ${view === 'all' ? 'invoices' : view}`}
          total={sum(shownInvoices)}
          loading={invoices.loading}
          empty="No invoices in this view."
          rows={shownInvoices.map((i) => ({
            key: i.id,
            primary: i.customer_name,
            secondary: i.number,
            due: i.due_date,
            late: i.days_overdue,
            paid: i.status === 'paid',
            amount: i.amount_minor,
            viewHref: `/invoices/${i.id}`,
            onPay: () => setPaying({ doc: i, kind: 'invoice' }),
          }))}
          accent
        />
        <Ledger
          title="You owe"
          note={`${shownBills.length} ${view === 'all' ? 'bills' : view}`}
          total={sum(shownBills)}
          loading={bills.loading}
          empty="No bills in this view."
          rows={shownBills.map((b) => ({
            key: b.id,
            primary: b.supplier_name,
            secondary: 'supplier bill',
            due: b.due_date,
            late: b.days_overdue,
            paid: b.status === 'paid',
            amount: b.amount_minor,
            onPay: () => setPaying({ doc: b, kind: 'bill' }),
          }))}
        />
      </div>

      {creating && (
        <DocumentForm kind={creating} onClose={() => setCreating(null)}
                      onSaved={() => { setCreating(null); refresh() }} />
      )}

      {paying && (
        <PayDialog
          doc={paying.doc} kind={paying.kind}
          accounts={accounts.data ?? []} categories={categories.data ?? []}
          onClose={() => setPaying(null)}
          onPaid={() => { setPaying(null); refresh() }}
        />
      )}

      {upcoming.error && (
        <Pending
          title="The 30-day view is still to build"
          fn="due_next_30_days()"
          question="Both lists above are live."
        />
      )}
    </Page>
  )
}

function Ledger({ title, note, total, rows, loading, empty, accent = false }) {
  return (
    <section className={`panel${accent ? ' panel--accent' : ''}`}>
      <div className="panel__head">
        <h2>{title}</h2>
        <span className="label">{note}</span>
      </div>
      <table className="ledger">
        <tbody>
          {loading && <tr><td className="center muted">Loading…</td></tr>}
          {!loading && rows.length === 0 && <tr><td className="center muted">{empty}</td></tr>}
          {rows.map((r) => (
            <tr key={r.key} style={r.paid ? { opacity: 0.68 } : undefined}>
              <td>
                <div>{r.primary}</div>
                <div className="muted" style={{ fontSize: 13 }}>{r.secondary}</div>
              </td>
              <td className="right">
                <div className="money">{money(r.amount)}</div>
                <div style={{ marginTop: 4, display: 'flex', gap: 8,
                              justifyContent: 'flex-end', alignItems: 'center' }}>
                  {r.paid ? (
                    <span className="chip chip--paid">Paid</span>
                  ) : r.late > 0 ? (
                    <span className="chip chip--late">{r.late} days overdue</span>
                  ) : (
                    <span className="muted" style={{ fontSize: 13 }}>due {r.due}</span>
                  )}
                  {r.viewHref && <Link className="btn btn--sm" to={r.viewHref}>View</Link>}
                  {/* A settled document has nothing left to pay, so the action is gone
                      rather than disabled — an inert button invites a pointless click. */}
                  {!r.paid && (
                    <button className="btn btn--sm" onClick={r.onPay}>Mark paid</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!loading && rows.length > 0 && (
            <tr>
              <td className="label">Total shown</td>
              <td className="right money"><strong>{money(total)}</strong></td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}
