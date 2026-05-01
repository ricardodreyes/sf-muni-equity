import { useState, useMemo } from 'react'
import { routes } from '../data/routes'
import RouteCard from './RouteCard'

const POPULAR_SHORT_IDS = ['14', '38', 'N', 'T', '22', '29', '49', '1']

export default function RouteLookup({ selectedRoute: controlledRoute, onSelectRoute }) {
  const [query, setQuery] = useState('')
  const [internalRoute, setInternalRoute] = useState(null)
  const isControlled = onSelectRoute != null
  const selectedRoute = isControlled ? controlledRoute : internalRoute

  const filtered = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return routes
      .filter(r =>
        r.route_id_short.toLowerCase().includes(q) ||
        r.route_name.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [query])

  const selectRoute = (route) => {
    if (isControlled) onSelectRoute(route)
    else setInternalRoute(route)
    setQuery('')
  }

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search routes (14, Geary, N Judah...)"
          className="w-full px-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] text-[14px] text-[var(--ink)] placeholder-[var(--muted)]/50 focus:outline-none focus:border-[var(--accent)]"
          style={{ borderRadius: '3px' }}
        />
        {filtered.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] overflow-hidden z-10" style={{ borderRadius: '3px' }}>
            {filtered.map(route => (
              <button
                key={route.route_id}
                onClick={() => selectRoute(route)}
                className="w-full text-left px-4 py-2 hover:bg-[var(--paper)] flex items-center justify-between text-[13px] transition-colors"
              >
                <span className="font-medium text-[var(--ink)]">{route.route_name}</span>
                <span className="text-[12px] text-[var(--muted)]">
                  {route.avg_delay_min}m delay
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedRoute && (
        <div className="mt-4">
          <RouteCard route={{ ...selectedRoute, total_routes: routes.length }} />
        </div>
      )}

      {!selectedRoute && !query && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--muted)] mb-2">Popular routes</p>
          <div className="flex flex-wrap gap-1.5">
            {routes
              .filter(r => POPULAR_SHORT_IDS.includes(r.route_id_short))
              .map(r => (
                <button
                  key={r.route_id}
                  onClick={() => selectRoute(r)}
                  className="px-2.5 py-1 border border-[var(--border)] text-[12px] font-medium text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--ink)] transition-colors"
                  style={{ borderRadius: '3px' }}
                >
                  {r.route_name}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
