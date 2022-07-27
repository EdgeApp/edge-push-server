import { asObject, asOptional, asString } from 'cleaners'
import { Serverlet } from 'serverlet'

import { User } from '../models/User'
import { ApiRequest } from '../types/requestTypes'
import { errorResponse, jsonResponse } from '../types/responseTypes'
import { makePushSender } from '../util/pushSender'

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
  const sender = await makePushSender(apiKey)

  const user = await User.fetch(userId)
  if (!user) return errorResponse('User does not exist.', { status: 404 })

  const tokens: string[] = []
  const devices = await user.fetchDevices()
  for (const device of devices) {
    if (device.tokenId) {
      tokens.push(device.tokenId)
    }
  }

  const response = await sender.send(title, body, tokens, data)
  const { successCount, failureCount } = response
  log(
    `Sent notifications to user ${userId} devices: ${successCount} success - ${failureCount} failure`
  )

  return jsonResponse(response)
}

const asSendNotificationBody = asObject({
  title: asString,
  body: asString,
  data: asOptional(asObject(asString)),
  userId: asString // Should be named `loginId`
})
