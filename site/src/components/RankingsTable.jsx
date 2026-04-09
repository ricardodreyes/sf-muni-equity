import { useState, useMemo } from 'react'
import routes from '../data/routes.json'

const columns = [
  { key: 'rank', label: '#', className: 'w-12' },
  { key: 'route_name', label: 'Route' },
  { key: 'avg_delay_min', label: 'Avg Delay', suffix: ' min' },
  { key: 'median_delay_min', label: 'Median Delay', suffix: ' min' },
  { key: 'pct_on_time', label: 'On-time %', suffix: '%' },
  { key: 'weighted_median_income', label: 'Median Income', format: 'currency' },
  { key: 'income_quartile', label: 'Quartile' },
  { key: 'total_observations', label: 'Observations', format: 'number' },
]

const perfBadge = (pct) => {
  if (pct >= 65) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  if (pct >= 50) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
  return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

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
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-[#1e2130] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#1a1f36]/20 dark:focus:ring-white/20"
        >
          <option value="all">All types</option>
          <option value="bus">Bus</option>
          <option value="light_rail">Light Rail</option>
          <option value="cable_car">Cable Car</option>
        </select>
        <select
          value={filterQuartile}
          onChange={e => setFilterQuartile(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-[#1e2130] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#1a1f36]/20 dark:focus:ring-white/20"
        >
          <option value="all">All income quartiles</option>
          <option value="1">Q1 - Lowest income</option>
          <option value="2">Q2</option>
          <option value="3">Q3</option>
          <option value="4">Q4 - Highest income</option>
        </select>
        <div className="ml-auto text-sm text-gray-500 dark:text-gray-400 self-center">
          {sorted.length} route{sorted.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#1e2130] rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-white/5">
                {columns.map(col => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={`px-4 py-3 text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none ${col.className || ''}`}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {sortKey === col.key && (
                        <span className="text-[#1a1f36] dark:text-white">{sortAsc ? '\u2191' : '\u2193'}</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(route => (
                <tr key={route.route_id} className="border-b border-gray-50 dark:border-gray-700/50 even:bg-gray-50/40 dark:even:bg-white/[0.02] hover:bg-gray-100/60 dark:hover:bg-white/5 transition-colors">
                  {columns.map(col => (
                    <td key={col.key} className={`px-4 py-3 ${col.className || ''}`}>
                      {col.key === 'route_name' ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#1a1f36] dark:text-white">{route.route_name}</span>
                          {route.equity_route && (
                            <span className="text-[8px] font-bold px-1 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded uppercase">EQ</span>
                          )}
                        </div>
                      ) : col.key === 'pct_on_time' ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${perfBadge(route.pct_on_time)}`}>
                          {route.pct_on_time}%
                        </span>
                      ) : col.key === 'income_quartile' ? (
                        <span className="font-medium text-gray-700 dark:text-gray-300">Q{route.income_quartile}</span>
                      ) : (
                        <span className="text-gray-700 dark:text-gray-300">{formatVal(col, route[col.key])}</span>
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
