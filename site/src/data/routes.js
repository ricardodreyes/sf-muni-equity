import raw from './routes.json'

const TYPE_OVERRIDES = {
  'SF:PH': 'cable_car',
  'SF:PM': 'cable_car',
  'SF:CA': 'cable_car',
  'SF:J': 'light_rail',
  'SF:K': 'light_rail',
  'SF:L': 'light_rail',
  'SF:M': 'light_rail',
  'SF:N': 'light_rail',
  'SF:T': 'light_rail',
}

export const routes = raw.map(r => ({
  ...r,
  route_id_short: r.route_id.replace(/^SF:/, ''),
  route_type: TYPE_OVERRIDES[r.route_id] ?? r.route_type,
}))

export const routesByShortId = Object.fromEntries(routes.map(r => [r.route_id_short, r]))
export const routesByLongId = Object.fromEntries(routes.map(r => [r.route_id, r]))

export default routes
