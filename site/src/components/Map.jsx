import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { useTheme } from '../ThemeContext'
import { checkMapLoad } from '../mapUsage'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

const LIGHT_STYLE = 'mapbox://styles/mapbox/light-v11'
const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11'

function esc(val) {
  return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export default function Map({ onRouteClick, className = '' }) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [layerMode, setLayerMode] = useState('income')
  const [loading, setLoading] = useState(true)
  const [blocked, setBlocked] = useState(null)
  const [warning, setWarning] = useState(null)
  const { dark } = useTheme()
  const dataLoaded = useRef(false)

  // Check usage limit before creating map
  useEffect(() => {
    if (map.current) return

    const usage = checkMapLoad()
    if (!usage.allowed) {
      setBlocked(usage.warning)
      setLoading(false)
      return
    }
    if (usage.warning) {
      setWarning(usage.warning)
    }

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: dark ? DARK_STYLE : LIGHT_STYLE,
      center: [-122.44, 37.76],
      zoom: 11.5,
      maxBounds: [[-122.55, 37.69], [-122.33, 37.83]],
    })

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.current.on('load', async () => {
      await addDataLayers()
      setLoading(false)
    })

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
        dataLoaded.current = false
      }
    }
  }, [])

  // Switch map style on theme change (without re-creating the map)
  useEffect(() => {
    if (!map.current || blocked) return
    const targetStyle = dark ? DARK_STYLE : LIGHT_STYLE
    map.current.setStyle(targetStyle)
    map.current.once('style.load', () => {
      addDataLayers()
    })
  }, [dark])

  async function addDataLayers() {
    if (!map.current) return

    const [tractsRes, routesRes] = await Promise.all([
      fetch('/data/tracts.geojson').then(r => r.json()),
      fetch('/data/route-shapes.geojson').then(r => r.json()),
    ])

    // Census tracts choropleth
    if (map.current.getSource('tracts')) map.current.removeLayer('tracts-fill'), map.current.removeLayer('tracts-outline'), map.current.removeSource('tracts')
    map.current.addSource('tracts', { type: 'geojson', data: tractsRes })

    map.current.addLayer({
      id: 'tracts-fill',
      type: 'fill',
      source: 'tracts',
      paint: {
        'fill-color': getIncomeColorExpr(),
        'fill-opacity': 0.6,
      },
    })

    map.current.addLayer({
      id: 'tracts-outline',
      type: 'line',
      source: 'tracts',
      paint: {
        'line-color': dark ? '#444' : '#666',
        'line-width': 0.5,
        'line-opacity': 0.4,
      },
    })

    // Route shapes
    if (map.current.getSource('routes')) map.current.removeLayer('routes-line'), map.current.removeSource('routes')
    map.current.addSource('routes', { type: 'geojson', data: routesRes })

    map.current.addLayer({
      id: 'routes-line',
      type: 'line',
      source: 'routes',
      paint: {
        'line-color': [
          'case',
          ['==', ['get', 'performance'], 'good'], '#22c55e',
          ['==', ['get', 'performance'], 'fair'], '#eab308',
          '#ef4444',
        ],
        'line-width': 3,
        'line-opacity': 0.85,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })

    // Hover popup for tracts
    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
    map.current.on('mousemove', 'tracts-fill', (e) => {
      map.current.getCanvas().style.cursor = 'pointer'
      const props = e.features[0].properties
      popup.setLngLat(e.lngLat).setHTML(`
        <strong>${esc(props.name)}</strong><br/>
        Median Income: $${Number(props.median_income).toLocaleString()}<br/>
        Avg Delay: ${esc(props.avg_delay_min)} min<br/>
        Routes: ${esc(props.num_routes)}
      `).addTo(map.current)
    })
    map.current.on('mouseleave', 'tracts-fill', () => {
      map.current.getCanvas().style.cursor = ''
      popup.remove()
    })

    // Hover popup for routes
    const routePopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
    map.current.on('mousemove', 'routes-line', (e) => {
      map.current.getCanvas().style.cursor = 'pointer'
      const props = e.features[0].properties
      routePopup.setLngLat(e.lngLat).setHTML(`
        <strong>${esc(props.route_name)}</strong><br/>
        Avg Delay: ${esc(props.avg_delay_min)} min<br/>
        On-time: ${esc(props.pct_on_time)}%
      `).addTo(map.current)
    })
    map.current.on('mouseleave', 'routes-line', () => {
      map.current.getCanvas().style.cursor = ''
      routePopup.remove()
    })

    // Click route line
    map.current.on('click', 'routes-line', (e) => {
      if (onRouteClick && e.features[0]) {
        onRouteClick(e.features[0].properties.route_id)
      }
    })

    dataLoaded.current = true
  }

  function getIncomeColorExpr() {
    return [
      'interpolate', ['linear'], ['get', 'median_income'],
      30000, '#7b3294', 60000, '#c2a5cf', 90000, '#f7f7f7',
      130000, '#a6dba0', 200000, '#008837',
    ]
  }

  function getDelayColorExpr() {
    return [
      'interpolate', ['linear'], ['get', 'avg_delay_min'],
      1.5, '#008837', 3, '#a6dba0', 4.5, '#f7f7f7',
      5.5, '#c2a5cf', 7, '#7b3294',
    ]
  }

  const toggleLayer = (mode) => {
    setLayerMode(mode)
    if (!map.current?.isStyleLoaded() || !dataLoaded.current) return

    map.current.setPaintProperty(
      'tracts-fill',
      'fill-color',
      mode === 'income' ? getIncomeColorExpr() : getDelayColorExpr()
    )
  }

  if (blocked) {
    return (
      <div className={`relative ${className}`}>
        <div className="w-full h-full rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="text-red-500 font-semibold mb-2">Map Disabled</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{blocked}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={mapContainer} className="w-full h-full rounded-xl overflow-hidden" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80 dark:bg-gray-900/80 rounded-xl">
          <div className="text-sm text-gray-500 dark:text-gray-400">Loading map data...</div>
        </div>
      )}

      {warning && (
        <div className="absolute top-3 right-14 bg-yellow-100 dark:bg-yellow-900/80 text-yellow-800 dark:text-yellow-200 text-xs px-3 py-1.5 rounded-lg shadow z-10">
          {warning}
        </div>
      )}

      {/* Layer toggle */}
      <div className="absolute top-3 left-3 bg-white dark:bg-[#1e2130] rounded-lg shadow-lg p-1 flex gap-1 text-xs font-medium z-10">
        <button
          onClick={() => toggleLayer('income')}
          className={`px-3 py-1.5 rounded-md transition-colors ${
            layerMode === 'income'
              ? 'bg-[#1a1f36] dark:bg-white text-white dark:text-[#1a1f36]'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'
          }`}
        >
          Income
        </button>
        <button
          onClick={() => toggleLayer('delay')}
          className={`px-3 py-1.5 rounded-md transition-colors ${
            layerMode === 'delay'
              ? 'bg-[#1a1f36] dark:bg-white text-white dark:text-[#1a1f36]'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'
          }`}
        >
          Delay
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-white/95 dark:bg-[#1e2130]/95 backdrop-blur rounded-lg shadow-lg p-3 text-xs z-10 dark:text-gray-300">
        <div className="font-semibold mb-2">
          {layerMode === 'income' ? 'Median Household Income' : 'Average Delay'}
        </div>
        <div className="flex items-center gap-1">
          <span>{layerMode === 'income' ? '$30k' : '1.5 min'}</span>
          <div className="flex h-3 rounded overflow-hidden">
            {['#7b3294', '#c2a5cf', '#f7f7f7', '#a6dba0', '#008837'].map((c) => (
              <div key={c} className="w-6" style={{ background: c }} />
            ))}
          </div>
          <span>{layerMode === 'income' ? '$200k+' : '7+ min'}</span>
        </div>
        <div className="mt-2 font-semibold">Route Performance</div>
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-[#22c55e] inline-block" /> Good</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-[#eab308] inline-block" /> Fair</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-[#ef4444] inline-block" /> Poor</span>
        </div>
      </div>
    </div>
  )
}
