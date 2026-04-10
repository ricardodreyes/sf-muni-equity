function MiniBar({ data, label }) {
  const max = Math.max(...data)
  return (
    <div>
      <div className="text-[10px] text-[var(--muted)] mb-1">{label}</div>
      <div className="flex items-end gap-[1px] h-8">
        {data.map((v, i) => (
          <div
            key={i}
            className="flex-1 bg-[var(--accent)]/25 min-w-[2px]"
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

  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] p-4" style={{ borderRadius: '3px' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="font-bold text-[var(--ink)] text-[15px]" style={{ fontFamily: 'var(--font-serif)' }}>
            {route.route_name}
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            {route.route_type === 'bus' ? 'Bus' : route.route_type === 'light_rail' ? 'Light Rail' : 'Cable Car'}
            {' \u00b7 '}{route.num_stops} stops{' \u00b7 '}{route.total_observations.toLocaleString()} obs.
            {route.equity_route && (
              <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded-sm">
                EQUITY
              </span>
            )}
          </div>
        </div>
        <div className={`text-[11px] font-semibold px-2 py-0.5 rounded-sm ${
          route.pct_on_time >= 65
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            : route.pct_on_time >= 50
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
        }`}>
          {route.pct_on_time >= 65 ? 'Good' : route.pct_on_time >= 50 ? 'Fair' : 'Poor'}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Avg Delay', value: `${route.avg_delay_min}`, unit: 'min' },
          { label: 'On-time', value: `${route.pct_on_time}`, unit: '%' },
          { label: 'Income', value: `$${Math.round(route.weighted_median_income / 1000)}`, unit: 'k' },
          { label: 'Rank', value: `#${route.rank}`, unit: `/${route.total_routes || 49}` },
        ].map(({ label, value, unit }) => (
          <div key={label}>
            <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">{label}</div>
            <div className="text-[16px] font-bold text-[var(--ink)] tabular-nums leading-tight mt-0.5">
              {value}<span className="text-[11px] font-normal text-[var(--muted)]">{unit}</span>
            </div>
          </div>
        ))}
      </div>

      {!compact && route.delay_by_hour && (
        <div className="grid grid-cols-2 gap-4 pt-3 mt-3 border-t border-[var(--border)]">
          <MiniBar data={route.delay_by_hour} label="Delay by hour (5am-11pm)" />
          {route.delay_by_day && (
            <MiniBar data={Object.values(route.delay_by_day)} label="Delay by day (Mon-Sun)" />
          )}
        </div>
      )}
    </div>
  )
}
