import { useState } from 'react'
import Map from '../components/Map'
import RouteLookup from '../components/RouteLookup'

export default function Explorer() {
  const [selectedRouteId, setSelectedRouteId] = useState(null)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1a1f36] dark:text-white">Route Explorer</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Look up any Muni route to see its performance stats, the income profile of the neighborhoods it serves,
          and how it ranks across the system.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Lookup panel */}
        <div className="lg:col-span-2 space-y-4">
          <RouteLookup initialRouteId={selectedRouteId} />

          {/* Methodology hint when no route is selected */}
          {!selectedRouteId && (
            <div className="bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mt-6">
              <h3 className="text-sm font-semibold text-[#1a1f36] dark:text-white mb-2">How to use</h3>
              <ol className="text-xs text-gray-500 dark:text-gray-400 space-y-1.5 list-decimal list-inside">
                <li>Search for a route above, or click a popular route</li>
                <li>Click any route line on the map to see its details</li>
                <li>Hover over census tracts to see neighborhood income</li>
              </ol>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-[#1e2130] rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <Map
              className="h-[400px] sm:h-[520px]"
              onRouteClick={(id) => setSelectedRouteId(id)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
