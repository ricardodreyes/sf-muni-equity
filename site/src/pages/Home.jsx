import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Map from '../components/Map'
import ScatterPlot from '../components/ScatterPlot'
import RouteLookup from '../components/RouteLookup'
import useInView from '../useInView'
import CountUp from '../CountUp'
import { routes, routesByShortId } from '../data/routes'

const LIVE_POLL_INTERVAL = 90_000

function Section({ children, className = '', delay = 0 }) {
  const [ref, inView] = useInView({ threshold: 0.1 })
  return (
    <div
      ref={ref}
      className={`${inView ? 'anim-in' : 'anim-ready'} ${className}`}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  )
}

function useLiveVehicleCount() {
  const [count, setCount] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const timer = useRef(null)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      if (document.hidden) return
      try {
        const res = await fetch('/api/vehicles')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setCount(Array.isArray(data.vehicles) ? data.vehicles.length : null)
        setUpdatedAt(new Date())
      } catch {
        // Silent — Home renders fine without live data
      }
    }
    tick()
    timer.current = setInterval(tick, LIVE_POLL_INTERVAL)
    const onVisible = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return { count, updatedAt }
}

export default function Home() {
  const stats = useMemo(() => {
    const q1 = routes.filter(r => r.income_quartile === 1)
    const q4 = routes.filter(r => r.income_quartile === 4)
    const q1Delay = q1.reduce((s, r) => s + r.avg_delay_min, 0) / q1.length
    const q4Delay = q4.reduce((s, r) => s + r.avg_delay_min, 0) / q4.length
    const gap = ((q1Delay - q4Delay) / Math.abs(q4Delay) * 100).toFixed(0)
    const q1OnTime = (q1.reduce((s, r) => s + r.pct_on_time, 0) / q1.length).toFixed(1)
    const q4OnTime = (q4.reduce((s, r) => s + r.pct_on_time, 0) / q4.length).toFixed(1)
    const equityRoutes = routes.filter(r => r.equity_route)
    const eqDelay = (equityRoutes.reduce((s, r) => s + r.avg_delay_min, 0) / equityRoutes.length).toFixed(1)
    // Worst-performing routes by delay, restricted to bus + light rail so the
    // headline doesn't get dominated by the three (atypical, tourist) cable cars.
    const worst = [...routes]
      .filter(r => r.route_type !== 'cable_car')
      .sort((a, b) => b.avg_delay_min - a.avg_delay_min)
      .slice(0, 5)
    const totalObs = routes.reduce((s, r) => s + r.total_observations, 0)
    return { q1Delay: q1Delay.toFixed(1), q4Delay: q4Delay.toFixed(1), gap, q1OnTime, q4OnTime, eqDelay, worst, totalObs }
  }, [])

  const [statsRef, statsInView] = useInView({ threshold: 0.3 })
  const [selectedRoute, setSelectedRoute] = useState(null)
  const { count: liveCount, updatedAt: liveUpdatedAt } = useLiveVehicleCount()

  const handleMapRouteClick = (shortId) => {
    const route = routesByShortId[shortId]
    if (route) setSelectedRoute(route)
  }

  return (
    <div>
      {/* Lede */}
      <header className="max-w-3xl mx-auto px-5 pt-16 pb-10 sm:pt-24 sm:pb-14">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--accent)] mb-5 anim-in">
          Investigation
        </p>
        <h1
          className="text-[clamp(2rem,5vw,3.25rem)] font-bold text-[var(--ink)] leading-[1.1] anim-in anim-delay-1"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          In San Francisco, the bus routes serving the poorest neighborhoods are the most likely to run late.
        </h1>
        <p className="mt-6 text-[17px] text-[var(--muted)] leading-relaxed max-w-2xl anim-in anim-delay-2">
          An analysis of {stats.totalObs.toLocaleString()} stop-level observations across {routes.length} Muni
          routes reveals a persistent gap: transit riders in low-income neighborhoods wait
          longer, more often, than those in wealthier parts of the city.
        </p>
        <div className="mt-4 text-[12px] text-[var(--muted)] anim-in anim-delay-3">
          By Ricardo Reyes
        </div>
        {liveCount != null && (
          <div className="mt-6 inline-flex items-center gap-2 text-[12px] text-[var(--muted)] anim-in anim-delay-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] pulse-dot" />
            <span>
              <strong className="text-[var(--ink)] tabular-nums">{liveCount}</strong> Muni vehicles in service right now
              {liveUpdatedAt && (
                <span className="text-[var(--muted)]/70">
                  {' · '}updated {liveUpdatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </span>
            <Link to="/live" className="ml-1 text-[var(--accent)] hover:underline whitespace-nowrap">
              Live tracker &rarr;
            </Link>
          </div>
        )}
      </header>

      {/* Big number callout */}
      <section ref={statsRef} className="border-y border-[var(--border)] py-10 sm:py-14">
        <div className="max-w-5xl mx-auto px-5 grid sm:grid-cols-3 gap-8 sm:gap-4 text-center">
          <div>
            <div className="text-[clamp(2.5rem,6vw,4rem)] font-bold text-[var(--accent)] leading-none" style={{ fontFamily: 'var(--font-serif)' }}>
              <CountUp end={parseFloat(stats.gap)} decimals={0} suffix="%" active={statsInView} />
            </div>
            <div className="mt-2 text-[13px] text-[var(--muted)] max-w-[200px] mx-auto">
              more delay on routes serving the lowest-income quartile vs. the highest
            </div>
          </div>
          <div>
            <div className="text-[clamp(2.5rem,6vw,4rem)] font-bold text-[var(--ink)] leading-none" style={{ fontFamily: 'var(--font-serif)' }}>
              <CountUp end={parseFloat(stats.q1OnTime)} decimals={1} suffix="%" active={statsInView} />
            </div>
            <div className="mt-2 text-[13px] text-[var(--muted)] max-w-[200px] mx-auto">
              on-time rate for the poorest quartile of routes, vs. {stats.q4OnTime}% for the wealthiest
            </div>
          </div>
          <div>
            <div className="text-[clamp(2.5rem,6vw,4rem)] font-bold text-[var(--ink)] leading-none" style={{ fontFamily: 'var(--font-serif)' }}>
              <CountUp end={parseFloat(stats.eqDelay)} decimals={1} active={statsInView} />
              <span className="text-[0.5em] font-normal text-[var(--muted)]"> min</span>
            </div>
            <div className="mt-2 text-[13px] text-[var(--muted)] max-w-[200px] mx-auto">
              average delay on SFMTA-designated equity routes
            </div>
          </div>
        </div>
      </section>

      {/* Explorer: interactive map + lookup */}
      <Section className="max-w-6xl mx-auto px-5 py-12 sm:py-16">
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted)] mb-2">
            Explore the system
          </p>
          <h2 className="text-[clamp(1.4rem,3vw,1.75rem)] font-bold text-[var(--ink)]" style={{ fontFamily: 'var(--font-serif)' }}>
            Where income meets delay
          </h2>
          <p className="mt-2 text-[14px] text-[var(--muted)] max-w-2xl">
            Toggle the choropleth between median household income and average delay. Purple is
            higher; green is lower. Lines are major Muni routes colored by on-time performance.
            Click a line or search any route on the left to inspect its profile.
          </p>
        </div>
        <div className="grid lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2">
            <RouteLookup
              selectedRoute={selectedRoute}
              onSelectRoute={setSelectedRoute}
            />
          </div>
          <div className="lg:col-span-3">
            <div className="border border-[var(--border)] overflow-hidden" style={{ borderRadius: '3px' }}>
              <Map
                className="h-[420px] sm:h-[540px]"
                onRouteClick={handleMapRouteClick}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* Scatter plot */}
      <Section className="bg-[var(--surface)] border-y border-[var(--border)] py-12 sm:py-16">
        <div className="max-w-6xl mx-auto px-5">
          <div className="grid lg:grid-cols-2 gap-10 items-start">
            <div>
              <h2 className="text-[clamp(1.4rem,3vw,1.75rem)] font-bold text-[var(--ink)]" style={{ fontFamily: 'var(--font-serif)' }}>
                The pattern is clear
              </h2>
              <p className="mt-3 text-[15px] text-[var(--muted)] leading-relaxed">
                Each dot is a Muni route. The x-axis shows the weighted median household
                income of the neighborhoods it serves. The y-axis shows average delay. The
                correlation is negative and statistically significant: as income drops, delays rise.
              </p>
              <div className="mt-8 space-y-5">
                <div className="flex items-baseline gap-4">
                  <span className="text-[28px] font-bold text-[var(--accent)] leading-none" style={{ fontFamily: 'var(--font-serif)' }}>
                    {stats.q1Delay}m
                  </span>
                  <span className="text-[13px] text-[var(--muted)]">
                    avg. delay, lowest-income quartile ({stats.q1OnTime}% on-time)
                  </span>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-[28px] font-bold text-[var(--ink)] leading-none" style={{ fontFamily: 'var(--font-serif)' }}>
                    {stats.q4Delay}m
                  </span>
                  <span className="text-[13px] text-[var(--muted)]">
                    avg. delay, highest-income quartile ({stats.q4OnTime}% on-time)
                  </span>
                </div>
              </div>
            </div>
            <div className="border border-[var(--border)] bg-[var(--paper)] p-4" style={{ borderRadius: '3px' }}>
              <ScatterPlot width={520} height={380} />
            </div>
          </div>
        </div>
      </Section>

      {/* Worst routes */}
      <Section className="max-w-6xl mx-auto px-5 py-12 sm:py-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-[clamp(1.4rem,3vw,1.75rem)] font-bold text-[var(--ink)]" style={{ fontFamily: 'var(--font-serif)' }}>
              The worst-performing routes
            </h2>
            <p className="mt-1 text-[14px] text-[var(--muted)]">
              Bus and light-rail routes ranked by average delay across the study period. Cable cars excluded; see full rankings for the complete list.
            </p>
          </div>
          <Link to="/rankings" className="text-[13px] font-medium text-[var(--accent)] hover:underline whitespace-nowrap">
            Full rankings &rarr;
          </Link>
        </div>
        <div className="border border-[var(--border)] overflow-hidden" style={{ borderRadius: '3px' }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] text-[11px] uppercase tracking-wider">Route</th>
                <th className="text-right px-4 py-2.5 font-semibold text-[var(--muted)] text-[11px] uppercase tracking-wider">Avg Delay</th>
                <th className="text-right px-4 py-2.5 font-semibold text-[var(--muted)] text-[11px] uppercase tracking-wider">On-time</th>
                <th className="text-right px-4 py-2.5 font-semibold text-[var(--muted)] text-[11px] uppercase tracking-wider hidden sm:table-cell">Neighborhood Income</th>
                <th className="text-right px-4 py-2.5 font-semibold text-[var(--muted)] text-[11px] uppercase tracking-wider hidden sm:table-cell">Quartile</th>
              </tr>
            </thead>
            <tbody>
              {stats.worst.map((r) => (
                <tr key={r.route_id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)] transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-[var(--ink)]">{r.route_name}</span>
                    {r.equity_route && (
                      <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded">EQUITY</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--ink)]">{r.avg_delay_min} min</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">{r.pct_on_time}%</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)] hidden sm:table-cell">${r.weighted_median_income.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-[var(--muted)] hidden sm:table-cell">Q{r.income_quartile}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Methodology teaser */}
      <section className="border-t border-[var(--border)] bg-[var(--surface)] py-10">
        <div className="max-w-3xl mx-auto px-5 text-center">
          <p className="text-[14px] text-[var(--muted)] leading-relaxed">
            This analysis uses {stats.totalObs.toLocaleString()} stop-level observations from 511.org
            GTFS archives covering December 2025 through February 2026, Census ACS 5-year median household income
            estimates, and TIGER/Line tract boundaries. Routes are classified as on-time per the SFMTA
            standard: arriving between 1 minute early and 5 minutes late.
          </p>
          <Link to="/methodology" className="inline-block mt-4 text-[13px] font-medium text-[var(--accent)] hover:underline">
            Read the full methodology &rarr;
          </Link>
        </div>
      </section>
    </div>
  )
}
