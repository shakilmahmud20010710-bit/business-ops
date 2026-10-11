import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Page } from '../components/Page'
import { TransactionForm } from '../components/TransactionForm'
import { api, getToken, money } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useAsync } from '../lib/useAsync'

export function Transactions() {
  const { isOwner } = useAuth()
  // Arriving from a dashboard tile pre-fills the filters, so the number you clicked and
  // the rows you land on are the same set (FR-21).
  const [params] = useSearchParams()
  const [type, setType] = useState(params.get('type') ?? '')
  const [categoryId, setCategoryId] = useState(params.get('category_id') ?? '')
  const [from, setFrom] = useState(params.get('from') ?? '')
  const [to, setTo] = useState(params.get('to') ?? '')
  const [nonce, setNonce] = useState(0)          // bumped to force a refetch after a write
  const [editing, setEditing] = useState(null)   // null | 'new' | transaction
  const [history, setHistory] = useState(null)

  const categories = useAsync(() => api.categories())
  const accounts = useAsync(() => api.accounts())
  const result = useAsync(
    () => api.transactions({ type, category_id: categoryId, from, to, limit: 50 }),
    [type, categoryId, from, to, nonce],
  )

  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  const items = result.data?.items ?? []

  async function remove(t) {
    if (!window.confirm(`Delete "${t.description}"? This cannot be undone.`)) return
    try {
      await api.deleteTransaction(t.id)
      refresh()
    } catch (err) {
      window.alert(err.message)
    }
  }

  function exportCsv() {
    // The export is an authenticated GET, so it can't be a plain link — fetch it with the
    // token, then hand the browser a blob to save.
    fetch(api.exportUrl({ from, to }), { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('Export failed'))))
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `transactions_${from || 'all'}_${to || 'all'}.csv`
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch((err) => window.alert(err.message))
  }

  return (
    <Page
      title="Transactions"
      subtitle={result.data ? `${result.data.total} records` : 'Loading…'}
      actions={
        <div style={{ display: 'flex', gap: 10 }}>
          {isOwner && <button className="btn" onClick={exportCsv}>Export CSV</button>}
          <button className="btn btn--primary" onClick={() => setEditing('new')}>
            + New transaction
          </button>
        </div>
      }
    >
      <section className="panel">
        <div className="panel__head">
          <h2>Filter</h2>
          <span className="label">FR-09</span>
        </div>
        <div className="panel__body" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Select label="Type" value={type} onChange={setType}
                  options={[['', 'All'], ['income', 'Money in'], ['expense', 'Money out']]} />
          <Select label="Category" value={categoryId} onChange={setCategoryId}
                  options={[['', 'All'], ...(categories.data ?? []).map((c) => [String(c.id), c.name])]} />
          <label className="field" style={{ minWidth: 160 }}>
            <span className="label">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field" style={{ minWidth: 160 }}>
            <span className="label">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="panel">
        <table className="ledger">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Account</th>
              <th className="right">Amount</th>
              <th className="right">Balance</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {result.loading && <tr><td colSpan={7} className="center muted">Loading…</td></tr>}
            {!result.loading && items.length === 0 && (
              <tr><td colSpan={7} className="center muted">Nothing matches those filters.</td></tr>
            )}
            {items.map((t) => (
              <tr key={t.id}>
                <td className="muted">{t.occurred_on}</td>
                <td>{t.description}</td>
                <td>{t.category}</td>
                <td className="muted">{t.account}</td>
                <td className={`right money ${t.type === 'income' ? 'pos' : 'neg'}`}>
                  {money(t.signed_minor, { sign: t.type === 'income' })}
                </td>
                <td className="right money" style={{ fontWeight: 600 }}>
                  {money(t.balance_after_minor)}
                </td>
                <td className="right">
                  <div className="rowactions">
                    <button className="btn btn--sm" onClick={() => setHistory(t)}>History</button>
                    <button className="btn btn--sm" onClick={() => setEditing(t)}>Edit</button>
                    {isOwner && (
                      <button className="btn btn--sm btn--danger" onClick={() => remove(t)}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {history && <History txn={history} onClose={() => setHistory(null)} />}

      {editing && (
        <TransactionForm
          existing={editing === 'new' ? null : editing}
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}
    </Page>
  )
}

function History({ txn, onClose }) {
  const rows = useAsync(() => api.history(txn.id), [txn.id])
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal__head">
          <h2>Change history</h2>
          <span className="label">FR-08</span>
        </div>
        <p className="formnote" style={{ marginTop: 0 }}>
          A cash ledger that can be silently rewritten is not a record of anything, so every
          edit keeps what the row said before.
        </p>
        {rows.loading && <div className="center muted">Loading…</div>}
        {rows.data?.length === 0 && (
          <div className="center muted">This entry has never been changed.</div>
        )}
        {rows.data?.map((r) => (
          <div key={r.id} className="panel" style={{ padding: '12px 14px', marginBottom: 10 }}>
            <div className="label">{r.action} · {new Date(r.created_at).toLocaleString()}</div>
            <div style={{ marginTop: 6, fontSize: 14 }}>
              was <strong>{r.previous.description}</strong> — {money(r.previous.amount_minor)} on{' '}
              {r.previous.occurred_on}
            </div>
          </div>
        ))}
        <div className="modal__actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="field" style={{ minWidth: 180 }}>
      <span className="label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}
