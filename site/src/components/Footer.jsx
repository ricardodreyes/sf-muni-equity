export default function Footer() {
  return (
    <footer className="bg-[#1a1f36] dark:bg-[#0d0f18] text-white/60 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <div>
            <span className="font-semibold text-white/80">SF Muni Equity Tracker</span>
            {' '}&mdash; BUS 410 Group Research Project
          </div>
          <div className="text-center sm:text-right">
            <p>Harrison Ma, Brayden Awaya, Ricardo Reyes, Takehiro Ishiguro</p>
            <p className="mt-1">University of San Francisco &middot; Spring 2026</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-white/10 text-xs text-white/40 text-center">
          Data: 511.org GTFS Archives &middot; U.S. Census Bureau ACS 5-Year Estimates &middot; SFMTA
        </div>
      </div>
    </footer>
  )
}
