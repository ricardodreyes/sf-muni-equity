import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import { useTheme } from '../ThemeContext'
import { checkMapLoad } from '../mapUsage'
import routes from '../data/routes.json'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

const POLL_INTERVAL = 90_000
const routeDelayMap = Object.fromEntries(routes.map(r => [r.route_id, r]))

function esc(val) {
  return String(val ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function getHistoricalDelay(routeId) {
  const route = routeDelayMap[routeId]
  if (!route) return null
  const hour = new Date().getHours()
  const idx = hour - 5
  if (idx >= 0 && idx < route.delay_by_hour.length) return route.delay_by_hour[idx]
  return route.avg_delay_min
}

function formatOccupancy(occ) {
  if (!occ) return null
  const map = {
    seatsAvailable: 'Seats available',
    standingAvailable: 'Standing room',
    full: 'Full',
    crushedStandingRoomOnly: 'Very crowded',
    notAcceptingPassengers: 'Not boarding',
  }
  return map[occ] || occ
}

function buildPopupHTML(p) {
  const lines = []

  // Route name + destination
  lines.push(`<strong style="font-size:13px">${esc(p.routeName)}</strong>`)
  if (p.destination) {
    lines.push(`<span style="color:#999;font-size:11px">to ${esc(p.destination)}</span>`)
  }

  // Direction
  const dir = p.direction === 'IB' ? 'Inbound' : p.direction === 'OB' ? 'Outbound' : p.direction === '0' ? 'Outbound' : p.direction === '1' ? 'Inbound' : ''
  if (dir) lines.push(`<span style="color:#999;font-size:11px">${dir}</span>`)

  // Next stop + ETA
  if (p.nextStop) {
    const eta = p.minutesAway != null && p.minutesAway !== 'null'
      ? ` (${p.minutesAway} min)`
      : ''
    lines.push(`Next: ${esc(p.nextStop)}${eta}`)
  }

  // Upcoming stops
  if (p.onwardStops) {
    try {
      const stops = JSON.parse(p.onwardStops)
      if (stops.length > 0) {
        lines.push(`<span style="color:#999;font-size:10px;margin-top:2px;display:block">Upcoming stops:</span>`)
        stops.forEach(s => {
          lines.push(`<span style="font-size:11px;color:#bbb">&bull; ${esc(s)}</span>`)
        })
      }
    } catch {}
  }

  // Occupancy
  const occ = formatOccupancy(p.occupancy)
  if (occ) lines.push(`<span style="font-size:11px;color:#999">${occ}</span>`)

  // Historical delay
  if (p.historicalDelay && p.historicalDelay !== 'null') {
    lines.push(`<span style="font-size:10px;color:#c41e3a;margin-top:2px;display:block">Hist. avg: ${p.historicalDelay} min delay at this hour</span>`)
  }

  return lines.join('<br/>')
}

export default function Live() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const { dark } = useTheme()
  const [vehicles, setVehicles] = useState([])
  const [outOfService, setOutOfService] = useState(0)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [predictions, setPredictions] = useState(null)
  const [predLoading, setPredLoading] = useState(false)
  const timerRef = useRef(null)

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await fetch('/api/vehicles')
      if (!res.ok) throw new Error(`API returned ${res.status}`)
      const data = await res.json()
      setVehicles(data.vehicles || [])
      setOutOfService(data.outOfService || 0)
      setLastUpdate(new Date())
      setError(null)
      setLoading(false)
      return data.vehicles || []
    } catch (err) {
      setError(err.message)
      setLoading(false)
      return []
    }
  }, [])

  const fetchPredictions = useCallback(async (stopId) => {
    if (!stopId) return
    setPredLoading(true)
    try {
      const res = await fetch(`/api/predictions?stopId=${stopId}`)
      if (!res.ok) throw new Error(`API returned ${res.status}`)
      const data = await res.json()
      setPredictions(data)
    } catch {
      setPredictions(null)
    }
    setPredLoading(false)
  }, [])

  // Map layers setup function (reused on init and theme switch)
  function addLayers(isDark) {
    if (!map.current) return

    map.current.addSource('vehicles', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })

    map.current.addLayer({
      id: 'vehicle-circles',
      type: 'circle',
      source: 'vehicles',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 6],
        'circle-color': [
          'case',
          ['==', ['get', 'status'], 'on-time'], '#22c55e',
          ['==', ['get', 'status'], 'late'], '#ef4444',
          '#eab308',
        ],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': isDark ? '#222' : '#fff',
        'circle-opacity': 0.9,
      },
    })

    map.current.addLayer({
      id: 'vehicle-labels',
      type: 'symbol',
      source: 'vehicles',
      minzoom: 13,
      layout: {
        'text-field': ['get', 'routeName'],
        'text-size': 10,
        'text-offset': [0, 1.3],
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': isDark ? '#aaa' : '#666',
        'text-halo-color': isDark ? '#111' : '#fff',
        'text-halo-width': 1,
      },
    })

    // Hover popup
    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '260px' })
    map.current.on('mousemove', 'vehicle-circles', (e) => {
      map.current.getCanvas().style.cursor = 'pointer'
      const p = e.features[0].properties
      popup.setLngLat(e.lngLat).setHTML(buildPopupHTML(p)).addTo(map.current)
    })
    map.current.on('mouseleave', 'vehicle-circles', () => {
      map.current.getCanvas().style.cursor = ''
      popup.remove()
    })

    // Click vehicle
    map.current.on('click', 'vehicle-circles', (e) => {
      const p = e.features[0].properties
      // Parse onwardStops back from string
      let onward = []
      try { onward = JSON.parse(p.onwardStops || '[]') } catch {}
      setSelectedVehicle({ ...p, onwardStopsList: onward })
      if (p.nextStopId) fetchPredictions(p.nextStopId)
    })
  }

  // Init map
  useEffect(() => {
    if (map.current) return
    const usage = checkMapLoad()
    if (!usage.allowed) { setError('Map load limit reached'); setLoading(false); return }

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: dark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
      center: [-122.44, 37.76],
      zoom: 12,
    })
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.current.on('load', async () => {
      addLayers(dark)
      const initial = await fetchVehicles()
      updateMapData(initial)
    })

    return () => { map.current?.remove(); map.current = null }
  }, [])

  // Theme switch
  useEffect(() => {
    if (!map.current) return
    map.current.setStyle(dark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11')
    map.current.once('style.load', () => {
      addLayers(dark)
      updateMapData(vehicles)
    })
  }, [dark])

  // Polling
  useEffect(() => {
    timerRef.current = setInterval(async () => {
      const v = await fetchVehicles()
      updateMapData(v)
    }, POLL_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [fetchVehicles])

  function vehiclesToGeoJSON(list) {
    return {
      type: 'FeatureCollection',
      features: list.map(v => {
        const expected = v.expectedArrival ? new Date(v.expectedArrival) : null
        const aimed = v.aimed ? new Date(v.aimed) : null
        const minutesAway = expected
          ? Math.max(0, Math.round((expected - new Date()) / 60000))
          : aimed
          ? Math.max(0, Math.round((aimed - new Date()) / 60000))
          : null
        const hist = getHistoricalDelay(v.routeId)
        const onwardStops = (v.onwardCalls || []).map(c => c.stopName).filter(Boolean)

        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
          properties: {
            vehicleId: v.vehicleId,
            routeId: v.routeId,
            routeName: v.routeName,
            direction: v.direction,
            destination: v.destination || '',
            origin: v.origin || '',
            nextStop: v.nextStop,
            nextStopId: v.nextStopId,
            minutesAway,
            historicalDelay: hist,
            occupancy: v.occupancy,
            onwardStops: JSON.stringify(onwardStops),
            status: minutesAway == null ? 'unknown' : minutesAway <= 2 ? 'on-time' : 'late',
          },
        }
      }),
    }
  }

  function updateMapData(list) {
    if (!map.current?.getSource('vehicles')) return
    map.current.getSource('vehicles').setData(vehiclesToGeoJSON(list))
  }

  const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return (
    <div className="h-[calc(100vh-48px)] flex flex-col sm:flex-row">
      {/* Sidebar */}
      <div className="w-full sm:w-80 flex-shrink-0 border-b sm:border-b-0 sm:border-r border-[var(--border)] overflow-y-auto bg-[var(--paper)]">
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#22c55e] pulse-dot" />
            <h1 className="text-[15px] font-bold text-[var(--ink)]" style={{ fontFamily: 'var(--font-serif)' }}>
              Live Muni Tracker
            </h1>
          </div>
          <p className="text-[12px] text-[var(--muted)]">
            {loading ? 'Loading vehicles...' : error ? `Error: ${error}` : (
              <>
                <strong className="text-[var(--ink)]">{vehicles.length}</strong> in-service vehicles
                {outOfService > 0 && <>, {outOfService} deadheading</>}
                <br />
                Updated {lastUpdate?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
              </>
            )}
          </p>
          <p className="text-[10px] text-[var(--muted)]/50 mt-1">
            Auto-refreshes every 90s. Hover for details, click for predictions.
          </p>
        </div>

        {/* Selected vehicle detail */}
        {selectedVehicle && (
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[15px] font-bold text-[var(--ink)]" style={{ fontFamily: 'var(--font-serif)' }}>
                {selectedVehicle.routeName}
              </span>
              <button onClick={() => { setSelectedVehicle(null); setPredictions(null) }} className="text-[var(--muted)] hover:text-[var(--ink)] text-[11px]">
                Close
              </button>
            </div>
            <div className="space-y-2 text-[12px]">
              {selectedVehicle.destination && (
                <div className="text-[var(--muted)]">
                  To <span className="text-[var(--ink)] font-medium">{selectedVehicle.destination}</span>
                </div>
              )}
              <div className="text-[var(--muted)]">
                Direction: {selectedVehicle.direction === 'IB' || selectedVehicle.direction === '1' ? 'Inbound' : 'Outbound'}
              </div>
              {selectedVehicle.nextStop && (
                <div className="text-[var(--muted)]">
                  Next stop: <span className="text-[var(--ink)] font-medium">{selectedVehicle.nextStop}</span>
                  {selectedVehicle.minutesAway != null && selectedVehicle.minutesAway !== 'null' && (
                    <span className="ml-1 text-[var(--accent)] font-semibold">({selectedVehicle.minutesAway} min)</span>
                  )}
                </div>
              )}
              {formatOccupancy(selectedVehicle.occupancy) && (
                <div className="text-[var(--muted)]">
                  Occupancy: <span className="text-[var(--ink)]">{formatOccupancy(selectedVehicle.occupancy)}</span>
                </div>
              )}
              <div className="text-[10px] text-[var(--muted)]/60">
                Vehicle #{selectedVehicle.vehicleId}
              </div>

              {/* Upcoming stops */}
              {selectedVehicle.onwardStopsList?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[var(--border)]">
                  <div className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">Upcoming stops</div>
                  {selectedVehicle.onwardStopsList.map((stop, i) => (
                    <div key={i} className="text-[11px] text-[var(--muted)] py-0.5 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-[var(--muted)]/40 flex-shrink-0" />
                      {stop}
                    </div>
                  ))}
                </div>
              )}

              {/* Historical delay */}
              {selectedVehicle.historicalDelay && selectedVehicle.historicalDelay !== 'null' && (
                <div className="mt-2 p-2.5 bg-[var(--accent)]/5 border border-[var(--accent)]/15 text-[11px]" style={{ borderRadius: '3px' }}>
                  <span className="font-semibold text-[var(--accent)]">Historical pattern</span>
                  <br />
                  Based on 3 months of data, this route averages{' '}
                  <strong>{selectedVehicle.historicalDelay} min</strong> delay at {timeStr}.
                  {routeDelayMap[selectedVehicle.routeId] && (
                    <> System-wide on-time rate: <strong>{routeDelayMap[selectedVehicle.routeId].pct_on_time}%</strong>.</>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Predictions for the selected stop */}
        {predictions?.predictions?.length > 0 && (
          <div className="p-4 border-b border-[var(--border)]">
            <h3 className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
              Arriving at {predictions.predictions[0]?.stopName || 'this stop'}
            </h3>
            <div className="space-y-1.5">
              {predictions.predictions.slice(0, 8).map((p, i) => {
                const hist = getHistoricalDelay(p.routeId)
                return (
                  <div key={i} className="flex items-center justify-between text-[12px] py-1 border-b border-[var(--border)]/50 last:border-0">
                    <div>
                      <span className="font-semibold text-[var(--ink)]">{p.routeName}</span>
                      {p.destination && (
                        <span className="text-[var(--muted)] text-[11px] ml-1">to {p.destination}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`font-bold tabular-nums ${
                        p.minutesAway != null && p.minutesAway <= 5 ? 'text-[#22c55e]' : 'text-[var(--ink)]'
                      }`}>
                        {p.minutesAway != null ? `${p.minutesAway} min` : 'N/A'}
                      </span>
                      {hist && (
                        <div className="text-[10px] text-[var(--muted)]">Avg. {hist}m delay</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {predLoading && (
          <div className="p-4 text-[12px] text-[var(--muted)]">Loading predictions...</div>
        )}

        {/* Legend */}
        <div className="p-4">
          <h3 className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">Legend</h3>
          <div className="space-y-1.5 text-[12px] text-[var(--muted)]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" /> Arriving within 2 min
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#eab308]" /> ETA unknown
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" /> More than 2 min away
            </div>
          </div>
          <p className="text-[10px] text-[var(--muted)]/40 mt-3">
            Only in-service vehicles are shown. Out-of-service/deadheading vehicles are filtered out.
          </p>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="w-full h-full" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--paper)]/80">
            <div className="text-[13px] text-[var(--muted)]">Loading live data...</div>
          </div>
        )}
      </div>
    </div>
  )
}
