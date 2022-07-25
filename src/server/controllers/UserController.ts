import { asArray, asBoolean, asObject, asString, asValue } from 'cleaners'
import { RequestHandler } from 'express'

import { User } from '../../models'

/**
 * The GUI names this `getNotificationState`,
 * and calls it on the notification scene.
 *
 * GET /v1/user?userId=...
 * Request body: none
 * Response body: { notifications: { enabled: boolean } }
 */
export const fetchStateV1Route: RequestHandler = async (req, res) => {
  try {
    const { userId } = asUserIdQuery(req.query)
    const result = await User.fetch(userId)

    console.log(`Got user settings for ${userId}`)

    res.json(result)
  } catch (err) {
    console.error(
      `Failed to get user settings for ${String(req.query.userId)}`,
      err
    )
    res.status(500).json(err)
  }
}

/**
 * The GUI names this `attachToUser`, and calls it at login.
 *
 * POST v1/user/device/attach?userId=...&deviceId=...
 * Request body: none
 * Response body: unused
 */
export const attachUserV1Route: RequestHandler = async (req, res) => {
  try {
    const { deviceId, userId } = asAttachUserQuery(req.query)

    let user = await User.fetch(userId)
    if (!user) user = new User(null, userId)

    await user.attachDevice(deviceId)

    console.log(
      `Successfully attached device "${deviceId}" to user "${userId}"`
    )

    res.json(user)
  } catch (err) {
    console.error(
      `Failed to attach device to user ${String(req.query.userId)}`,
      err
    )
    res.status(500).json(err)
  }
}

/**
 * The GUI names this `registerNotifications`,
 * and calls it at login and when the wallet list changes.
 *
 * POST /v1/user/notifications?userId=...
 * Request body: { currencyCodes: string[] }
 * Response body: unused
 */
export const registerCurrenciesV1Route: RequestHandler = async (req, res) => {
  try {
    const { userId } = asUserIdQuery(req.query)
    const { currencyCodes } = asRegisterCurrenciesBody(req.body)

    const user = await User.fetch(userId)
    await user.registerNotifications(currencyCodes)

    console.log(
      `Registered notifications for user ${userId}: ${String(currencyCodes)}`
    )

    res.json(user)
  } catch (err) {
    console.error(
      `Failed to register for notifications for user ${String(
        req.query.userId
      )}`,
      err
    )
    res.status(500).json(err)
  }
}

/**
 * The GUI names this `fetchSettings`,
 * and calls it on the currency notification scene.
 *
 * GET /v1/user/notifications/...?userId=...&deviceId=...
 * Request body: none
 * Response body: { '24': number, '1': number }
 */
export const fetchCurrencyV1Route: RequestHandler = async (req, res) => {
  try {
    const { userId } = asUserIdQuery(req.query)
    const { currencyCode } = asCurrencyParams(req.params)

    const user = await User.fetch(userId)
    const currencySettings = user.notifications.currencyCodes[currencyCode] ?? {
      '1': false,
      '24': false
    }

    console.log(
      `Got notification settings for ${currencyCode} for user ${userId}`
    )

    res.json(currencySettings)
  } catch (err) {
    console.error(
      `Failed to get notification settings for user ${String(
        req.query.userId
      )} for ${req.params.currencyCode}`,
      err
    )
    res.status(500).json(err)
  }
}

/**
 * The GUI names this `enableNotifications`,
 * and calls it on the currency notification scene.
 *
 * PUT /v1/user/notifications/...?userId=...&deviceId=...
 * Request body: { hours: string, enabled: boolean }
 * Response body: unused
 */
export const enableCurrencyV1Route: RequestHandler = async (req, res) => {
  try {
    const { userId } = asUserIdQuery(req.query)
    const { currencyCode } = asCurrencyParams(req.params)
    const { hours, enabled } = asEnableCurrencyBody(req.body)

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

    res.json(currencySettings)
  } catch (err) {
    console.error(
      `Failed to update notification settings for user ${String(
        req.query.userId
      )} for ${req.params.currencyCode}`,
      err
    )
    res.status(500).json(err)
  }
}

/**
 * This GUI calls this `setNotificationState`,
 * and calls it on the notifications scene.
 *
 * POST /v1/user/notifications/toggle?userId=...
 * Request body: { enabled: boolean }
 * Response body: unused
 */
export const toggleStateV1Route: RequestHandler = async (req, res) => {
  try {
    console.log(req.body)

    const { userId } = asUserIdQuery(req.query)
    const { enabled } = asToggleStateBody(req.body)

    let user = await User.fetch(userId)
    if (!user) user = new User(null, userId)
    user.notifications.enabled = enabled
    await user.save()

    console.log(`User notifications toggled to: ${String(enabled)}`)

    res.json(user)
  } catch (err) {
    console.error(`Failed to toggle user notifications`, err)
    res.status(500).json(err)
  }
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

const asCurrencyParams = asObject({
  currencyCode: asString
})

const asEnableCurrencyBody = asObject({
  hours: asValue('1', '24'),
  enabled: asBoolean
})

const asToggleStateBody = asObject({
  enabled: asBoolean
})
