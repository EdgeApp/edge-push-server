import { ServerScope } from 'nano'

import { getDeviceById, getDevicesByLoginId } from '../db/couchDevices'
import { PushEventRow } from '../db/couchPushEvents'
import { PushSender } from './pushSender'

/**
 * Handles all the effects once a row has been triggered.
 */
export async function triggerEvent(
  connection: ServerScope,
  sender: PushSender,
  eventRow: PushEventRow,
  date: Date
): Promise<void> {
  const { event } = eventRow
  const { broadcastTxs = [], pushMessage } = event

  if (pushMessage != null) {
    const deviceRows =
      event.deviceId != null
        ? [await getDeviceById(connection, event.deviceId, date)]
        : event.loginId != null
        ? await getDevicesByLoginId(connection, event.loginId)
        : []

    // Sort the devices by app:
    const apiKeys = new Map<string, string[]>()
    for (const row of deviceRows) {
      const { apiKey, deviceToken } = row.device
      if (apiKey == null || deviceToken == null) continue
      const tokens = apiKeys.get(apiKey) ?? []
      tokens.push(deviceToken)
      apiKeys.set(apiKey, tokens)
    }

    for (const [apiKey, tokens] of apiKeys) {
      await sender.send(apiKey, tokens, pushMessage)
    }

    // TODO: Take note of any errors.
    event.pushMessageError = undefined
  }

  for (const tx of broadcastTxs) {
    console.log(tx) // TODO
    event.broadcastTxErrors = []
  }

  event.state = event.recurring ? 'waiting' : 'triggered'
  event.triggered = date
  await eventRow.save()
}
