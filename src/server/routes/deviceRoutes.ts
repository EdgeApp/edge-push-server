import { uncleaner } from 'cleaners'

import { adjustEvents, getEventsByDeviceId } from '../../db/couchPushEvents'
import {
  asDevicePayload,
  asDeviceUpdatePayload
} from '../../types/pushApiTypes'
import { jsonResponse } from '../../types/responseTypes'
import { checkPayload } from '../../util/checkPayload'
import { withDevice } from '../middleware/withDevice'

const wasDevicePayload = uncleaner(asDevicePayload)

/**
 * POST /v2/device
 */
export const deviceFetchRoute = withDevice(async request => {
  const {
    connection,
    deviceRow: { device }
  } = request

  const eventRows = await getEventsByDeviceId(connection, device.deviceId)

  return jsonResponse(
    wasDevicePayload({
      events: eventRows.map(row => row.event),
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
    connection,
    date,
    deviceRow: { device },
    payload
  } = request

  const checked = checkPayload(asDeviceUpdatePayload, payload)
  if (checked.error != null) return checked.error
  const { loginIds, createEvents, ignorePriceChanges, removeEvents } =
    checked.clean

  if (ignorePriceChanges != null) {
    device.ignorePriceChanges = ignorePriceChanges
  }
  if (loginIds != null) {
    device.loginIds = loginIds
  }
  const events = await adjustEvents(connection, {
    date,
    deviceId: device.deviceId,
    createEvents,
    removeEvents
  })

  return jsonResponse(
    wasDevicePayload({
      events,
      ignorePriceChanges: device.ignorePriceChanges,
      loginIds: device.loginIds
    })
  )
})