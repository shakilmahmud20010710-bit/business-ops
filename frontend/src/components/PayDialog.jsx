import { useEffect, useState } from 'react'

import { api, money } from '../lib/api'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Mark an invoice or bill paid (US-11, FR-17).
 * Settling a document creates the transaction that clears it, so the money lands in the
 * ledger exactly once and the document can be traced to the payment.
 */
export function PayDialog({ doc, kind, accounts, categories, onClose, onPaid }) {
  const wanted = kind === 'invoice' ? 'income' : 'expense'
  const usable = categories.filter((c) => c.type === wanted)

  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [paidOn, setPaidOn] = useState(today())
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (accounts[0]) setAccountId(String(accounts[0].id))
    if (usable[0]) setCategoryId(String(usable[0].id))
  }, [accounts, categories]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const body = { account_id: Number(accountId), category_id: Number(categoryId), paid_on: paidOn }
    try {
      const res = kind === 'invoice'
        ? await api.payInvoice(doc.id, body)
        : await api.payBill(doc.id, body)
      onPaid(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const who = doc.customer_name ?? doc.supplier_name

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Mark as paid">
        <div className="modal__head">
          <h2>Mark as paid</h2>
          <span className="label">{kind}</span>
        </div>

        <p style={{ marginTop: 0 }}>
          <strong>{who}</strong> — {money(doc.amount_minor)}
          {doc.number ? ` (${doc.number})` : ''}
          {doc.days_overdue > 0 && (
            <span className="chip chip--late" style={{ marginLeft: 8 }}>
              {doc.days_overdue} days overdue
            </span>
          )}
        </p>
        <p className="formnote" style={{ marginTop: 0 }}>
          This records a {wanted === 'income' ? 'money-in' : 'money-out'} transaction for the
          full amount and links it to this {kind}.
        </p>

        <form onSubmit={onSubmit} className="stack" style={{ gap: 16, marginTop: 18 }}>
          <label className="field">
            <span className="label">Date paid</span>
            <input type="date" max={today()} value={paidOn}
                   onChange={(e) => setPaidOn(e.target.value)} required />
          </label>

          <label className="field">
            <span className="label">{wanted === 'income' ? 'Paid into' : 'Paid from'}</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>

          <label className="field">
            <span className="label">Category</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              {usable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          {error && <div className="formerror">{error}</div>}

          <div className="modal__actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Recording…' : 'Record payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
