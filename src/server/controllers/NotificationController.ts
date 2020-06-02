import * as express from 'express'

import { NotificationManager } from '../../NotificationManager'
import { Device } from '../../models'

export const NotificationController = express.Router()

NotificationController.post('/send', async (req, res) => {
  const { title, body, data  } = req.body
  const { appId } = req.apiKey

  const fcm = await NotificationManager.init(appId)
  const message = {
    notification: {
      title,
      body
    },
    data
  }

  const devices = await Device.where({ selector: { appId } }) as Array<Device>
  const deviceTokens = devices.map((device) => device.tokenId)

  await fcm.sendNotifications(message, deviceTokens)
})
