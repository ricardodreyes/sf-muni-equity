export default function Methodology() {
  return (
    <article className="max-w-2xl mx-auto px-5 py-10 sm:py-14">
      <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-bold text-[var(--ink)]" style={{ fontFamily: 'var(--font-serif)' }}>
        Methodology
      </h1>

      <section className="mt-8">
        <h2 className="text-[18px] font-bold text-[var(--ink)] mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Research Question
        </h2>
        <p className="text-[15px] text-[var(--muted)] leading-relaxed">
          Which SF Muni bus routes have the worst on-time performance, and is route-level delay
          systematically correlated with the median household income of the neighborhoods those
          routes serve? If so, what is the magnitude, consistency, and policy significance of
          that relationship?
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-[18px] font-bold text-[var(--ink)] mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
          Data Sources
        </h2>
        <div className="space-y-4">
          {[
            {
              title: 'Transit Performance',
              text: '511.org Historic Regional GTFS feeds with stop_observations.txt, covering December 2025 through February 2026. These archives contain observed arrival times at every stop for every Muni trip, compared against scheduled arrival times.',
            },
            {
              title: 'Income Data',
              text: 'U.S. Census Bureau American Community Survey (ACS) 5-Year Estimates covering 2020 through 2024, variable B19013_001E (median household income), at the census tract level for San Francisco County (FIPS 06075).',
            },
            {
              title: 'Geographic Boundaries',
              text: 'Census TIGER/Line Shapefiles (2024) for California census tracts, filtered to San Francisco County (COUNTYFP = 075).',
            },
          ].map(({ title, text }) => (
            <div key={title} className="border-l-2 border-[var(--accent)] pl-4">
              <div className="text-[13px] font-semibold text-[var(--ink)]">{title}</div>
              <p className="text-[14px] text-[var(--muted)] mt-1 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[18px] font-bold text-[var(--ink)] mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
          Analytical Approach
        </h2>
        <ol className="space-y-3 text-[14px] text-[var(--muted)] leading-relaxed list-decimal list-inside">
          <li><strong className="text-[var(--ink)]">Delay computation.</strong> delay_seconds = observed_arrival - scheduled_arrival. On-time = between 1 minute early and 5 minutes late (SFMTA standard).</li>
          <li><strong className="text-[var(--ink)]">Route aggregation.</strong> Mean delay, median delay, and percent on-time across all observations per route.</li>
          <li><strong className="text-[var(--ink)]">Spatial join.</strong> Each Muni stop mapped to its census tract via point-in-polygon with TIGER tract boundaries.</li>
          <li><strong className="text-[var(--ink)]">Income profiling.</strong> Weighted average median income per route, weighted by stop count in each tract.</li>
          <li><strong className="text-[var(--ink)]">Correlation analysis.</strong> Pearson and Spearman rank correlations between delay and income.</li>
          <li><strong className="text-[var(--ink)]">Quartile comparison.</strong> Mann-Whitney U and Kruskal-Wallis tests across income quartiles.</li>
          <li><strong className="text-[var(--ink)]">ML models.</strong> OLS regression and Random Forest to quantify income's predictive power, controlling for route characteristics.</li>
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="text-[18px] font-bold text-[var(--ink)] mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
          Limitations
        </h2>
        <ul className="space-y-2 text-[14px] text-[var(--muted)] leading-relaxed list-disc list-inside">
          <li>Stop observations may have gaps from GPS errors or equipment malfunctions.</li>
          <li>Census income is a 5-year estimate covering 2020 through 2024; neighborhood composition may have shifted.</li>
          <li>Three-month study period may not capture seasonal variation.</li>
          <li>Route-level income blends wealthy and low-income areas along the same route.</li>
          <li>Correlation does not imply causation. Income may proxy for traffic density, road conditions, or ridership volume.</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-[18px] font-bold text-[var(--ink)] mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
          Tools
        </h2>
        <p className="text-[14px] text-[var(--muted)]">
          Python (pandas, GeoPandas, DuckDB, statsmodels, scikit-learn) for analysis.
          React, Mapbox GL JS, and Tailwind CSS for the interactive site.
        </p>
      </section>

      <section className="mt-10 border-t border-[var(--border)] pt-8">
        <p className="text-[13px] text-[var(--muted)]">
          <strong className="text-[var(--ink)]">Team:</strong> Harrison Ma, Brayden Awaya, Ricardo Reyes, Takehiro Ishiguro
        </p>
        <p className="text-[13px] text-[var(--muted)] mt-1">
          University of San Francisco, BUS 410 Business Analytics, Spring 2026
        </p>
      </section>
    </article>
  )
}
