import { useState } from 'react'

import { useAuth } from '../lib/auth'

export function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('rakib@businessops.dev')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="signin">
      <div className="signin__card">
        <div className="brand" style={{ marginBottom: 6 }}>
          <span className="brand__rule" />
          <span className="brand__name">BusinessOps</span>
        </div>
        <p className="muted" style={{ marginTop: 0, marginBottom: 26 }}>
          Sign in to see where your money is.
        </p>

        <form onSubmit={onSubmit} className="stack" style={{ gap: 16 }}>
          <label className="field">
            <span className="label">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="field">
            <span className="label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div className="formerror">{error}</div>}

          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
          Demo accounts — <code>rakib@businessops.dev</code> (owner) and{' '}
          <code>shopna@businessops.dev</code> (staff). Password <code>password123</code>.
        </p>
      </div>
    </div>
  )
}
