import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { Masthead } from './components/Masthead'
import { AuthProvider, useAuth } from './lib/auth'
import { Accounts } from './pages/Accounts'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { InvoicePreview } from './pages/InvoicePreview'
import { Receivables } from './pages/Receivables'
import { Profile } from './pages/Profile'
import { Report } from './pages/Report'
import { Staff } from './pages/Staff'
import { Transactions } from './pages/Transactions'

function Gate() {
  const { user, checking } = useAuth()
  if (checking) return <div className="center muted" style={{ paddingTop: 80 }}>Loading…</div>
  if (!user) return <Login />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Masthead />}>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="receivables" element={<Receivables />} />
          <Route path="invoices/:id" element={<InvoicePreview />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="report" element={<Report />} />
          <Route path="staff" element={<Staff />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
