import * as express from 'express'
import { asMap, asObject, asString } from 'cleaners'

import { NotificationManager } from '../../NotificationManager'
import { Device, User } from '../../models'

export const NotificationController = express.Router()

NotificationController.post('/send', async (req, res) => {
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

  const fcm = await NotificationManager.init(req.apiKey)
  const message = {
    notification: {
      title,
      body
    },
    data
  }

  const user = await User.fetch(userId) as User
  const tokens = []
  for (const deviceId in user.devices) {
    const device = await Device.fetch(deviceId) as Device
    tokens.push(device.tokenId)
  }

  await fcm.sendNotifications(message, tokens)
})
