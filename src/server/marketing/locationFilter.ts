import { Device } from '../../types/pushTypes'

/**
 * An include/exclude filter over the city and region a device is located in.
 * The lists hold normalized values (see `parseLocationList`).
 */
export interface LocationFilter {
  cityInclude: string[]
  cityExclude: string[]
  regionInclude: string[]
  regionExclude: string[]
}

/**
 * Why a device cannot receive a marketing push.
 */
export type DeviceSkipReason =
  | 'ignore-marketing'
  | 'unregistered'
  | 'invalid-token'

// Firebase tokens are alphanumerics plus these separators. Anything else is a
// corrupt row that would only fail at delivery time:
const VALID_TOKEN = /^[a-zA-Z0-9_\-:]+$/

/**
 * Normalizes one include/exclude box: each line is a separate value, blank
 * lines are dropped, and matching is case-insensitive.
 */
export function parseLocationList(lines: string[]): string[] {
  const out = new Set<string>()
  for (const line of lines) {
    const value = line.trim().toLowerCase()
    if (value !== '') out.add(value)
  }
  return [...out]
}

/**
 * Decides whether a device's location passes the filter. Values within one box
 * are OR'd together, and the boxes are AND'ed with each other. An empty include
 * box means "no restriction", while an empty exclude box excludes nothing.
 *
 * Country is deliberately absent: the caller selects it through the Couch view
 * prefix, so re-checking it here could only disagree with the query.
 */
export function matchesLocationFilter(
  location: Device['location'],
  filter: LocationFilter
): boolean {
  if (location == null) return false
  const city = location.city.trim().toLowerCase()
  const region = location.region.trim().toLowerCase()

  return (
    passes(city, filter.cityInclude, filter.cityExclude) &&
    passes(region, filter.regionInclude, filter.regionExclude)
  )
}

function passes(value: string, include: string[], exclude: string[]): boolean {
  if (include.length > 0 && !include.includes(value)) return false
  return !exclude.includes(value)
}

/** The parts of a device that decide whether it can be sent to. */
export type SendableFields = Pick<
  Device,
  'apiKey' | 'deviceToken' | 'ignoreMarketing'
>

/**
 * Reports why a device cannot be sent to, or undefined if it can.
 *
 * The `targetApiKeys` are the app keys the marketing key may send to. Location
 * queries get their scoping from the Couch view, but a send driven by a
 * caller-supplied list of device ids does not, and the publish daemon resolves
 * Firebase credentials from whatever key the device itself carries.
 *
 * This takes only the fields it reads so that queries can apply it to view
 * rows, and sends to whole documents, without the two drifting apart.
 */
export function getDeviceSkipReason(
  device: SendableFields,
  targetApiKeys: ReadonlySet<string>
): DeviceSkipReason | undefined {
  const { apiKey, deviceToken, ignoreMarketing } = device

  if (ignoreMarketing) return 'ignore-marketing'
  if (
    apiKey == null ||
    !targetApiKeys.has(apiKey) ||
    deviceToken == null ||
    deviceToken.trim() === ''
  ) {
    return 'unregistered'
  }
  if (!VALID_TOKEN.test(deviceToken)) return 'invalid-token'
}
