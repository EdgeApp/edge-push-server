import { asMap, asObject, asOptional, asString, asUnknown } from 'cleaners'
import express from 'express'

import { User } from '../../models'
import { NotificationManager } from '../../NotificationManager'

export const NotificationController = express.Router()

NotificationController.post('/send', async (req, res) => {
  try {
    if (!req.apiKey.admin) return res.sendStatus(401)

    const asBody = asObject({
      title: asString,
      body: asString,
      data: asOptional(asMap(asUnknown)),
      userId: asString
    })

    const { title, body, data, userId } = asBody(req.body)

    const manager = await NotificationManager.init(req.apiKey)

    const user = await User.fetch(userId)
    if (!user) return res.status(404).send('User does not exist.')

    const tokens: string[] = []
    const devices = await user.fetchDevices()
    for (const device of devices) {
      if (device.tokenId) {
        tokens.push(device.tokenId)
      }
    }

    const response = await manager.send(title, body, tokens, data)
    const { successCount, failureCount } = response
    console.log(
      `Sent notifications to user ${userId} devices: ${successCount} success - ${failureCount} failure`
    )

    res.json(response)
  } catch (err) {
    console.error(
      `Failed to send notifications to user ${String(req.body.userId)} devices`,
      err
    )
    res.status(500).json(err)
  }
})
