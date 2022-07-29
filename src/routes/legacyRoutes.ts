import {
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asOptional,
  asString,
  asValue
} from 'cleaners'
import { Serverlet } from 'serverlet'

import { Device } from '../models/Device'
import { User } from '../models/User'
import { ApiRequest } from '../types/requestTypes'
import { errorResponse, jsonResponse } from '../types/responseTypes'

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

  let device = await Device.fetch(deviceId)
  if (device != null) {
    await device.save(clean as any)
    log('Device updated.')
  } else {
    device = new Device(clean as any, deviceId)
    await device.save()
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
  const result = await User.fetch(userId)
  if (result == null) {
    return errorResponse(`Cannot find user ${userId}`, { status: 404 })
  }

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

  const device = await Device.fetch(deviceId)
  if (device == null) {
    return errorResponse(`Cannot find device ${deviceId}`, { status: 404 })
  }

  const user = (await User.fetch(userId)) ?? new User(null, userId)
  user.devices[deviceId] = true
  await user.save()

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

  const user = (await User.fetch(userId)) ?? new User(null, userId)
  await user.registerNotifications(currencyCodes)

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

  const user = (await User.fetch(userId)) ?? new User(null, userId)
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

  const user = (await User.fetch(userId)) ?? new User(null, userId)
  const currencySettings = user.notifications.currencyCodes[currencyCode] ?? {
    '1': false,
    '24': false
  }
  user.notifications.currencyCodes[currencyCode] = currencySettings
  currencySettings[hours] = enabled
  await user.save()

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

  const user = (await User.fetch(userId)) ?? new User(null, userId)
  user.notifications.enabled = enabled
  await user.save()

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
  tokenId: asOptional(asString), // Firebase device token
  deviceDescription: asString,
  osType: asString,
  edgeVersion: asString,
  edgeBuildNumber: asNumber
})
