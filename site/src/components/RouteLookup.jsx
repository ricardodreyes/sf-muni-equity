import { useState, useMemo } from 'react'
import routes from '../data/routes.json'
import RouteCard from './RouteCard'

export default function RouteLookup({ initialRouteId = null }) {
  const [query, setQuery] = useState('')
  const [selectedRoute, setSelectedRoute] = useState(() =>
    initialRouteId ? routes.find(r => r.route_id === initialRouteId) : null
  )

  const filtered = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return routes
      .filter(r =>
        r.route_id.toLowerCase().includes(q) ||
        r.route_name.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [query])

  const selectRoute = (route) => {
    setSelectedRoute(route)
    setQuery('')
  }

  return (
    <div>
      {/* Search */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by route number or name (e.g. 14, Geary, N Judah)"
          className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-[#1e2130] border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1a1f36]/20 dark:focus:ring-white/20 focus:border-[#1a1f36] dark:focus:border-gray-500 shadow-sm"
        />
        {/* Dropdown */}
        {filtered.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1e2130] rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-10">
            {filtered.map(route => (
              <button
                key={route.route_id}
                onClick={() => selectRoute(route)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5 flex items-center justify-between text-sm transition-colors"
              >
                <span className="font-medium text-gray-900 dark:text-gray-100">{route.route_name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {route.avg_delay_min} min avg &middot; {route.pct_on_time}% on-time
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected route card */}
      {selectedRoute && (
        <div className="mt-4">
          <RouteCard route={{ ...selectedRoute, total_routes: routes.length }} />
        </div>
      )}

      {/* Quick picks */}
      {!selectedRoute && !query && (
        <div className="mt-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider font-semibold mb-2">Popular routes</p>
          <div className="flex flex-wrap gap-2">
            {routes.filter(r => ['14', '38', 'N', 'T', '22', '29', '49', '1'].includes(r.route_id)).map(r => (
              <button
                key={r.route_id}
                onClick={() => selectRoute(r)}
                className="px-3 py-1.5 bg-white dark:bg-[#1e2130] border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 hover:border-gray-300 dark:hover:border-gray-600 transition-colors shadow-sm"
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
