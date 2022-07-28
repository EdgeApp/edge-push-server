import { asMaybe } from 'cleaners'
import { Serverlet } from 'serverlet'

import { getApiKeyByKey } from '../../db/couchApiKeys'
import { getDeviceById } from '../../db/couchDevices'
import { asPushRequestBody } from '../../types/pushApiTypes'
import { DbRequest, DeviceRequest } from '../../types/requestTypes'
import { errorResponse } from '../../types/responseTypes'

/**
 * Parses the request payload and looks up the device.
 * Legacy routes do not use this one.
 */
export const withDevice =
  (server: Serverlet<DeviceRequest>): Serverlet<DbRequest> =>
  async request => {
    const { connection, date, log, req } = request

    // Parse the common request body:
    const body = asMaybe(asPushRequestBody)(req.body)
    if (body == null) {
      return errorResponse('Bad request body', { status: 400 })
    }

    // Look up the key in the database:
    const apiKey = await log.debugTime(
      'getApiKeyByKey',
      getApiKeyByKey(connection, body.apiKey)
    )
    if (apiKey == null) {
      return errorResponse('Incorrect API key', { status: 401 })
    }

    // Look up the device in the database, or get a dummy row:
    const deviceRow = await log.debugTime(
      'getDeviceById',
      getDeviceById(connection, body.deviceId, date)
    )
    if (body.apiKey != null) {
      deviceRow.device.apiKey = body.apiKey
    }
    if (body.deviceToken != null) {
      deviceRow.device.deviceToken = body.deviceToken
    }
    deviceRow.device.visited = date

    // Pass that along:
    const result = await server({
      ...request,
      apiKey,
      deviceRow,
      loginId: body.loginId,
      payload: body.data
    })

    // Flush any changes (such as the visited date):
    await deviceRow.save()

    return result
  }
