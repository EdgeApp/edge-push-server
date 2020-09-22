import * as express from 'express'
import { asMap, asObject, asString } from 'cleaners'

import { NotificationManager } from '../../NotificationManager'
import { Device, User } from '../../models'

export const NotificationController = express.Router()

NotificationController.post('/send', async (req, res) => {
  try {
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

    const tokens = []
    const devices = await user.fetchDevices()
    for (const device of devices) {
      if (device.tokenId) {
        tokens.push(device.tokenId)
      }
    }

    const response = await manager.sendNotifications(title, body, tokens, data)
    const { successCount, failureCount } = response
    console.log(`Sent notifications to user ${userId} devices: ${successCount} success - ${failureCount} failure`)

    res.json(response)
  } catch (err) {
    console.error(`Failed to send notifications to user ${req.body.userId} devices`, err)
    res.status(500).json(err)
  }
})
