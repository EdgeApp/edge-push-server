import { uncleaner } from 'cleaners'

import { adjustEvents, getEventsByLoginId } from '../../db/couchPushEvents'
import { asLoginPayload, asLoginUpdatePayload } from '../../types/pushApiTypes'
import { errorResponse, jsonResponse } from '../../types/responseTypes'
import { checkPayload } from '../../util/checkPayload'
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
  const { connection, date, payload, log, loginId } = request

  if (loginId == null) {
    return errorResponse('No login provided', { status: 400 })
  }

  const checked = checkPayload(asLoginUpdatePayload, payload)
  if (checked.error != null) return checked.error
  const { createEvents, removeEvents } = checked.clean

  const events = await adjustEvents(
    connection,
    {
      date,
      loginId,
      createEvents,
      removeEvents
    },
    log
  )
  return jsonResponse(wasLoginPayload({ events }))
})
