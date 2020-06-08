import * as express from 'express'
import { asMap, asObject, asString } from 'cleaners'

import { NotificationManager } from '../../NotificationManager'
import { Device, User } from '../../models'

export const NotificationController = express.Router()

NotificationController.post('/send', async (req, res) => {
  try {
    // TODO:
    if (!req.apiKey.admin)
      return res.sendStatus(401)

    const Body = asObject({
      title: asString,
      body: asString,
      data: asMap,
      userId: asString
    })

    const { title, body, data, userId  } = req.body as ReturnType<typeof Body>

    const manager = await NotificationManager.init(req.apiKey)

    const user = await User.fetch(userId) as User
    if (!user)
      return res.status(404).send('User does not exist.')

    const tokenPromises = []
    for (const deviceId in user.devices) {
      tokenPromises.push(
        Device.fetch(deviceId)
          .then((device: Device) => device.tokenId)
      )
    }
    const tokens = await Promise.all(tokenPromises)

    const response = await manager.sendNotifications(title, body, tokens, data)
    res.sendStatus(200)
  } catch (err) {
    res.json(err)
  }
})
