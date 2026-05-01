import { useMemo, useState } from 'react'
import { routes } from '../data/routes'

const MARGIN = { top: 20, right: 30, bottom: 50, left: 60 }
const QUARTILE_COLORS = {
  1: '#ef4444',
  2: '#f59e0b',
  3: '#3b82f6',
  4: '#22c55e',
}

export default function ScatterPlot({ width = 600, height = 400 }) {
  const [hovered, setHovered] = useState(null)

  const { xScale, yScale, xTicks, yTicks, correlation } = useMemo(() => {
    const incomes = routes.map(r => r.weighted_median_income)
    const delays = routes.map(r => r.avg_delay_min)

    const xMin = Math.min(...incomes) * 0.9
    const xMax = Math.max(...incomes) * 1.05
    const yMin = 0
    const yMax = Math.max(...delays) * 1.15

    const innerW = width - MARGIN.left - MARGIN.right
    const innerH = height - MARGIN.top - MARGIN.bottom

    const xScale = (v) => MARGIN.left + ((v - xMin) / (xMax - xMin)) * innerW
    const yScale = (v) => MARGIN.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH

    const xTicks = [40000, 60000, 80000, 100000, 120000, 140000, 160000]
      .filter(t => t >= xMin && t <= xMax)
    const yTicks = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(t => t <= yMax)

    // Pearson correlation
    const n = incomes.length
    const meanX = incomes.reduce((a, b) => a + b, 0) / n
    const meanY = delays.reduce((a, b) => a + b, 0) / n
    let num = 0, denX = 0, denY = 0
    for (let i = 0; i < n; i++) {
      const dx = incomes[i] - meanX
      const dy = delays[i] - meanY
      num += dx * dy
      denX += dx * dx
      denY += dy * dy
    }
    const r = num / Math.sqrt(denX * denY)

    // Regression line
    const slope = num / denX
    const intercept = meanY - slope * meanX

    return {
      xScale, yScale, xTicks, yTicks,
      correlation: { r, slope, intercept, xMin, xMax },
    }
  }, [width, height])

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        style={{ maxHeight: height }}
      >
        {/* Grid lines */}
        {yTicks.map(t => (
          <line
            key={`yg-${t}`}
            x1={MARGIN.left}
            x2={width - MARGIN.right}
            y1={yScale(t)}
            y2={yScale(t)}
            stroke="var(--border)"
            strokeWidth={0.5}
          />
        ))}

        {/* Regression line */}
        <line
          x1={xScale(correlation.xMin)}
          y1={yScale(correlation.slope * correlation.xMin + correlation.intercept)}
          x2={xScale(correlation.xMax)}
          y2={yScale(correlation.slope * correlation.xMax + correlation.intercept)}
          stroke="var(--muted)"
          strokeWidth={1.5}
          strokeDasharray="6 4"
          opacity={0.6}
        />

        {/* Data points */}
        {routes.map((route) => {
          const cx = xScale(route.weighted_median_income)
          const cy = yScale(route.avg_delay_min)
          const isHovered = hovered === route.route_id
          const color = QUARTILE_COLORS[route.income_quartile]

          return (
            <g key={route.route_id}>
              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? 7 : route.equity_route ? 5.5 : 4}
                fill={color}
                fillOpacity={isHovered ? 1 : 0.75}
                stroke={isHovered ? '#fff' : route.equity_route ? '#fff' : 'none'}
                strokeWidth={isHovered ? 2 : route.equity_route ? 1.5 : 0}
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={() => setHovered(route.route_id)}
                onMouseLeave={() => setHovered(null)}
              />
            </g>
          )
        })}

        {/* X axis */}
        <line
          x1={MARGIN.left}
          x2={width - MARGIN.right}
          y1={height - MARGIN.bottom}
          y2={height - MARGIN.bottom}
          stroke="var(--border)"
          strokeWidth={1}
        />
        {xTicks.map(t => (
          <g key={`xt-${t}`}>
            <line
              x1={xScale(t)}
              x2={xScale(t)}
              y1={height - MARGIN.bottom}
              y2={height - MARGIN.bottom + 5}
              stroke="var(--muted)"
            />
            <text
              x={xScale(t)}
              y={height - MARGIN.bottom + 18}
              textAnchor="middle"
              fill="var(--muted)"
              className="text-[10px]"
            >
              ${(t / 1000).toFixed(0)}k
            </text>
          </g>
        ))}
        <text
          x={width / 2}
          y={height - 6}
          textAnchor="middle"
          fill="var(--muted)"
          className="text-[11px] font-medium"
        >
          Weighted Median Household Income
        </text>

        {/* Y axis */}
        <line
          x1={MARGIN.left}
          x2={MARGIN.left}
          y1={MARGIN.top}
          y2={height - MARGIN.bottom}
          stroke="var(--border)"
          strokeWidth={1}
        />
        {yTicks.map(t => (
          <g key={`yt-${t}`}>
            <line
              x1={MARGIN.left - 5}
              x2={MARGIN.left}
              y1={yScale(t)}
              y2={yScale(t)}
              stroke="var(--muted)"
            />
            <text
              x={MARGIN.left - 10}
              y={yScale(t) + 3}
              textAnchor="end"
              fill="var(--muted)"
              className="text-[10px]"
            >
              {t}
            </text>
          </g>
        ))}
        <text
          x={-height / 2 + MARGIN.top}
          y={14}
          textAnchor="middle"
          transform={`rotate(-90)`}
          fill="var(--muted)"
          className="text-[11px] font-medium"
        >
          Avg Delay (minutes)
        </text>

        {/* Correlation label */}
        <text
          x={width - MARGIN.right - 5}
          y={MARGIN.top + 14}
          textAnchor="end"
          fill="var(--muted)"
          className="text-[10px] tabular-nums"
        >
          r = {correlation.r.toFixed(2)}
        </text>
      </svg>

      {/* Tooltip */}
      {hovered && (() => {
        const route = routes.find(r => r.route_id === hovered)
        if (!route) return null
        const cx = xScale(route.weighted_median_income)
        const cy = yScale(route.avg_delay_min)
        const pctW = (cx / width) * 100
        const pctH = (cy / height) * 100

        return (
          <div
            className="absolute pointer-events-none bg-[var(--surface)] border border-[var(--border)] shadow-lg px-3 py-2 text-[11px] z-20"
            style={{
              borderRadius: '3px',
              left: `${pctW}%`,
              top: `${pctH}%`,
              transform: `translate(${pctW > 70 ? '-105%' : '10px'}, -50%)`,
            }}
          >
            <div className="font-bold text-[var(--ink)]">{route.route_name}</div>
            <div className="text-[var(--muted)] mt-0.5 tabular-nums">
              Delay: {route.avg_delay_min} min &middot; Income: ${(route.weighted_median_income / 1000).toFixed(0)}k
            </div>
            <div className="text-[var(--muted)]/80 mt-0.5 tabular-nums">
              {route.pct_on_time}% on-time &middot; Q{route.income_quartile}
              {route.equity_route ? ' · Equity route' : ''}
            </div>
          </div>
        )
      })()}

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-3 text-[10px] text-[var(--muted)]">
        {[
          { q: 1, label: 'Q1 (Lowest)' },
          { q: 2, label: 'Q2' },
          { q: 3, label: 'Q3' },
          { q: 4, label: 'Q4 (Highest)' },
        ].map(({ q, label }) => (
          <span key={q} className="flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ background: QUARTILE_COLORS[q] }}
            />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full inline-block bg-[var(--muted)]/60 ring-1 ring-[var(--ink)]/40" />
          Equity route
        </span>
      </div>
    </div>
  )
}
