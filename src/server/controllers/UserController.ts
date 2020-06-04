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

    res.json(result)
  } catch (err) {
    res.json(err)
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

    let user = await User.fetch(userId) as User
    if (!user) user = new User(null, userId)

    await user.attachDevice(deviceId)

    res.json(user)
  } catch (err) {
    res.json(err)
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

    const user = await User.fetch(userId) as User
    await user.registerNotifications(currencyCodes)

    res.json(user)
  } catch (err) {
    res.json(err)
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

    const user = await User.fetch(userId) as User
    const notificationSettings = user.notifications.currencyCodes[currencyCode]

    res.json(notificationSettings)
  } catch (err) {
    console.log(err)
    res.json(err)
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

    const user = await User.fetch(userId) as User
    const currencySettings = user.notifications.currencyCodes[currencyCode]
    currencySettings[hours] = enabled
    await user.save()

    res.json(currencySettings)
  } catch (err) {
    console.log(err)
    res.json(err)
  }
})
