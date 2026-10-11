import { useEffect, useState } from 'react'

import { api } from '../lib/api'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Record or correct a transaction (US-04, US-05, US-07).
 * The category list is filtered to the selected type, so an expense physically cannot
 * be filed under an income category — the backend rejects it anyway, but the form
 * shouldn't offer the mistake in the first place.
 */
export function TransactionForm({ existing, accounts, categories, onClose, onSaved }) {
  const editing = Boolean(existing)
  const [type, setType] = useState(existing?.type ?? 'expense')
  const [amount, setAmount] = useState(
    existing ? (existing.amount_minor / 100).toFixed(2) : '',
  )
  const [occurredOn, setOccurredOn] = useState(existing?.occurred_on ?? today())
  const [description, setDescription] = useState(existing?.description ?? '')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [method, setMethod] = useState(existing?.method ?? 'cash')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const usable = categories.filter((c) => c.type === type)

  // Switching type invalidates the chosen category, so reset it rather than submitting
  // a mismatch the server will reject.
  useEffect(() => {
    if (!usable.some((c) => String(c.id) === String(categoryId))) {
      setCategoryId(usable[0] ? String(usable[0].id) : '')
    }
  }, [type, categories]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(String(accounts[0].id))
  }, [accounts]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const body = {
      type,
      amount,
      occurred_on: occurredOn,
      description,
      category_id: Number(categoryId),
      account_id: Number(accountId),
      method,
    }
    try {
      const saved = editing
        ? await api.updateTransaction(existing.id, body)
        : await api.createTransaction(body)
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={editing ? 'Edit transaction' : 'New transaction'}>
        <div className="modal__head">
          <h2>{editing ? 'Edit transaction' : 'New transaction'}</h2>
          <span className="label">{editing ? `#${existing.id}` : 'US-04 / US-05'}</span>
        </div>

        <form onSubmit={onSubmit} className="stack" style={{ gap: 16 }}>
          <div className="toggle">
            <button type="button" aria-pressed={type === 'income'} onClick={() => setType('income')}>
              Money in
            </button>
            <button type="button" aria-pressed={type === 'expense'} onClick={() => setType('expense')}>
              Money out
            </button>
          </div>

          <label className="field">
            <span className="label">Amount</span>
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span className="label">Date</span>
            <input type="date" max={today()} value={occurredOn}
                   onChange={(e) => setOccurredOn(e.target.value)} required />
          </label>

          <label className="field">
            <span className="label">Category</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              {usable.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="label">Account</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="label">Description</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)}
                   placeholder="What was it for?" required />
          </label>

          <label className="field">
            <span className="label">Paid by</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="transfer">Transfer</option>
              <option value="other">Other</option>
            </select>
          </label>

          {error && <div className="formerror">{error}</div>}

          <div className="modal__actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Save transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
