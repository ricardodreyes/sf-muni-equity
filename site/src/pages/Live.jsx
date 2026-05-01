import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import { useTheme } from '../ThemeContext'
import { checkMapLoad } from '../mapUsage'
import { routesByShortId } from '../data/routes'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

const POLL_INTERVAL = 90_000
// 511.org returns bare line refs ("14", "N"), so we key by route_id_short.
const routeDelayMap = routesByShortId

function computeLiveDelayByRoute(vehicles) {
  const byRoute = {}
  for (const v of vehicles) {
    if (!v.expectedArrival || !v.aimed || !v.routeId) continue
    const ex = Date.parse(v.expectedArrival)
    const am = Date.parse(v.aimed)
    if (isNaN(ex) || isNaN(am)) continue
    const min = (ex - am) / 60000
    if (Math.abs(min) > 60) continue
    if (!byRoute[v.routeId]) byRoute[v.routeId] = { routeId: v.routeId, routeName: v.routeName, delays: [] }
    byRoute[v.routeId].delays.push(min)
  }
  return Object.values(byRoute).map(r => {
    const n = r.delays.length
    const avg = r.delays.reduce((s, x) => s + x, 0) / n
    return { routeId: r.routeId, routeName: r.routeName, avgDelay: avg, vehicleCount: n }
  })
}

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
  const [selectedStop, setSelectedStop] = useState(null)
  const [predictions, setPredictions] = useState(null)
  const [predLoading, setPredLoading] = useState(false)
  const [leaderboardSort, setLeaderboardSort] = useState('late') // 'late' | 'ontime'
  const timerRef = useRef(null)
  const staticDataRef = useRef({ stops: null, routeShapes: null })

  const liveDelayByRoute = useMemo(() => computeLiveDelayByRoute(vehicles), [vehicles])
  const liveDelayLookup = useMemo(() => Object.fromEntries(liveDelayByRoute.map(r => [r.routeId, r.avgDelay])), [liveDelayByRoute])
  const leaderboard = useMemo(() => {
    const eligible = liveDelayByRoute.filter(r => r.vehicleCount >= 2)
    const sorted = [...eligible].sort((a, b) => leaderboardSort === 'late' ? b.avgDelay - a.avgDelay : a.avgDelay - b.avgDelay)
    return sorted.slice(0, 8)
  }, [liveDelayByRoute, leaderboardSort])

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

    // Route shapes (drawn first, underneath everything)
    map.current.addSource('route-lines', {
      type: 'geojson',
      data: staticDataRef.current.routeShapes || { type: 'FeatureCollection', features: [] },
    })

    map.current.addLayer({
      id: 'route-lines',
      type: 'line',
      source: 'route-lines',
      paint: {
        'line-color': [
          'case',
          ['has', 'liveDelay'],
          ['interpolate', ['linear'], ['get', 'liveDelay'],
            -2, '#22c55e',
            0, '#86efac',
            2, '#eab308',
            5, '#f97316',
            10, '#ef4444',
          ],
          isDark ? '#3b3a37' : '#c8c1b8',
        ],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 3],
        'line-opacity': ['case', ['has', 'liveDelay'], 0.85, 0.45],
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })

    // Stops (small, unobtrusive, only at higher zoom)
    map.current.addSource('stops', {
      type: 'geojson',
      data: staticDataRef.current.stops || { type: 'FeatureCollection', features: [] },
    })

    map.current.addLayer({
      id: 'stop-circles',
      type: 'circle',
      source: 'stops',
      minzoom: 13,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 1.5, 16, 3.5],
        'circle-color': isDark ? '#6b6560' : '#8a8580',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, 1],
        'circle-stroke-color': isDark ? '#111' : '#fff',
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 16, 0.9],
      },
    })

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

    // Stop hover popup
    const stopPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '220px' })
    map.current.on('mouseenter', 'stop-circles', (e) => {
      map.current.getCanvas().style.cursor = 'pointer'
      const p = e.features[0].properties
      stopPopup
        .setLngLat(e.lngLat)
        .setHTML(`<strong style="font-size:12px">${esc(p.stop_name)}</strong><br/><span style="color:#999;font-size:10px">Stop ${esc(p.stop_code)}</span>`)
        .addTo(map.current)
    })
    map.current.on('mouseleave', 'stop-circles', () => {
      map.current.getCanvas().style.cursor = ''
      stopPopup.remove()
    })
    map.current.on('click', 'stop-circles', (e) => {
      const p = e.features[0].properties
      fetchPredictions(p.stop_code)
      setSelectedVehicle(null)
      setSelectedStop({ stop_id: p.stop_id, stop_code: p.stop_code, stop_name: p.stop_name, lngLat: e.lngLat })
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
      // Fetch static shape + stop data in parallel with first vehicles poll
      const [shapesRes, stopsRes, initial] = await Promise.all([
        fetch('/data/muni_routes.geojson').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/data/muni_stops.geojson').then(r => r.ok ? r.json() : null).catch(() => null),
        fetchVehicles(),
      ])
      staticDataRef.current.routeShapes = shapesRes
      staticDataRef.current.stops = stopsRes
      addLayers(dark)
      updateMapData(initial)
      applyLiveDelayToRoutes(computeLiveDelayByRoute(initial))
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

  // Polling – pause when the tab is hidden to spare the 511.org quota
  useEffect(() => {
    const poll = async () => {
      if (document.hidden) return
      const v = await fetchVehicles()
      updateMapData(v)
      applyLiveDelayToRoutes(computeLiveDelayByRoute(v))
    }
    timerRef.current = setInterval(poll, POLL_INTERVAL)
    const onVisible = () => { if (!document.hidden) poll() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchVehicles])

  const refreshNow = useCallback(async () => {
    const v = await fetchVehicles()
    updateMapData(v)
    applyLiveDelayToRoutes(computeLiveDelayByRoute(v))
  }, [fetchVehicles])

  function applyLiveDelayToRoutes(liveByRoute) {
    if (!map.current?.getSource('route-lines')) return
    const shapes = staticDataRef.current.routeShapes
    if (!shapes) return
    const lookup = Object.fromEntries(liveByRoute.map(r => [r.routeId, r.avgDelay]))
    const updated = {
      type: 'FeatureCollection',
      features: shapes.features.map(f => {
        const id = f.properties.route_id
        if (lookup[id] == null) return f
        return { ...f, properties: { ...f.properties, liveDelay: Number(lookup[id].toFixed(2)) } }
      }),
    }
    map.current.getSource('route-lines').setData(updated)
  }

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
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#22c55e] pulse-dot" />
              <h1 className="text-[15px] font-bold text-[var(--ink)]" style={{ fontFamily: 'var(--font-serif)' }}>
                Live Muni Tracker
              </h1>
            </div>
            <button
              onClick={refreshNow}
              disabled={loading}
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 border border-[var(--border)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--ink)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderRadius: '3px' }}
              aria-label="Refresh data now"
            >
              Refresh
            </button>
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
            Auto-refreshes every 90s; pauses when the tab is hidden. Hover a vehicle for details, click a stop for live arrivals.
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
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                Arriving at {selectedStop?.stop_name || predictions.predictions[0]?.stopName || 'this stop'}
              </h3>
              {selectedStop && (
                <button
                  onClick={() => { setSelectedStop(null); setPredictions(null) }}
                  className="text-[var(--muted)] hover:text-[var(--ink)] text-[11px]"
                >
                  Close
                </button>
              )}
            </div>
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

        {/* Live route leaderboard */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
              Routes right now
            </h3>
          </div>
          <div className="flex gap-0 mb-3 text-[11px] font-medium border border-[var(--border)]" style={{ borderRadius: '3px' }}>
            <button
              onClick={() => setLeaderboardSort('late')}
              className={`flex-1 px-2 py-1 transition-colors ${leaderboardSort === 'late' ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
            >
              Most delayed
            </button>
            <button
              onClick={() => setLeaderboardSort('ontime')}
              className={`flex-1 px-2 py-1 transition-colors border-l border-[var(--border)] ${leaderboardSort === 'ontime' ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
            >
              Most on-time
            </button>
          </div>
          {leaderboard.length === 0 ? (
            <div className="text-[11px] text-[var(--muted)]/60">Gathering live arrival data...</div>
          ) : (
            <div className="space-y-1">
              {leaderboard.map((r) => {
                const late = r.avgDelay > 0
                const color = r.avgDelay > 5 ? '#ef4444' : r.avgDelay > 2 ? '#f97316' : r.avgDelay > 0 ? '#eab308' : '#22c55e'
                return (
                  <div key={r.routeId} className="flex items-center justify-between text-[12px] py-1 border-b border-[var(--border)]/40 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="font-medium text-[var(--ink)] truncate">{r.routeName}</span>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <span className="font-bold tabular-nums" style={{ color }}>
                        {late ? '+' : ''}{r.avgDelay.toFixed(1)}m
                      </span>
                      <div className="text-[9px] text-[var(--muted)]/70">{r.vehicleCount} vehicle{r.vehicleCount === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-[10px] text-[var(--muted)]/50 mt-2">
            Avg. minutes late or early, computed from live 511.org arrival estimates across currently tracked vehicles.
          </p>
        </div>

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
            <div className="mt-2 pt-2 border-t border-[var(--border)]/40 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-block w-6 h-0.5" style={{ background: '#22c55e' }} /> Route on-time now
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-6 h-0.5" style={{ background: '#ef4444' }} /> Route running late now
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted)]/60" /> Bus stop (at zoom 13+)
              </div>
            </div>
          </div>
          <p className="text-[10px] text-[var(--muted)]/40 mt-3">
            Only in-service vehicles are shown. Click a stop for live arrival predictions.
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
