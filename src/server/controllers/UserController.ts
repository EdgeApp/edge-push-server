import { asArray, asBoolean, asObject, asString } from 'cleaners'
import * as express from 'express'

import { User } from '../../models'

export const UserController = express.Router()

UserController.get('/', async (req, res) => {
  try {
    const asQuery = asObject({
      userId: asString
    })

    const { userId } = asQuery(req.query)
    const result = await User.fetch(userId)

    console.log(`Got user settings for ${userId}`)

    res.json(result)
  } catch (err) {
    console.error(`Failed to get user settings for ${req.query.userId}`, err)
    res.status(500).json(err)
  }
})

UserController.post('/device/attach', async (req, res) => {
  try {
    const asQuery = asObject({
      deviceId: asString,
      userId: asString
    })

    const { deviceId, userId } = asQuery(req.query)

    let user = await User.fetch(userId)
    if (!user) user = new User(null, userId)

    await user.attachDevice(deviceId)

    console.log(
      `Successfully attached device "${deviceId}" to user "${userId}"`
    )

    res.json(user)
  } catch (err) {
    console.error(`Failed to attach device to user ${req.query.userId}`, err)
    res.status(500).json(err)
  }
})

UserController.post('/notifications', async (req, res) => {
  try {
    const asQuery = asObject({
      userId: asString
    })
    const asBody = asObject({
      currencyCodes: asArray(asString)
    })

    const { userId } = asQuery(req.query)
    const { currencyCodes } = asBody(req.body)

    const user = await User.fetch(userId)
    await user.registerNotifications(currencyCodes)

    console.log(`Registered notifications for user ${userId}: ${currencyCodes}`)

    res.json(user)
  } catch (err) {
    console.error(
      `Failed to register for notifications for user ${req.query.userId}`,
      err
    )
    res.status(500).json(err)
  }
})

UserController.get('/notifications/:currencyCode', async (req, res) => {
  try {
    const asQuery = asObject({
      userId: asString
    })
    const asParams = asObject({
      currencyCode: asString
    })

    const { userId } = asQuery(req.query)
    const { currencyCode } = asParams(req.params)

    const user = await User.fetch(userId)
    const notificationSettings = user.notifications.currencyCodes[currencyCode]

    console.log(
      `Got notification settings for ${currencyCode} for user ${userId}`
    )

    res.json(notificationSettings)
  } catch (err) {
    console.error(
      `Failed to get notification settings for user ${req.query.userId} for ${req.params.currencyCode}`,
      err
    )
    res.status(500).json(err)
  }
})

UserController.put('/notifications/:currencyCode', async (req, res) => {
  try {
    const asQuery = asObject({
      userId: asString
    })
    const asParams = asObject({
      currencyCode: asString
    })
    const asBody = asObject({
      hours: asString,
      enabled: asBoolean
    })

    const { userId } = asQuery(req.query)
    const { currencyCode } = asParams(req.params)
    const { hours, enabled } = asBody(req.body)

    const user = await User.fetch(userId)
    const currencySettings = user.notifications.currencyCodes[currencyCode]
    // @ts-expect-error
    currencySettings[hours] = enabled
    await user.save()

    console.log(
      `Updated notification settings for user ${userId} for ${currencyCode}`
    )

    res.json(currencySettings)
  } catch (err) {
    console.error(
      `Failed to update notification settings for user ${req.query.userId} for ${req.params.currencyCode}`,
      err
    )
    res.status(500).json(err)
  }
})

UserController.post('/notifications/toggle', async (req, res) => {
  try {
    const asQuery = asObject({
      userId: asString
    })
    const asBody = asObject({
      enabled: asBoolean
    })
    console.log(req.body)

    const { userId } = asQuery(req.query)
    const { enabled } = asBody(req.body)

    let user = await User.fetch(userId)
    if (!user) user = new User(null, userId)
    user.notifications.enabled = enabled
    await user.save()

    console.log(`User notifications toggled to: ${enabled}`)

    res.json(user)
  } catch (err) {
    console.error(`Failed to toggle user notifications`, err)
    res.status(500).json(err)
  }
})
