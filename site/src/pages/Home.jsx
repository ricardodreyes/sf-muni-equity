import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Map from '../components/Map'
import StatHighlight from '../components/StatHighlight'
import RouteCard from '../components/RouteCard'
import ScatterPlot from '../components/ScatterPlot'
import routes from '../data/routes.json'

export default function Home() {
  const stats = useMemo(() => {
    const q1 = routes.filter(r => r.income_quartile === 1)
    const q4 = routes.filter(r => r.income_quartile === 4)
    const q1Delay = q1.reduce((s, r) => s + r.avg_delay_min, 0) / q1.length
    const q4Delay = q4.reduce((s, r) => s + r.avg_delay_min, 0) / q4.length
    const gap = ((q1Delay - q4Delay) / q4Delay * 100).toFixed(0)
    const q1OnTime = (q1.reduce((s, r) => s + r.pct_on_time, 0) / q1.length).toFixed(1)
    const q4OnTime = (q4.reduce((s, r) => s + r.pct_on_time, 0) / q4.length).toFixed(1)
    const equityRoutes = routes.filter(r => r.equity_route)
    const eqDelay = (equityRoutes.reduce((s, r) => s + r.avg_delay_min, 0) / equityRoutes.length).toFixed(1)
    const worst = [...routes].sort((a, b) => b.avg_delay_min - a.avg_delay_min).slice(0, 6)
    return { q1Delay: q1Delay.toFixed(1), q4Delay: q4Delay.toFixed(1), gap, q1OnTime, q4OnTime, eqDelay, worst }
  }, [])

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-[#1a1f36] to-[#252b48] dark:from-[#0d0f18] dark:to-[#151829] text-white py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40 mb-4">
            BUS 410 Research Project &middot; University of San Francisco
          </p>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Does Your Bus Route Depend on{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f5a623] to-[#f97316]">
              Your Zip Code?
            </span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-white/60 max-w-2xl mx-auto leading-relaxed">
            An analysis of SF Muni on-time performance across neighborhoods,
            revealing how transit reliability correlates with household income.
          </p>
          <div className="mt-12 flex flex-wrap justify-center gap-8 sm:gap-16">
            <StatHighlight
              value={`${stats.gap}%`}
              label="Delay Gap"
              sublabel="Low-income vs high-income routes"
              color="text-[#f5a623]"
            />
            <StatHighlight
              value={`${stats.q1Delay}m`}
              label="Avg Delay (Q1)"
              sublabel="Lowest-income quartile"
              color="text-red-400"
            />
            <StatHighlight
              value={`${stats.q4Delay}m`}
              label="Avg Delay (Q4)"
              sublabel="Highest-income quartile"
              color="text-green-400"
            />
          </div>
        </div>
      </section>

      {/* Map */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 relative z-10">
        <div className="bg-white dark:bg-[#1e2130] rounded-2xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-bold text-[#1a1f36] dark:text-white">Income & Transit Performance Map</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Census tracts shaded by median income. Route lines colored by on-time performance.
              Toggle between views. Hover for details.
            </p>
          </div>
          <Map className="h-[500px] sm:h-[600px]" />
        </div>
      </section>

      {/* Scatter plot - the centerpiece */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <div className="grid lg:grid-cols-5 gap-8 items-start">
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold text-[#1a1f36] dark:text-white">
              The Income-Delay Relationship
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 leading-relaxed">
              Each dot represents a Muni route. Routes serving lower-income neighborhoods
              (left side) cluster toward higher delays (top), while routes in wealthier areas
              tend to run closer to schedule.
            </p>
            <div className="mt-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-red-600 dark:text-red-400 text-sm font-bold">Q1</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#1a1f36] dark:text-white">Lowest-income routes</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Avg {stats.q1Delay} min delay, {stats.q1OnTime}% on-time
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-green-600 dark:text-green-400 text-sm font-bold">Q4</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#1a1f36] dark:text-white">Highest-income routes</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Avg {stats.q4Delay} min delay, {stats.q4OnTime}% on-time
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-[#1e2130] rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 shadow-sm">
              <ScatterPlot width={560} height={380} />
            </div>
          </div>
        </div>
      </section>

      {/* Key findings */}
      <section className="bg-gray-50 dark:bg-[#13151f] py-14 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-[#1a1f36] dark:text-white">Key Findings</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Three patterns emerge from the analysis of {routes.length} Muni routes.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            <div className="bg-white dark:bg-[#1e2130] rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>
                </div>
                <h3 className="font-bold text-[#1a1f36] dark:text-white">Performance Gap</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Routes serving the lowest-income quartile average <strong className="text-[#1a1f36] dark:text-white">{stats.q1OnTime}%</strong> on-time,
                compared to <strong className="text-[#1a1f36] dark:text-white">{stats.q4OnTime}%</strong> for the highest-income quartile.
                That is a <strong className="text-red-600 dark:text-red-400">{stats.gap}% delay gap</strong>.
              </p>
            </div>
            <div className="bg-white dark:bg-[#1e2130] rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                </div>
                <h3 className="font-bold text-[#1a1f36] dark:text-white">Equity Routes Lag</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                SFMTA-designated equity routes serving Bayview, Tenderloin, and the Mission
                average <strong className="text-[#1a1f36] dark:text-white">{stats.eqDelay} min</strong> of delay,
                consistently above the system average.
              </p>
            </div>
            <div className="bg-white dark:bg-[#1e2130] rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h3 className="font-bold text-[#1a1f36] dark:text-white">Rush Hour Widens the Gap</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                The delay disparity is largest during weekday morning and evening peaks,
                exactly when transit-dependent commuters have the least flexibility.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Worst performing routes */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-[#1a1f36] dark:text-white">Most Delayed Routes</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              The routes with the highest average delay across the study period.
            </p>
          </div>
          <Link to="/rankings" className="text-sm font-medium text-[#c41e3a] hover:underline whitespace-nowrap">
            View all rankings &rarr;
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.worst.slice(0, 6).map(route => (
            <RouteCard key={route.route_id} route={{ ...route, total_routes: routes.length }} compact />
          ))}
        </div>
      </section>
    </div>
  )
}
