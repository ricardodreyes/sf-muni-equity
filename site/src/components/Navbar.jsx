import { NavLink } from 'react-router-dom'
import { useTheme } from '../ThemeContext'

const links = [
  { to: '/', label: 'Investigation' },
  { to: '/live', label: 'Live', live: true },
  { to: '/explorer', label: 'Explorer' },
  { to: '/rankings', label: 'Rankings' },
  { to: '/methodology', label: 'Methodology' },
]

export default function Navbar() {
  const { dark, toggle } = useTheme()

  return (
    <nav className="border-b border-[var(--border)] bg-[var(--paper)] sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-5 flex items-center justify-between h-12">
        <NavLink to="/" className="no-underline flex items-center gap-2">
          <span className="text-[13px] font-bold tracking-tight text-[var(--ink)]" style={{ fontFamily: 'var(--font-serif)' }}>
            SF Muni Equity Tracker
          </span>
        </NavLink>
        <div className="flex items-center gap-0.5">
          {links.map(({ to, label, live }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-2.5 py-1 text-[12px] font-medium no-underline transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`
              }
            >
              {live && <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] pulse-dot" />}
              {label}
            </NavLink>
          ))}
          <button
            onClick={toggle}
            className="ml-2 p-1.5 text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
            aria-label={dark ? 'Light mode' : 'Dark mode'}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              {dark ? (
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
              ) : (
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              )}
            </svg>
          </button>
        </div>
      </div>
    </nav>
  )
}
