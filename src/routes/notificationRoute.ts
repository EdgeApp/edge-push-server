import { asObject, asOptional, asString } from 'cleaners'
import { asMaybeNotFoundError } from 'edge-server-tools'
import nano from 'nano'
import { Serverlet } from 'serverlet'

import { asCouchDevice, devicesSetup, unpackDevice } from '../db/couchDevices'
import { fetchUser, saveUserToDB } from '../db/couchUsers'
import { serverConfig } from '../serverConfig'
import { Device } from '../types/pushTypes'
import { ApiRequest } from '../types/requestTypes'
import { errorResponse, jsonResponse } from '../types/responseTypes'
import { makePushSender } from '../util/pushSender'

const connection = nano(serverConfig.couchUri)

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

  const user = await fetchUser(connection, userId)
  if (user == null) {
    return errorResponse('User does not exist.', { status: 404 })
  }

  const tokens: string[] = []
  const devices: Device[] = []

  let updated = false
  for (const deviceId in user.devices) {
    const raw = await connection.db
      .use(devicesSetup.name)
      .get(deviceId)
      .catch(error => {
        if (asMaybeNotFoundError(error) != null) return
        throw error
      })
    const deviceDoc = asCouchDevice(raw)
    const device = unpackDevice(deviceDoc)
    if (device != null) {
      devices.push(device)
      continue
    }

    delete user.devices[deviceId]
    updated = true
  }

  if (updated) await saveUserToDB(connection, user)
  for (const device of devices) {
    if (device.tokenId != null) {
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
