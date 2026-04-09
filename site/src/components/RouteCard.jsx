const performanceColor = (pct) => {
  if (pct >= 65) return 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/30 dark:border-green-800'
  if (pct >= 50) return 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-900/30 dark:border-yellow-800'
  return 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800'
}

const performanceLabel = (pct) => {
  if (pct >= 65) return 'Good'
  if (pct >= 50) return 'Fair'
  return 'Poor'
}

function MiniBar({ data, label }) {
  const max = Math.max(...data)
  return (
    <div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-1">{label}</div>
      <div className="flex items-end gap-[2px] h-8">
        {data.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm bg-[#1a1f36]/20 dark:bg-white/20 min-w-[2px]"
            style={{ height: `${(v / max) * 100}%` }}
            title={`${v.toFixed(1)} min`}
          />
        ))}
      </div>
    </div>
  )
}

export default function RouteCard({ route, compact = false }) {
  if (!route) return null

  const perfClass = performanceColor(route.pct_on_time)

  return (
    <div className="bg-white dark:bg-[#1e2130] rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-[#1a1f36] dark:text-white">{route.route_name}</span>
              {route.equity_route && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full uppercase tracking-wider">
                  Equity
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {route.route_type === 'bus' ? 'Bus' : route.route_type === 'light_rail' ? 'Light Rail' : 'Cable Car'}
              {' '}&middot; {route.num_stops} stops &middot; {route.total_observations.toLocaleString()} observations
            </div>
          </div>
          <div className={`px-2.5 py-1 rounded-full text-xs font-bold border ${perfClass}`}>
            {performanceLabel(route.pct_on_time)}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Avg Delay</div>
            <div className="text-lg font-bold text-[#1a1f36] dark:text-white">{route.avg_delay_min}<span className="text-xs font-normal text-gray-400 dark:text-gray-500"> min</span></div>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">On-time</div>
            <div className="text-lg font-bold text-[#1a1f36] dark:text-white">{route.pct_on_time}<span className="text-xs font-normal text-gray-400 dark:text-gray-500">%</span></div>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Income</div>
            <div className="text-lg font-bold text-[#1a1f36] dark:text-white">${Math.round(route.weighted_median_income / 1000)}<span className="text-xs font-normal text-gray-400 dark:text-gray-500">k</span></div>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Rank</div>
            <div className="text-lg font-bold text-[#1a1f36] dark:text-white">#{route.rank}<span className="text-xs font-normal text-gray-400 dark:text-gray-500"> /{route.total_routes || 55}</span></div>
          </div>
        </div>

        {/* Sparklines */}
        {!compact && route.delay_by_hour && (
          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100 dark:border-gray-700">
            <MiniBar data={route.delay_by_hour} label="Delay by hour (5am-11pm)" />
            {route.delay_by_day && (
              <MiniBar
                data={Object.values(route.delay_by_day)}
                label="Delay by day (Mon-Sun)"
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
