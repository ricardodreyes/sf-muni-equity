export default function Methodology() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-[#1a1f36] dark:text-white mb-8">Methodology</h1>

      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-bold text-[#1a1f36] dark:text-white mb-3">Research Question</h2>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm">
            Which SF Muni bus routes have the worst on-time performance, and is route-level delay
            systematically correlated with the median household income of the neighborhoods those
            routes serve? If so, what is the magnitude, consistency, and policy significance of
            that relationship?
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#1a1f36] dark:text-white mb-3">Data Sources</h2>
          <div className="bg-white dark:bg-[#1e2130] rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
            <div className="p-4">
              <h3 className="font-semibold text-[#1a1f36] dark:text-white text-sm">Transit Performance Data</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                511.org Historic Regional GTFS feeds with stop_observations.txt,
                covering December 2025 through February 2026. These archives contain
                observed arrival times at every stop for every Muni trip, compared
                against scheduled arrival times from stop_times.txt.
              </p>
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-[#1a1f36] dark:text-white text-sm">Income Data</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                U.S. Census Bureau American Community Survey (ACS) 5-Year Estimates
                (2020-2024), variable B19013_001E (median household income), at the
                census tract level for San Francisco County (FIPS 06075).
              </p>
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-[#1a1f36] dark:text-white text-sm">Geographic Boundaries</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                Census TIGER/Line Shapefiles (2024) for California census tracts,
                filtered to San Francisco County (COUNTYFP = 075).
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#1a1f36] dark:text-white mb-3">Analytical Approach</h2>
          <ol className="list-decimal list-inside space-y-3 text-gray-600 dark:text-gray-400 text-sm">
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Delay computation:</strong> For each observed stop arrival,
              delay_seconds = observed_arrival - scheduled_arrival. A vehicle is
              considered "on-time" if it arrives between 1 minute early and 5 minutes
              late (SFMTA standard).
            </li>
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Route aggregation:</strong> Delays are aggregated per route to
              compute mean delay, median delay, and percent on-time across all
              observations in the study period.
            </li>
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Spatial join:</strong> Each Muni stop is mapped to its census
              tract via point-in-polygon spatial join using stop coordinates and TIGER
              tract boundaries.
            </li>
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Route income profile:</strong> For each route, a weighted average
              median household income is computed across all census tracts the route
              serves, weighted by the number of stops in each tract.
            </li>
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Correlation analysis:</strong> Pearson and Spearman rank correlations
              between route-level average delay and route-level weighted median income.
            </li>
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Quartile comparison:</strong> Routes are grouped into income quartiles.
              Delay distributions are compared across quartiles using Mann-Whitney U tests
              and Kruskal-Wallis tests.
            </li>
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Temporal disaggregation:</strong> Analysis repeated by day of week
              and time of day (morning peak, midday, evening peak, late night) to identify
              when disparities are most acute.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#1a1f36] dark:text-white mb-3">Statistical Tests</h2>
          <div className="bg-white dark:bg-[#1e2130] rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-sm">
            <ul className="space-y-2 text-gray-600 dark:text-gray-400">
              <li><strong className="text-gray-800 dark:text-gray-200">Pearson r:</strong> Measures linear correlation between delay and income</li>
              <li><strong className="text-gray-800 dark:text-gray-200">Spearman rho:</strong> Rank-based correlation, robust to outliers and non-linearity</li>
              <li><strong className="text-gray-800 dark:text-gray-200">OLS Regression:</strong> delay ~ median_income (+ controls: route length, route type)</li>
              <li><strong className="text-gray-800 dark:text-gray-200">Mann-Whitney U:</strong> Compares delay distributions between Q1 and Q4 routes</li>
              <li><strong className="text-gray-800 dark:text-gray-200">Kruskal-Wallis:</strong> Tests whether delay distributions differ across all four income quartiles</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#1a1f36] dark:text-white mb-3">Limitations</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-400 text-sm">
            <li>
              Stop observations may have gaps due to GPS errors, missed observations,
              or equipment malfunctions.
            </li>
            <li>
              Census ACS income data is a 5-year estimate (2020-2024), reflecting
              average conditions rather than point-in-time snapshots. Neighborhood
              income composition may have shifted.
            </li>
            <li>
              The study period (3 months) may not capture seasonal variation in
              transit performance.
            </li>
            <li>
              Route-level income is an aggregation across all tracts served. A route
              passing through both wealthy and low-income areas will have a blended
              income that obscures within-route variation.
            </li>
            <li>
              Correlation does not imply causation. Lower-income neighborhoods may
              experience worse transit performance due to factors correlated with
              income (traffic density, road conditions, ridership volume) rather than
              income itself.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#1a1f36] dark:text-white mb-3">Tools & Technologies</h2>
          <div className="flex flex-wrap gap-2">
            {['Python', 'pandas', 'GeoPandas', 'DuckDB', 'SciPy', 'statsmodels', 'scikit-learn', 'React', 'Mapbox GL JS', 'Tailwind CSS', 'Vite'].map(t => (
              <span key={t} className="px-3 py-1 bg-gray-100 dark:bg-white/10 rounded-full text-xs font-medium text-gray-600 dark:text-gray-300">
                {t}
              </span>
            ))}
          </div>
        </section>

        <section className="bg-[#1a1f36] dark:bg-[#0d0f18] text-white rounded-xl p-6">
          <h2 className="text-lg font-bold mb-2">Team</h2>
          <p className="text-white/70 text-sm">
            Harrison Ma, Brayden Awaya, Ricardo Reyes, Takehiro Ishiguro
          </p>
          <p className="text-white/50 text-sm mt-1">
            University of San Francisco &middot; BUS 410 Business Analytics &middot; Spring 2026
          </p>
        </section>
      </div>
    </div>
  )
}
