export default function Footer() {
  return (
    <footer className="border-t border-[var(--border)] py-8">
      <div className="max-w-6xl mx-auto px-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[12px] text-[var(--muted)]">
          <div>
            <span className="font-semibold text-[var(--ink)]" style={{ fontFamily: 'var(--font-serif)' }}>
              SF Muni Equity Tracker
            </span>
            <span className="mx-2 text-[var(--border)]">|</span>
            BUS 410, University of San Francisco, Spring 2026
          </div>
          <div className="text-right">
            Harrison Ma, Brayden Awaya, Ricardo Reyes, Takehiro Ishiguro
          </div>
        </div>
        <div className="mt-3 text-[11px] text-[var(--muted)]/60">
          Data: 511.org GTFS Archives, U.S. Census Bureau ACS 5-Year Estimates, SFMTA
        </div>
      </div>
    </footer>
  )
}
