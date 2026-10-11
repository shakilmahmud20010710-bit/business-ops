import { useCallback, useState } from 'react'

import { Page } from '../components/Page'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useAsync } from '../lib/useAsync'

/** Who has access to this business (owner only). */
export function Staff() {
  const { user } = useAuth()
  const [nonce, setNonce] = useState(0)
  const [adding, setAdding] = useState(false)
  const [issued, setIssued] = useState(null)   // {name, email, temporary_password}
  const [error, setError] = useState(null)
  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  const people = useAsync(() => api.staff(), [nonce])

  async function act(fn, person, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return
    setError(null)
    try {
      const res = await fn(person.id)
      if (res?.temporary_password) {
        setIssued({ name: person.name, email: person.email, temporary_password: res.temporary_password })
      }
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Page
      title="Staff"
      subtitle="Who can sign in to this business"
      actions={<button className="btn btn--primary" onClick={() => setAdding(true)}>+ Add staff</button>}
    >
      {error && <div className="formerror">{error}</div>}

      {issued && (
        <div className="panel panel--accent">
          <div className="panel__body">
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              Temporary password for {issued.name}
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ fontSize: 18, background: 'var(--bo-surface-2)', padding: '6px 12px' }}>
                {issued.temporary_password}
              </code>
              <span className="formnote">
                Pass this to {issued.email} and ask them to change it from their profile page.
                It will not be shown again.
              </span>
              <button className="btn btn--sm" onClick={() => setIssued(null)}>Dismiss</button>
            </div>
          </div>
        </div>
      )}

      <section className="panel">
        <table className="ledger">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th className="right">Manage</th></tr>
          </thead>
          <tbody>
            {people.loading && <tr><td colSpan={5} className="center muted">Loading…</td></tr>}
            {(people.data ?? []).map((p) => (
              <tr key={p.id} style={p.is_active ? undefined : { opacity: 0.55 }}>
                <td>{p.name}{p.id === user.id && <span className="chip" style={{ marginLeft: 8 }}>you</span>}</td>
                <td className="muted">{p.email}</td>
                <td><span className="chip">{p.role}</span></td>
                <td>{p.is_active ? 'Active' : 'Deactivated'}</td>
                <td className="right">
                  <div className="rowactions">
                    <button className="btn btn--sm"
                            onClick={() => act(api.resetStaffPassword, p,
                              `Reset ${p.name}'s password to the temporary one?`)}>
                      Reset password
                    </button>
                    {p.id !== user.id && (p.is_active ? (
                      <button className="btn btn--sm btn--danger"
                              onClick={() => act(api.deactivateStaff, p,
                                `Deactivate ${p.name}? They lose access, but the transactions they recorded stay in the ledger.`)}>
                        Deactivate
                      </button>
                    ) : (
                      <button className="btn btn--sm" onClick={() => act(api.reactivateStaff, p)}>
                        Reactivate
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="formnote">
        Deactivated rather than deleted: removing an account would orphan the transactions
        it recorded, and the ledger is the one place history must not change.
      </div>

      {adding && (
        <AddStaff
          onClose={() => setAdding(false)}
          onCreated={(res) => { setAdding(false); setIssued(res); refresh() }}
        />
      )}
    </Page>
  )
}

function AddStaff({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('staff')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      onCreated(await api.createStaff({ name: name.trim(), email: email.trim(), role }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <div className="modal__head"><h2>Add staff</h2><span className="label">FR-20</span></div>
        <div className="stack" style={{ gap: 16 }}>
          <label className="field">
            <span className="label">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span className="label">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="they sign in with this" required />
          </label>
          <label className="field">
            <span className="label">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="staff">Staff — can record transactions only</option>
              <option value="owner">Owner — full access</option>
            </select>
          </label>
          <p className="formnote" style={{ margin: 0 }}>
            A temporary password is generated and shown to you once. Pass it on, and ask
            them to change it from their profile page.
          </p>
          {error && <div className="formerror">{error}</div>}
          <div className="modal__actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
