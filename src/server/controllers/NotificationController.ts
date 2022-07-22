import { asObject, asOptional, asString, asUnknown } from 'cleaners'

import { User } from '../../models/User'
import { NotificationManager } from '../../NotificationManager'
import { asyncRoute } from '../asyncRoute'

/**
 * The login server names this `sendNotification`,
 * and calls it when there is a new device login.
 *
 * POST /v1/notification/send
 * Request body: asSendNotificationBody
 * Response body: unused
 */
export const sendNotificationV1Route = asyncRoute(async (req, res) => {
  const { title, body, data, userId } = asSendNotificationBody(req.body)

  if (!req.apiKey.admin) return res.sendStatus(401)
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
})

const asSendNotificationBody = asObject({
  title: asString,
  body: asString,
  data: asOptional(asObject(asUnknown)),
  userId: asString // Should be named `loginId`
})
