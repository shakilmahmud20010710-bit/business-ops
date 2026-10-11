import { useState } from 'react'

import { Page } from '../components/Page'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

/** Your own account: name, email and password. */
export function Profile() {
  const { user, refreshUser } = useAuth()

  return (
    <Page title="Your profile" subtitle={`Signed in as ${user.email}`}>
      <div className="cols-2" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
        <DetailsCard user={user} onSaved={refreshUser} />
        <PasswordCard />
      </div>
    </Page>
  )
}

function DetailsCard({ user, onSaved }) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [state, setState] = useState({ busy: false, error: null, done: false })

  async function submit(e) {
    e.preventDefault()
    setState({ busy: true, error: null, done: false })
    try {
      await api.updateMe({ name: name.trim(), email: email.trim() })
      await onSaved()
      setState({ busy: false, error: null, done: true })
    } catch (err) {
      setState({ busy: false, error: err.message, done: false })
    }
  }

  return (
    <section className="panel panel--accent">
      <div className="panel__head">
        <h2>Your details</h2>
        <span className="label">{user.role}</span>
      </div>
      <form className="panel__body stack" style={{ gap: 16 }} onSubmit={submit}>
        <label className="field">
          <span className="label">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span className="label">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <p className="formnote" style={{ margin: 0 }}>
          Your email is also your sign-in name, so changing it changes how you log in.
        </p>
        {state.error && <div className="formerror">{state.error}</div>}
        {state.done && <div className="formnote" style={{ color: 'var(--bo-positive)' }}>Saved.</div>}
        <div>
          <button className="btn btn--primary" disabled={state.busy}>
            {state.busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </section>
  )
}

function PasswordCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [state, setState] = useState({ busy: false, error: null, done: false })

  async function submit(e) {
    e.preventDefault()
    if (next !== confirm) {
      setState({ busy: false, error: 'The two new passwords do not match', done: false })
      return
    }
    setState({ busy: true, error: null, done: false })
    try {
      await api.changePassword({ current_password: current, new_password: next })
      setCurrent(''); setNext(''); setConfirm('')
      setState({ busy: false, error: null, done: true })
    } catch (err) {
      setState({ busy: false, error: err.message, done: false })
    }
  }

  return (
    <section className="panel">
      <div className="panel__head"><h2>Change password</h2></div>
      <form className="panel__body stack" style={{ gap: 16 }} onSubmit={submit}>
        <label className="field">
          <span className="label">Current password</span>
          <input type="password" value={current} autoComplete="current-password"
                 onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="field">
          <span className="label">New password</span>
          <input type="password" value={next} autoComplete="new-password" minLength={8}
                 onChange={(e) => setNext(e.target.value)} required />
        </label>
        <label className="field">
          <span className="label">Confirm new password</span>
          <input type="password" value={confirm} autoComplete="new-password" minLength={8}
                 onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        <p className="formnote" style={{ margin: 0 }}>
          At least 8 characters. Your current password is required so that an unattended
          screen cannot be used to lock you out.
        </p>
        {state.error && <div className="formerror">{state.error}</div>}
        {state.done && <div className="formnote" style={{ color: 'var(--bo-positive)' }}>Password changed.</div>}
        <div>
          <button className="btn btn--primary" disabled={state.busy}>
            {state.busy ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </section>
  )
}
