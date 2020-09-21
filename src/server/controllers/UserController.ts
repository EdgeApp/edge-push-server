import * as express from 'express'
import { asArray, asBoolean, asObject, asString } from 'cleaners'

import { User } from '../../models'

export const UserController = express.Router()

UserController.get('/', async (req, res) => {
  try {
    const Query = asObject({
      userId: asString
    })
    Query(req.query)

    const { userId } = req.query as ReturnType<typeof Query>
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
    const Query = asObject({
      deviceId: asString,
      userId: asString
    })
    Query(req.query)

    const { deviceId, userId } = req.query as ReturnType<typeof Query>

    let user = await User.fetch(userId)
    if (!user) user = new User(null, userId)

    await user.attachDevice(deviceId)

    console.log(`Successfully attached device "${deviceId}" to user "${userId}"`)

    res.json(user)
  } catch (err) {
    console.error(`Failed to attach device to user ${req.query.userId}`, err)
    res.status(500).json(err)
  }
})

UserController.post('/notifications', async (req, res) => {
  try {
    const Query = asObject({
      userId: asString
    })
    const Body = asObject({
      currencyCodes: asArray(asString)
    })
    Query(req.query)
    Body(req.body)

    const { userId } = req.query as ReturnType<typeof Query>
    const { currencyCodes } = req.body as ReturnType<typeof Body>

    const user = await User.fetch(userId)
    await user.registerNotifications(currencyCodes)

    console.log(`Registered notifications for user ${userId}: ${currencyCodes}`)

    res.json(user)
  } catch (err) {
    console.error(`Failed to register for notifications for user ${req.query.userId}`, err)
    res.status(500).json(err)
  }
})

UserController.get('/notifications/:currencyCode', async (req, res) => {
  try {
    const Query = asObject({
      userId: asString
    })
    const Params = asObject({
      currencyCode: asString
    })
    Query(req.query)
    Params(req.params)

    const { userId } = req.query as ReturnType<typeof Query>
    const { currencyCode } = req.params as ReturnType<typeof Params>

    const user = await User.fetch(userId)
    const notificationSettings = user.notifications.currencyCodes[currencyCode]

    console.log(`Got notification settings for ${currencyCode} for user ${userId}`)

    res.json(notificationSettings)
  } catch (err) {
    console.error(`Failed to get notification settings for user ${req.query.userId} for ${req.params.currencyCode}`, err)
    res.status(500).json(err)
  }
})

UserController.put('/notifications/:currencyCode', async (req, res) => {
  try {
    const Query = asObject({
      userId: asString
    })
    const Params = asObject({
      currencyCode: asString
    })
    const Body = asObject({
      hours: asString,
      enabled: asBoolean
    })
    Query(req.query)
    Params(req.params)
    Body(req.body)

    const { userId } = req.query as ReturnType<typeof Query>
    const { currencyCode } = req.params as ReturnType<typeof Params>
    const { hours, enabled } = req.body as ReturnType<typeof Body>

    const user = await User.fetch(userId)
    const currencySettings = user.notifications.currencyCodes[currencyCode]
    // @ts-expect-error
    currencySettings[hours] = enabled
    await user.save()

    console.log(`Updated notification settings for user ${userId} for ${currencyCode}`)

    res.json(currencySettings)
  } catch (err) {
    console.error(`Failed to update notification settings for user ${req.query.userId} for ${req.params.currencyCode}`, err)
    res.status(500).json(err)
  }
})

UserController.post('/notifications/toggle', async (req, res) => {
  try {
    const Query = asObject({
      userId: asString
    })
    const Body = asObject({
      enabled: asBoolean
    })
    console.log(req.body)
    Query(req.query)
    Body(req.body)

    const { userId } = req.query as ReturnType<typeof Query>
    const { enabled } = req.body as ReturnType<typeof Body>

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
