import {
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asString,
  asValue
} from 'cleaners'
import nano from 'nano'
import { Serverlet } from 'serverlet'

import { fetchDevice, saveDeviceToDB } from '../db/couchDevices'
import { fetchUser, saveUserToDB } from '../db/couchUsers'
import { serverConfig } from '../serverConfig'
import { ApiRequest } from '../types/requestTypes'
import { errorResponse, jsonResponse } from '../types/responseTypes'

const connection = nano(serverConfig.couchUri)

/**
 * The GUI names this `registerDevice`, and calls it at boot.
 *
 * POST /v1/device?deviceId=...
 * Request body: asRegisterDeviceRequest
 * Response body: unused
 */
export const registerDeviceV1Route: Serverlet<ApiRequest> = async request => {
  const { json, log, query } = request
  const { deviceId } = asRegisterDeviceQuery(query)
  const clean = asRegisterDeviceRequest(json)

  let device = await fetchDevice(connection, deviceId)
  if (device != null) {
    await saveDeviceToDB(connection, device)
    log('Device updated.')
  } else {
    device = { ...clean, deviceId }
    await saveDeviceToDB(connection, device)
    log(`Device registered.`)
  }

  return jsonResponse(device)
}

/**
 * The GUI names this `getNotificationState`,
 * and calls it on the notification scene.
 *
 * GET /v1/user?userId=...
 * Request body: none
 * Response body: { notifications: { enabled: boolean } }
 */
export const fetchStateV1Route: Serverlet<ApiRequest> = async request => {
  const { log, query } = request
  const { userId } = asUserIdQuery(query)
  const result = fetchUser(connection, userId)

  log(`Got user settings for ${userId}`)

  return jsonResponse(result)
}

/**
 * The GUI names this `attachToUser`, and calls it at login.
 *
 * POST v1/user/device/attach?userId=...&deviceId=...
 * Request body: none
 * Response body: unused
 */
export const attachUserV1Route: Serverlet<ApiRequest> = async request => {
  const { log, query } = request
  const { deviceId, userId } = asAttachUserQuery(query)

  let user = await fetchUser(connection, userId)
  if (user == null)
    user = {
      userId,
      devices: { deviceId: true },
      notifications: { currencyCodes: {} }
    }

  await saveUserToDB(connection, user)

  log(`Successfully attached device "${deviceId}" to user "${userId}"`)

  return jsonResponse(user)
}

/**
 * The GUI names this `registerNotifications`,
 * and calls it at login and when the wallet list changes.
 *
 * POST /v1/user/notifications?userId=...
 * Request body: { currencyCodes: string[] }
 * Response body: unused
 */
export const registerCurrenciesV1Route: Serverlet<
  ApiRequest
> = async request => {
  const { log, json, query } = request
  const { userId } = asUserIdQuery(query)
  const { currencyCodes } = asRegisterCurrenciesBody(json)

  const user = await fetchUser(connection, userId)
  if (user == null) return errorResponse(`User ${userId} not found`)

  const currencyCodesToUnregister = Object.keys(
    user.notifications.currencyCodes
  ).filter(code => !currencyCodes.includes(code))
  for (const code of currencyCodesToUnregister) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete user.notifications.currencyCodes[code]
  }

  for (const code of currencyCodes) {
    if (code in user.notifications.currencyCodes) continue

    user.notifications.currencyCodes[code] = {
      '1': true,
      '24': true
    }
  }

  await saveUserToDB(connection, user)

  log(`Registered notifications for user ${userId}: ${String(currencyCodes)}`)

  return jsonResponse(user)
}

/**
 * The GUI names this `fetchSettings`,
 * and calls it on the currency notification scene.
 *
 * GET /v1/user/notifications/...?userId=...&deviceId=...
 * Request body: none
 * Response body: { '24': number, '1': number }
 */
export const fetchCurrencyV1Route: Serverlet<ApiRequest> = async request => {
  const { log, path, query } = request
  const { userId } = asUserIdQuery(query)
  const match = path.match(/notifications\/([0-9A-Za-z]+)\/?$/)
  const currencyCode = match != null ? match[1] : ''

  const user = await fetchUser(connection, userId)
  if (user == null) return errorResponse(`User ${userId} not found`)
  const currencySettings = user.notifications.currencyCodes[currencyCode] ?? {
    '1': false,
    '24': false
  }

  log(`Got notification settings for ${currencyCode} for user ${userId}`)

  return jsonResponse(currencySettings)
}

/**
 * The GUI names this `enableNotifications`,
 * and calls it on the currency notification scene.
 *
 * PUT /v1/user/notifications/...?userId=...&deviceId=...
 * Request body: { hours: string, enabled: boolean }
 * Response body: unused
 */
export const enableCurrencyV1Route: Serverlet<ApiRequest> = async request => {
  const { log, json, path, query } = request
  const { userId } = asUserIdQuery(query)
  const { hours, enabled } = asEnableCurrencyBody(json)
  const match = path.match(/notifications\/([0-9A-Za-z]+)\/?$/)
  const currencyCode = match != null ? match[1] : ''

  const user = await fetchUser(connection, userId)
  if (user == null) return errorResponse(`User ${userId} not found`)
  const currencySettings = user.notifications.currencyCodes[currencyCode] ?? {
    '1': false,
    '24': false
  }
  user.notifications.currencyCodes[currencyCode] = currencySettings
  currencySettings[hours] = enabled
  await saveUserToDB(connection, user)

  log(`Updated notification settings for user ${userId} for ${currencyCode}`)

  return jsonResponse(currencySettings)
}

/**
 * This GUI calls this `setNotificationState`,
 * and calls it on the notifications scene.
 *
 * POST /v1/user/notifications/toggle?userId=...
 * Request body: { enabled: boolean }
 * Response body: unused
 */
export const toggleStateV1Route: Serverlet<ApiRequest> = async request => {
  const { log, json, query } = request

  const { userId } = asUserIdQuery(query)
  const { enabled } = asToggleStateBody(json)
  log(`enabled: ${String(enabled)}`)

  let user = await fetchUser(connection, userId)
  if (user == null)
    user = {
      userId,
      devices: {},
      notifications: { currencyCodes: {} }
    }
  user.notifications.enabled = enabled
  await saveUserToDB(connection, user)

  log(`User notifications toggled to: ${String(enabled)}`)

  return jsonResponse(user)
}

const asAttachUserQuery = asObject({
  deviceId: asString,
  userId: asString
})

const asUserIdQuery = asObject({
  userId: asString
})

const asRegisterCurrenciesBody = asObject({
  currencyCodes: asArray(asString)
})

const asEnableCurrencyBody = asObject({
  hours: asValue('1', '24'),
  enabled: asBoolean
})

const asToggleStateBody = asObject({
  enabled: asBoolean
})

const asRegisterDeviceQuery = asObject({
  deviceId: asString
})

const asRegisterDeviceRequest = asObject({
  appId: asString,
  tokenId: asString, // Firebase device token
  deviceDescription: asString,
  osType: asString,
  edgeVersion: asString,
  edgeBuildNumber: asNumber
})
