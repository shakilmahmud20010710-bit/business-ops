import { createContext, useCallback, useContext, useEffect, useState } from 'react'

import { api, getToken, setToken } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)

  // A token in storage proves nothing — it may be expired or from a rebuilt database.
  // Ask the server who it belongs to before trusting it.
  useEffect(() => {
    if (!getToken()) {
      setChecking(false)
      return
    }
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setChecking(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password)
    setToken(res.access_token)
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const me = await api.me()
    setUser(me)
    return me
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, checking, login, logout, refreshUser, isOwner: user?.role === 'owner' }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
