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

import { getDeviceById } from '../../db/couchDevices'
import { ApiRequest } from '../../types/requestTypes'
import { jsonResponse } from '../../types/responseTypes'
import { base58 } from '../../util/base58'
import { checkPayload } from '../../util/checkPayload'
import { verifyData } from '../../util/verifyData'

interface LegacyDevice {
  appId: string
  tokenId: string | undefined
  deviceDescription: string
  osType: string
  edgeVersion: string
  edgeBuildNumber: number
}

interface LegacyUser {
  devices: {
    [deviceId: string]: boolean
  }
  notifications: {
    enabled: boolean
    currencyCodes: {
      [currencyCode: string]: {
        1: boolean
        24: boolean
      }
    }
  }
}

/**
 * The GUI names this `registerDevice`, and calls it at boot.
 *
 * POST /v1/device?deviceId=...
 * Request body: asRegisterDeviceRequest
 * Response body: unused
 */
export const registerDeviceV1Route: Serverlet<ApiRequest> = async request => {
  const { apiKey, connections, date, json, query } = request

  const checkedQuery = checkPayload(asRegisterDeviceQuery, query)
  if (checkedQuery.error != null) return checkedQuery.error
  const { deviceId } = checkedQuery.clean

  const checkedBody = checkPayload(asRegisterDeviceRequest, json)
  if (checkedBody.error != null) return checkedBody.error
  const { clean } = checkedBody

  // Update the v2 device:
  {
    const deviceRow = await getDeviceById(connections, deviceId, date)
    const { device } = deviceRow
    device.apiKey = apiKey.apiKey
    device.deviceToken = clean.tokenId
    device.visited = date
    await deviceRow.save()
  }

  const result: LegacyDevice = clean
  return jsonResponse(result)
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
  const { query } = request

  const checkedQuery = checkPayload(asUserIdQuery, query)
  if (checkedQuery.error != null) return checkedQuery.error
  // const { userId } = checkedQuery.clean

  const result: LegacyUser = {
    devices: {},
    notifications: { enabled: false, currencyCodes: {} }
  }
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
  const { connections, date, query } = request

  const checkedQuery = checkPayload(asAttachUserQuery, query)
  if (checkedQuery.error != null) return checkedQuery.error
  const { deviceId, userId } = checkedQuery.clean

  // Update the v2 device:
  {
    const deviceRow = await getDeviceById(connections, deviceId, date)
    const { device } = deviceRow
    const loginId = base58.parse(userId)
    if (device.loginIds.find(row => verifyData(loginId, row)) == null) {
      device.loginIds = [...device.loginIds, loginId]
      await deviceRow.save()
    }
  }

  const result: LegacyUser = {
    devices: {},
    notifications: { enabled: false, currencyCodes: {} }
  }
  return jsonResponse(result)
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

  const checkedQuery = checkPayload(asUserIdQuery, query)
  if (checkedQuery.error != null) return checkedQuery.error
  // const { userId } = checkedQuery.clean

  const checkedBody = checkPayload(asRegisterCurrenciesBody, json)
  if (checkedBody.error != null) return checkedBody.error
  // const { currencyCodes } = checkedBody.clean

  const result: LegacyUser = {
    devices: {},
    notifications: { enabled: false, currencyCodes: {} }
  }
  return jsonResponse(result)
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
  const { query } = request

  const checkedQuery = checkPayload(asUserIdQuery, query)
  if (checkedQuery.error != null) return checkedQuery.error
  // const { userId } = checkedQuery.clean

  // const match = path.match(/notifications\/([0-9A-Za-z]+)\/?$/)
  // const currencyCode = match != null ? match[1] : ''

  return jsonResponse({
    '1': false,
    '24': false,
    fallbackSettings: true
  })
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
  const { json, query } = request

  const checkedQuery = checkPayload(asUserIdQuery, query)
  if (checkedQuery.error != null) return checkedQuery.error
  // const { userId } = checkedQuery.clean

  const checkedBody = checkPayload(asEnableCurrencyBody, json)
  if (checkedBody.error != null) return checkedBody.error

  // const match = path.match(/notifications\/([0-9A-Za-z]+)\/?$/)
  // const currencyCode = match != null ? match[1] : ''

  return jsonResponse({
    '1': false,
    '24': false
  })
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

  const checkedQuery = checkPayload(asUserIdQuery, query)
  if (checkedQuery.error != null) return checkedQuery.error
  // const { userId } = checkedQuery.clean

  const checkedBody = checkPayload(asToggleStateBody, json)
  if (checkedBody.error != null) return checkedBody.error

  const result: LegacyUser = {
    devices: {},
    notifications: { enabled: false, currencyCodes: {} }
  }
  return jsonResponse(result)
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
  hours: asValue('1' as const, '24' as const),
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
