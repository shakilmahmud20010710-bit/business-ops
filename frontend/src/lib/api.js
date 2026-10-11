const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8002'
const TOKEN_KEY = 'businessops.token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private browsing — the session just won't persist a reload */
  }
}

async function call(method, path, body) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 204) return null
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(payload.error ?? payload.hint ?? res.statusText)
    err.status = res.status
    err.hint = payload.hint
    throw err
  }
  return payload
}

const get = (p) => call('GET', p)
const post = (p, b) => call('POST', p, b ?? {})
const patch = (p, b) => call('PATCH', p, b)
const del = (p) => call('DELETE', p)

export const api = {
  health: () => get('/health'),

  login: (email, password) => post('/api/auth/login', { email, password }),
  me: () => get('/api/auth/me'),
  updateMe: (b) => patch('/api/auth/me', b),
  changePassword: (b) => post('/api/auth/me/password', b),
  staff: () => get('/api/auth/staff'),
  createStaff: (b) => post('/api/auth/staff', b),
  deactivateStaff: (id) => post(`/api/auth/staff/${id}/deactivate`),
  reactivateStaff: (id) => post(`/api/auth/staff/${id}/reactivate`),
  resetStaffPassword: (id) => post(`/api/auth/staff/${id}/reset-password`),

  accounts: () => get('/api/accounts'),
  balances: () => get('/api/accounts/balances'),
  createAccount: (b) => post('/api/accounts', b),
  categories: () => get('/api/categories'),
  createCategory: (b) => post('/api/categories', b),

  transactions: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null),
    ).toString()
    return get(`/api/transactions${qs ? `?${qs}` : ''}`)
  },
  createTransaction: (b) => post('/api/transactions', b),
  updateTransaction: (id, b) => patch(`/api/transactions/${id}`, b),
  deleteTransaction: (id) => del(`/api/transactions/${id}`),
  exportUrl: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return `${BASE}/api/transactions/export.csv${qs ? `?${qs}` : ''}`
  },

  invoice: (id) => get(`/api/invoices/${id}`),
  business: () => get('/api/business'),
  updateBusiness: (b) => patch('/api/business', b),

  invoices: (status) => get(`/api/invoices${status ? `?status=${status}` : ''}`),
  createInvoice: (b) => post('/api/invoices', b),
  payInvoice: (id, b) => post(`/api/invoices/${id}/pay`, b),
  bills: (status) => get(`/api/bills${status ? `?status=${status}` : ''}`),
  createBill: (b) => post('/api/bills', b),
  payBill: (id, b) => post(`/api/bills/${id}/pay`, b),

  history: (id) => get(`/api/transactions/${id}/history`),
  updateCategory: (id, b) => patch(`/api/categories/${id}`, b),
  report: (year, month) =>
    get(`/api/dashboard/report?mode=monthly&year=${year}&month=${month}`),
  dailyReport: (date) => get(`/api/dashboard/report?mode=daily&date=${date}`),
  busiestDays: (year, month) => get(`/api/dashboard/busiest-days?year=${year}&month=${month}`),

  summary: () => get('/api/dashboard/summary'),
  monthly: (months = 6) => get(`/api/dashboard/monthly?months=${months}`),
  byCategory: () => get('/api/dashboard/categories'),
  upcoming: () => get('/api/dashboard/upcoming'),
}

/** Minor units (cents) -> "$1,240.00". Mirrors backend/app/money.py::format_currency. */
export function money(minor, { sign = false } = {}) {
  if (minor === null || minor === undefined) return '—'
  const negative = minor < 0
  const whole = Math.floor(Math.abs(minor) / 100)
  const cents = String(Math.abs(minor) % 100).padStart(2, '0')
  const body = `$${whole.toLocaleString('en-AU')}.${cents}`
  if (negative) return `−${body}`
  return sign ? `+${body}` : body
}
