import { Link, useParams } from 'react-router-dom'

import { api, money } from '../lib/api'
import { useAsync } from '../lib/useAsync'

/**
 * A printable view of one invoice.
 *
 * Beyond the proposal's scope — FR-15 only asks that an invoice be *recorded* — but a
 * document the owner can actually send is the obvious next question, so it is built on
 * the data already held rather than as a separate feature.
 */
export function InvoicePreview() {
  const { id } = useParams()
  const state = useAsync(() => api.invoice(Number(id)), [id])
  const d = state.data

  if (state.loading) return <div className="page center muted">Loading…</div>
  if (state.error) return <div className="page"><div className="formerror">{state.error}</div></div>

  const { invoice: inv, business: biz, settled_by: settled } = d
  const overdue = inv.days_overdue > 0

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <div className="noprint" style={{ display: 'flex', justifyContent: 'space-between',
                                        alignItems: 'center', marginBottom: 22 }}>
        <Link to="/receivables" className="btn">← Back</Link>
        <button className="btn btn--primary" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>

      <article className="doc">
        <header className="doc__head">
          <div>
            <div className="doc__biz">{biz.name}</div>
            {biz.address && <div className="doc__meta">{biz.address}</div>}
            {biz.email && <div className="doc__meta">{biz.email}</div>}
            {biz.phone && <div className="doc__meta">{biz.phone}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="doc__title">Invoice</div>
            <div className="doc__number">{inv.number}</div>
            <div className={`doc__status doc__status--${inv.status}`}>
              {inv.status === 'paid' ? 'Paid' : overdue ? `${inv.days_overdue} days overdue` : 'Unpaid'}
            </div>
          </div>
        </header>

        <section className="doc__parties">
          <div>
            <div className="label">Billed to</div>
            <div className="doc__customer">{inv.customer_name}</div>
          </div>
          <div>
            <div className="label">Issued</div>
            <div>{inv.issue_date}</div>
          </div>
          <div>
            <div className="label">Due</div>
            <div>{inv.due_date}</div>
          </div>
        </section>

        <table className="doc__lines">
          <thead>
            <tr><th>Description</th><th className="right">Amount</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Services rendered
                <div className="doc__meta">Invoice {inv.number}, issued {inv.issue_date}</div>
              </td>
              <td className="right money">{money(inv.amount_minor)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="right"><strong>Total due</strong></td>
              <td className="right money doc__total">{money(inv.amount_minor)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Branch on the invoice's own status, not on whether a linked transaction
            exists — an invoice may have been settled before it was tracked here, and
            a document stamped PAID must never also say "payment due". */}
        {inv.status === 'paid' ? (
          <div className="doc__paid">
            {settled
              ? `Paid on ${settled.occurred_on} — recorded in the ledger as “${settled.description}”.`
              : 'Paid in full. Thank you.'}
          </div>
        ) : inv.status === 'cancelled' ? (
          <div className="doc__terms">This invoice has been cancelled. No payment is due.</div>
        ) : (
          <div className="doc__terms">
            Payment due by <strong>{inv.due_date}</strong>.
            {overdue && ` This invoice is ${inv.days_overdue} days overdue.`}
          </div>
        )}

        <footer className="doc__foot">
          This is a single-line invoice generated from the cash flow record. BusinessOps
          tracks what is owed; it is not a full invoicing package.
        </footer>
      </article>
    </div>
  )
}
