import { asMaybe, uncleaner } from 'cleaners'

import { adjustEvents, getEventsByDeviceId } from '../../db/couchPushEvents'
import {
  asDevicePayload,
  asDeviceUpdatePayload
} from '../../types/pushApiTypes'
import { errorResponse, jsonResponse } from '../../types/responseTypes'
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
      loginIds: device.loginIds,
      events: eventRows.map(row => row.event)
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

  const clean = asMaybe(asDeviceUpdatePayload)(payload)
  if (clean == null) {
    return errorResponse('Incorrect device update payload', { status: 400 })
  }

  device.loginIds = clean.loginIds
  const events = await adjustEvents(connection, {
    date,
    deviceId: device.deviceId,
    createEvents: clean.createEvents,
    removeEvents: clean.removeEvents
  })

  return jsonResponse(wasDevicePayload({ loginIds: device.loginIds, events }))
})
