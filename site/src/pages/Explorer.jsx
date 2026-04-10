import { useState } from 'react'
import Map from '../components/Map'
import RouteLookup from '../components/RouteLookup'

export default function Explorer() {
  const [selectedRouteId, setSelectedRouteId] = useState(null)

  return (
    <div className="max-w-6xl mx-auto px-5 py-10 sm:py-14">
      <div className="mb-8">
        <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-bold text-[var(--ink)]" style={{ fontFamily: 'var(--font-serif)' }}>
          Route Explorer
        </h1>
        <p className="mt-2 text-[14px] text-[var(--muted)] max-w-lg">
          Search any Muni route to see its delay statistics, income profile,
          and system ranking. Click a route line on the map for details.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
          <RouteLookup initialRouteId={selectedRouteId} />
        </div>
        <div className="lg:col-span-3">
          <div className="border border-[var(--border)] overflow-hidden" style={{ borderRadius: '3px' }}>
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
