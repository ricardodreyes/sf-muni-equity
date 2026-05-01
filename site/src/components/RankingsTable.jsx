import { useState, useMemo } from 'react'
import { routes } from '../data/routes'

const columns = [
  { key: 'rank', label: '#', className: 'w-10' },
  { key: 'route_name', label: 'Route' },
  { key: 'avg_delay_min', label: 'Avg Delay', suffix: ' min' },
  { key: 'median_delay_min', label: 'Med. Delay', suffix: ' min' },
  { key: 'pct_on_time', label: 'On-time' },
  { key: 'weighted_median_income', label: 'Income', format: 'currency' },
  { key: 'income_quartile', label: 'Q' },
  { key: 'total_observations', label: 'Obs.', format: 'number' },
]

export default function RankingsTable() {
  const [sortKey, setSortKey] = useState('rank')
  const [sortAsc, setSortAsc] = useState(true)
  const [filterType, setFilterType] = useState('all')
  const [filterQuartile, setFilterQuartile] = useState('all')

  const sorted = useMemo(() => {
    let data = [...routes]
    if (filterType !== 'all') data = data.filter(r => r.route_type === filterType)
    if (filterQuartile !== 'all') data = data.filter(r => r.income_quartile === Number(filterQuartile))
    data.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortAsc ? av - bv : bv - av
    })
    return data
  }, [sortKey, sortAsc, filterType, filterQuartile])

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(key === 'rank' || key === 'route_name') }
  }

  const formatVal = (col, val) => {
    if (col.format === 'currency') return `$${Number(val).toLocaleString()}`
    if (col.format === 'number') return Number(val).toLocaleString()
    if (col.suffix) return `${val}${col.suffix}`
    return val
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] text-[13px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
          style={{ borderRadius: '3px' }}>
          <option value="all">All types</option>
          <option value="bus">Bus</option>
          <option value="light_rail">Light Rail</option>
          <option value="cable_car">Cable Car</option>
        </select>
        <select value={filterQuartile} onChange={e => setFilterQuartile(e.target.value)}
          className="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] text-[13px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
          style={{ borderRadius: '3px' }}>
          <option value="all">All quartiles</option>
          <option value="1">Q1 (Lowest)</option>
          <option value="2">Q2</option>
          <option value="3">Q3</option>
          <option value="4">Q4 (Highest)</option>
        </select>
        <span className="ml-auto text-[12px] text-[var(--muted)]">{sorted.length} routes</span>
      </div>

      <div className="border border-[var(--border)] overflow-hidden" style={{ borderRadius: '3px' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                {columns.map(col => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={`px-3 py-2.5 text-left text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider cursor-pointer hover:text-[var(--ink)] select-none ${col.className || ''}`}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="ml-0.5 text-[var(--accent)]">{sortAsc ? '\u2191' : '\u2193'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((route, i) => (
                <tr key={route.route_id}
                  className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--accent)]/[0.03] transition-colors ${
                    i % 2 === 1 ? 'bg-[var(--surface)]/50' : ''
                  }`}>
                  {columns.map(col => (
                    <td key={col.key} className={`px-3 py-2.5 ${col.className || ''}`}>
                      {col.key === 'route_name' ? (
                        <span className="flex items-center gap-1.5">
                          <span className="font-medium text-[var(--ink)]">{route.route_name}</span>
                          {route.equity_route && (
                            <span className="text-[9px] font-bold px-1 py-px bg-[var(--accent)]/10 text-[var(--accent)] rounded-sm">EQ</span>
                          )}
                        </span>
                      ) : col.key === 'pct_on_time' ? (
                        <span className={`tabular-nums font-medium ${
                          route.pct_on_time >= 65 ? 'text-green-700 dark:text-green-400'
                          : route.pct_on_time >= 50 ? 'text-amber-700 dark:text-amber-400'
                          : 'text-red-700 dark:text-red-400'
                        }`}>
                          {route.pct_on_time}%
                        </span>
                      ) : col.key === 'income_quartile' ? (
                        <span className="text-[var(--muted)] tabular-nums">Q{route.income_quartile}</span>
                      ) : (
                        <span className="text-[var(--ink)]/80 tabular-nums">{formatVal(col, route[col.key])}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
