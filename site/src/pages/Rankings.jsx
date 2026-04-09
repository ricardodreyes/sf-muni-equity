import RankingsTable from '../components/RankingsTable'

export default function Rankings() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1a1f36] dark:text-white">Route Rankings</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          All Muni routes ranked by on-time performance, with income context.
          Click any column header to sort. Filter by route type or income quartile.
        </p>
      </div>
      <RankingsTable />
    </div>
  )
}
