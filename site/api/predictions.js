export default async function handler(req, res) {
  const API_KEY = process.env.API_KEY_511
  if (!API_KEY) {
    return res.status(500).json({ error: 'API_KEY_511 not configured' })
  }

  const { stopId } = req.query
  if (!stopId) {
    return res.status(400).json({ error: 'stopId query parameter required' })
  }

  try {
    const url = `http://api.511.org/transit/StopMonitoring?api_key=${API_KEY}&agency=SF&stopCode=${stopId}&format=json`
    const response = await fetch(url)

    if (!response.ok) {
      return res.status(response.status).json({ error: `511.org returned ${response.status}` })
    }

    const raw = await response.text()
    const cleaned = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw
    const data = JSON.parse(cleaned)

    const delivery = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery
    if (!delivery) {
      return res.status(200).json({ predictions: [], stopId, timestamp: new Date().toISOString() })
    }

    const visits = delivery.MonitoredStopVisit || delivery[0]?.MonitoredStopVisit || []

    const predictions = visits
      .map(v => {
        const vj = v.MonitoredVehicleJourney
        if (!vj) return null

        const call = vj.MonitoredCall
        if (!call) return null

        const expected = call.ExpectedArrivalTime || call.ExpectedDepartureTime
        const aimed = call.AimedArrivalTime || call.AimedDepartureTime
        const now = new Date()
        const expectedDate = expected ? new Date(expected) : null
        const minutesAway = expectedDate ? Math.max(0, Math.round((expectedDate - now) / 60000)) : null

        return {
          routeId: vj.LineRef || '',
          routeName: vj.PublishedLineName || vj.LineRef || '',
          direction: vj.DirectionRef || '',
          destination: vj.DestinationName || '',
          vehicleId: vj.VehicleRef || '',
          expectedArrival: expected || '',
          aimedArrival: aimed || '',
          minutesAway,
          stopName: call.StopPointName || '',
          occupancy: vj.Occupancy || null,
        }
      })
      .filter(Boolean)
      .sort((a, b) => (a.minutesAway ?? 999) - (b.minutesAway ?? 999))

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=15')
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(200).json({
      predictions,
      stopId,
      count: predictions.length,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
