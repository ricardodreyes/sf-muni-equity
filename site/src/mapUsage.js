// Hard limits from Mapbox free tier
const LIMITS = {
  mapLoads: 50_000,
  tileRequests: 200_000,
  staticImages: 50_000,
}

// Warn at 80% of limit
const WARN_THRESHOLD = 0.8

function getMonthKey() {
  const d = new Date()
  return `mapbox_${d.getFullYear()}_${d.getMonth()}`
}

function getUsage() {
  try {
    return JSON.parse(localStorage.getItem(getMonthKey())) || { mapLoads: 0 }
  } catch {
    return { mapLoads: 0 }
  }
}

function saveUsage(usage) {
  localStorage.setItem(getMonthKey(), JSON.stringify(usage))
}

/**
 * Call before initializing a Mapbox map instance.
 * Returns { allowed: boolean, warning: string|null, count: number }
 * If allowed is false, do NOT create the map.
 */
export function checkMapLoad() {
  const usage = getUsage()
  const count = usage.mapLoads + 1

  if (count > LIMITS.mapLoads) {
    return {
      allowed: false,
      warning: `Monthly map load limit reached (${LIMITS.mapLoads.toLocaleString()}). Map disabled to prevent overage charges.`,
      count,
    }
  }

  // Record the load
  usage.mapLoads = count
  saveUsage(usage)

  if (count > LIMITS.mapLoads * WARN_THRESHOLD) {
    return {
      allowed: true,
      warning: `Approaching monthly map load limit: ${count.toLocaleString()} / ${LIMITS.mapLoads.toLocaleString()} (${Math.round(count / LIMITS.mapLoads * 100)}%)`,
      count,
    }
  }

  return { allowed: true, warning: null, count }
}

export function getMapLoadCount() {
  return getUsage().mapLoads
}

export { LIMITS }
