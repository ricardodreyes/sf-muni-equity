import RankingsTable from '../components/RankingsTable'

export default function Rankings() {
  return (
    <div className="max-w-6xl mx-auto px-5 py-10 sm:py-14">
      <div className="mb-8">
        <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-bold text-[var(--ink)]" style={{ fontFamily: 'var(--font-serif)' }}>
          Route Rankings
        </h1>
        <p className="mt-2 text-[14px] text-[var(--muted)] max-w-lg">
          All {49} Muni routes ranked by on-time performance.
          Click any column header to sort. Filter by type or income quartile.
        </p>
      </div>
      <RankingsTable />
    </div>
  )
}
