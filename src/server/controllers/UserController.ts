import * as express from 'express'
import { User } from '../../models'

export const UserController = express.Router()

UserController.get('/', async (req, res) => {
  try {
    type Query = { userId: string }
    const { userId } = req.query as Query
    const result = userId
      ? await User.fetch(userId)
      : await User.all()

    res.json(result)
  } catch (err) {
    res.json(err)
  }
})

UserController.post('/device/attach', async (req, res) => {
  try {
    type Query = { deviceId: string, userId: string }
    const { deviceId, userId } = req.query as Query

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
    type Query = { userId: string }
    const { userId } = req.query as Query
    const { currencyCodes } = req.body

    const user = await User.fetch(userId) as User
    await user.registerNotifications(currencyCodes)

    res.json(user)
  } catch (err) {
    res.json(err)
  }
})

UserController.get('/notifications/:currencyCode', async (req, res) => {
  try {
    type Query = { userId: string }
    const { userId } = req.query as Query
    const { currencyCode } = req.params

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
    type Query = { userId: string }
    const { userId } = req.query as Query
    const { currencyCode } = req.params
    const { hours, enabled } = req.body

    const user = await User.fetch(userId) as User
    const currencySettings = user.notifications.currencyCodes[currencyCode]
    currencySettings[hours] = enabled
    await user.save()

    res.json(currencySettings)
  } catch (err) {
    res.json(err)
  }
})
