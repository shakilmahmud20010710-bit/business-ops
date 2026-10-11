import { useState } from 'react'

import { api } from '../lib/api'

const today = () => new Date().toISOString().slice(0, 10)
const plusDays = (n) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

/**
 * Record a customer invoice or a supplier bill (US-11, FR-15).
 *
 * Recording one does NOT move any money — an unpaid document is a promise, not a
 * transaction. It only affects cash when it is marked paid, which is what keeps the
 * cash-on-hand figure honest.
 */
export function DocumentForm({ kind, onClose, onSaved }) {
  const isInvoice = kind === 'invoice'
  const [number, setNumber] = useState('')
  const [who, setWho] = useState('')
  const [amount, setAmount] = useState('')
  const [issueDate, setIssueDate] = useState(today())
  const [dueDate, setDueDate] = useState(plusDays(14))
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const saved = isInvoice
        ? await api.createInvoice({
            number: number.trim(),
            customer_name: who.trim(),
            amount,
            issue_date: issueDate,
            due_date: dueDate,
          })
        : await api.createBill({ supplier_name: who.trim(), amount, due_date: dueDate })
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <div className="modal__head">
          <h2>{isInvoice ? 'New customer invoice' : 'New supplier bill'}</h2>
          <span className="label">FR-15</span>
        </div>

        <p className="formnote" style={{ marginTop: 0, marginBottom: 20 }}>
          This records what is owed. No money moves until you mark it paid.
        </p>

        <div className="stack" style={{ gap: 16 }}>
          {isInvoice && (
            <label className="field">
              <span className="label">Invoice number</span>
              <input value={number} onChange={(e) => setNumber(e.target.value)}
                     placeholder="INV-1062" required autoFocus />
            </label>
          )}

          <label className="field">
            <span className="label">{isInvoice ? 'Customer' : 'Supplier'}</span>
            <input value={who} onChange={(e) => setWho(e.target.value)}
                   placeholder={isInvoice ? 'Who owes you' : 'Who you owe'}
                   required autoFocus={!isInvoice} />
          </label>

          <label className="field">
            <span className="label">Amount</span>
            <input inputMode="decimal" value={amount} placeholder="0.00"
                   onChange={(e) => setAmount(e.target.value)} required />
          </label>

          {isInvoice && (
            <label className="field">
              <span className="label">Issue date</span>
              <input type="date" value={issueDate}
                     onChange={(e) => setIssueDate(e.target.value)} required />
            </label>
          )}

          <label className="field">
            <span className="label">Due date</span>
            <input type="date" value={dueDate}
                   onChange={(e) => setDueDate(e.target.value)} required />
          </label>

          {error && <div className="formerror">{error}</div>}

          <div className="modal__actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Saving…' : isInvoice ? 'Record invoice' : 'Record bill'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
