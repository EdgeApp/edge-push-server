import { asObject, asOptional, asString, asUnknown } from 'cleaners'
import { Serverlet } from 'serverlet'

import { User } from '../models/User'
import { NotificationManager } from '../NotificationManager'
import { ApiRequest } from '../types/requestTypes'
import { errorResponse, jsonResponse } from '../types/responseTypes'

/**
 * The login server names this `sendNotification`,
 * and calls it when there is a new device login.
 *
 * POST /v1/notification/send
 * Request body: asSendNotificationBody
 * Response body: unused
 */
export const sendNotificationV1Route: Serverlet<ApiRequest> = async request => {
  const { apiKey, json, log } = request
  const { title, body, data, userId } = asSendNotificationBody(json)

  if (!apiKey.admin) return errorResponse('Not an admin', { status: 401 })
  const manager = await NotificationManager.init(apiKey)

  const user = await User.fetch(userId)
  if (!user) return errorResponse('User does not exist.', { status: 404 })

  const tokens: string[] = []
  const devices = await user.fetchDevices()
  for (const device of devices) {
    if (device.tokenId) {
      tokens.push(device.tokenId)
    }
  }

  const response = await manager.send(title, body, tokens, data)
  const { successCount, failureCount } = response
  log(
    `Sent notifications to user ${userId} devices: ${successCount} success - ${failureCount} failure`
  )

  return jsonResponse(response)
}

const asSendNotificationBody = asObject({
  title: asString,
  body: asString,
  data: asOptional(asObject(asUnknown)),
  userId: asString // Should be named `loginId`
})
