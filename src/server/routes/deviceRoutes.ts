import { uncleaner } from 'cleaners'

import { adjustEvents, getEventsByDeviceId } from '../../db/couchPushEvents'
import {
  asDevicePayload,
  asDeviceUpdatePayload
} from '../../types/pushApiTypes'
import { jsonResponse } from '../../types/responseTypes'
import { checkPayload } from '../../util/checkPayload'
import { locateIp } from '../../util/services/ip-api'
import { withDevice } from '../middleware/withDevice'

const wasDevicePayload = uncleaner(asDevicePayload)

/**
 * POST /v2/device
 */
export const deviceFetchRoute = withDevice(async request => {
  const {
    connections,
    deviceRow: { device },
    ip,
    log
  } = request

  const eventRows = await getEventsByDeviceId(connections, device.deviceId)

  if (ip !== device.ip) {
    const location = await locateIp(ip).catch(error => {
      log(`Location unavailable: ${String(error)}`)
      return undefined
    })
    device.ip = ip
    device.location = location
  }

  return jsonResponse(
    wasDevicePayload({
      events: eventRows.map(row => row.event),
      ignoreMarketing: device.ignoreMarketing,
      ignorePriceChanges: device.ignorePriceChanges,
      loginIds: device.loginIds
    })
  )
})

/**
 * POST /v2/device/update
 */
export const deviceUpdateRoute = withDevice(async request => {
  const {
    connections,
    date,
    deviceRow: { device },
    ip,
    log,
    payload
  } = request

  const checked = checkPayload(asDeviceUpdatePayload, payload)
  if (checked.error != null) return checked.error
  const {
    loginIds,
    createEvents,
    ignoreMarketing,
    ignorePriceChanges,
    removeEvents
  } = checked.clean

  if (ignoreMarketing != null) {
    device.ignoreMarketing = ignoreMarketing
  }
  if (ignorePriceChanges != null) {
    device.ignorePriceChanges = ignorePriceChanges
  }
  if (loginIds != null) {
    device.loginIds = loginIds
  }

  if (ip !== device.ip) {
    const location = await locateIp(ip).catch(error => {
      log(`Location unavailable: ${String(error)}`)
      return undefined
    })
    device.ip = ip
    device.location = location
  }

  const events = await adjustEvents(connections, {
    date,
    deviceId: device.deviceId,
    createEvents,
    removeEvents
  })

  return jsonResponse(
    wasDevicePayload({
      events,
      ignoreMarketing: device.ignoreMarketing,
      ignorePriceChanges: device.ignorePriceChanges,
      loginIds: device.loginIds
    })
  )
})
