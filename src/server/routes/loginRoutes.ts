import { asMaybe, uncleaner } from 'cleaners'

import { adjustEvents, getEventsByLoginId } from '../../db/couchPushEvents'
import { asLoginPayload, asLoginUpdatePayload } from '../../types/pushApiTypes'
import { errorResponse, jsonResponse } from '../../types/responseTypes'
import { withDevice } from '../middleware/withDevice'

const wasLoginPayload = uncleaner(asLoginPayload)

/**
 * POST /v2/login
 */
export const loginFetchRoute = withDevice(async request => {
  const { connection, loginId } = request

  if (loginId == null) {
    return errorResponse('No login provided', { status: 400 })
  }

  const eventRows = await getEventsByLoginId(connection, loginId)
  return jsonResponse(
    wasLoginPayload({
      events: eventRows.map(row => row.event)
    })
  )
})

/**
 * POST /v2/login/update
 */
export const loginUpdateRoute = withDevice(async request => {
  const { connection, date, payload, loginId } = request

  if (loginId == null) {
    return errorResponse('No login provided', { status: 400 })
  }
  const clean = asMaybe(asLoginUpdatePayload)(payload)
  if (clean == null) {
    return errorResponse('Incorrect login update payload', { status: 400 })
  }

  const events = await adjustEvents(connection, {
    date,
    loginId,
    createEvents: clean.createEvents,
    removeEvents: clean.removeEvents
  })
  return jsonResponse(wasLoginPayload({ events }))
})
