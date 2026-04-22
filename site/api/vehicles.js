export default async function handler(req, res) {
  const API_KEY = process.env.API_KEY_511
  if (!API_KEY) {
    return res.status(500).json({ error: 'API_KEY_511 not configured' })
  }

  try {
    const url = `https://api.511.org/transit/VehicleMonitoring?api_key=${API_KEY}&agency=SF&format=json`
    const response = await fetch(url)

    if (!response.ok) {
      return res.status(response.status).json({ error: `511.org returned ${response.status}` })
    }

    const raw = await response.text()
    const cleaned = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw
    const data = JSON.parse(cleaned)

    const delivery = data?.Siri?.ServiceDelivery?.VehicleMonitoringDelivery
    if (!delivery) {
      return res.status(200).json({ vehicles: [], timestamp: new Date().toISOString() })
    }

    const activities = delivery.VehicleActivity || delivery[0]?.VehicleActivity || []

    const vehicles = activities
      .map(a => {
        const vj = a.MonitoredVehicleJourney
        if (!vj) return null

        const loc = vj.VehicleLocation
        if (!loc) return null

        const call = vj.MonitoredCall || {}

        // Build upcoming stops list from OnwardCalls
        const onwardCalls = (vj.OnwardCalls?.OnwardCall || []).slice(0, 5).map(oc => ({
          stopName: oc.StopPointName || '',
          stopId: oc.StopPointRef || '',
          expectedArrival: oc.ExpectedArrivalTime || '',
          aimedArrival: oc.AimedArrivalTime || '',
        }))

        return {
          vehicleId: vj.VehicleRef || '',
          routeId: vj.LineRef || '',
          routeName: vj.PublishedLineName || vj.LineRef || '',
          direction: vj.DirectionRef || '',
          destination: vj.DestinationName || '',
          origin: vj.OriginName || '',
          monitored: vj.Monitored !== false,
          lat: parseFloat(loc.Latitude),
          lon: parseFloat(loc.Longitude),
          bearing: vj.Bearing ? parseFloat(vj.Bearing) : null,
          nextStop: call.StopPointName || '',
          nextStopId: call.StopPointRef || '',
          expectedArrival: call.ExpectedArrivalTime || '',
          aimed: call.AimedArrivalTime || '',
          distanceFromStop: call.DistanceFromStop ? parseFloat(call.DistanceFromStop) : null,
          occupancy: vj.Occupancy || null,
          onwardCalls,
          timestamp: a.RecordedAtTime || '',
          inService: !!(vj.LineRef),
        }
      })
      .filter(Boolean)
      .filter(v => !isNaN(v.lat) && !isNaN(v.lon))

    // Separate in-service from deadheading
    const inService = vehicles.filter(v => v.inService)
    const outOfService = vehicles.filter(v => !v.inService)

    res.setHeader('Cache-Control', 's-maxage=90, stale-while-revalidate=30')
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(200).json({
      vehicles: inService,
      outOfService: outOfService.length,
      count: inService.length,
      totalVehicles: vehicles.length,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
