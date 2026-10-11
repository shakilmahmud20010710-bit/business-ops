import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '../lib/auth'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/transactions', label: 'Transactions' },
  { to: '/receivables', label: 'Invoices & Bills' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/report', label: 'Report' },
  { to: '/staff', label: 'Staff', ownerOnly: true },
]

export function Masthead() {
  const { user, logout, isOwner } = useAuth()
  const initials = (user?.name ?? '')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <div className="brand">
            <span className="brand__rule" />
            <span className="brand__name">BusinessOps</span>
          </div>

          <nav className="nav">
            {NAV.filter((i) => !i.ownerOnly || isOwner).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav__link${isActive ? ' nav__link--active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="who">
            <span className="label">
              {user?.name}
              {user?.role === 'staff' && ' · staff'}
            </span>
            <NavLink to="/profile" className="who__badge" title="Your profile">{initials}</NavLink>
            <button className="btn btn--sm" onClick={logout}>Sign out</button>
          </div>
        </div>
      </header>
      <Outlet />
    </>
  )
}
