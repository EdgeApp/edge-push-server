import { asArray, asBoolean, asObject, asString, asValue } from 'cleaners'
import { Serverlet } from 'serverlet'

import { User } from '../../models/User'
import { ApiRequest } from '../../types/requestTypes'
import { jsonResponse } from '../../types/responseTypes'

/**
 * The GUI names this `getNotificationState`,
 * and calls it on the notification scene.
 *
 * GET /v1/user?userId=...
 * Request body: none
 * Response body: { notifications: { enabled: boolean } }
 */
export const fetchStateV1Route: Serverlet<ApiRequest> = async request => {
  const { query } = request
  const { userId } = asUserIdQuery(query)
  const result = await User.fetch(userId)

  console.log(`Got user settings for ${userId}`)

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
  const { query } = request
  const { deviceId, userId } = asAttachUserQuery(query)

  let user = await User.fetch(userId)
  if (!user) user = new User(null, userId)

  await user.attachDevice(deviceId)

  console.log(`Successfully attached device "${deviceId}" to user "${userId}"`)

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
  const { json, query } = request
  const { userId } = asUserIdQuery(query)
  const { currencyCodes } = asRegisterCurrenciesBody(json)

  const user = await User.fetch(userId)
  await user.registerNotifications(currencyCodes)

  console.log(
    `Registered notifications for user ${userId}: ${String(currencyCodes)}`
  )

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
  const { path, query } = request
  const { userId } = asUserIdQuery(query)
  const match = path.match(/notifications\/([0-9A-Za-z]+)\/?$/)
  const currencyCode = match != null ? match[1] : ''

  const user = await User.fetch(userId)
  const currencySettings = user.notifications.currencyCodes[currencyCode] ?? {
    '1': false,
    '24': false
  }

  console.log(
    `Got notification settings for ${currencyCode} for user ${userId}`
  )

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
  const { json, path, query } = request
  const { userId } = asUserIdQuery(query)
  const { hours, enabled } = asEnableCurrencyBody(json)
  const match = path.match(/notifications\/([0-9A-Za-z]+)\/?$/)
  const currencyCode = match != null ? match[1] : ''

  const user = await User.fetch(userId)
  const currencySettings = user.notifications.currencyCodes[currencyCode] ?? {
    '1': false,
    '24': false
  }
  user.notifications.currencyCodes[currencyCode] = currencySettings
  currencySettings[hours] = enabled
  await user.save()

  console.log(
    `Updated notification settings for user ${userId} for ${currencyCode}`
  )

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
  const { json, query } = request
  console.log(json)

  const { userId } = asUserIdQuery(query)
  const { enabled } = asToggleStateBody(json)

  let user = await User.fetch(userId)
  if (!user) user = new User(null, userId)
  user.notifications.enabled = enabled
  await user.save()

  console.log(`User notifications toggled to: ${String(enabled)}`)

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
