import io from '@pm2/io'
import admin from 'firebase-admin'
import { ServerScope } from 'nano'

import { getApiKeyByKey } from '../db/couchApiKeys'
import { getDeviceById, getDevicesByLoginId } from '../db/couchDevices'
import { PushMessage } from '../types/pushTypes'

const successCounter = io.counter({
  id: 'notifications:success:total',
  name: 'Total Successful Notifications'
})
const failureCounter = io.counter({
  id: 'notifications:failure:total',
  name: 'Total Failed Notifications'
})

export interface PushResult {
  successCount: number
  failureCount: number
}

export interface PushSender {
  send: (
    connection: ServerScope,
    message: PushMessage,
    opts: {
      date: Date
      deviceId?: string
      loginId?: Uint8Array
      isPriceChange?: boolean
    }
  ) => Promise<PushResult>
}

// Map apiKey's to message senders, or `null` if missing:
const senders = new Map<string, admin.messaging.Messaging | null>()

/**
 * Creates a push notification sender object.
 * This object uses a cache to map appId's to Firebase credentials,
 * based on the Couch database.
 */
export function makePushSender(connection: ServerScope): PushSender {
  async function getSender(
    apiKey: string
  ): Promise<admin.messaging.Messaging | null> {
    const cached = senders.get(apiKey)
    // Null is a valid cache hit:
    if (cached !== undefined) {
      return cached
    }

    // Look up the API key for this appId:
    const apiKeyRow = await getApiKeyByKey(connection, apiKey)
    if (apiKeyRow == null || apiKeyRow.adminsdk == null) {
      senders.set(apiKey, null)
      return null
    }

    // TODO: We have never passed the correct data type here,
    // so either update our database or write a translation layer:
    const serviceAccount: any = apiKeyRow.adminsdk

    // Create a sender if we have an API key for them:
    const app = admin.initializeApp(
      { credential: admin.credential.cert(serviceAccount) },
      serviceAccount.projectId ?? serviceAccount.project_id
    )
    const sender = app.messaging()
    senders.set(apiKey, sender)
    return sender
  }

  async function sendRaw(
    apiKey: string,
    tokens: string[],
    message: PushMessage
  ): Promise<PushResult> {
    const { title = '', body = '', data = {} } = message

    const failure = {
      successCount: 0,
      failureCount: tokens.length
    }

    const sender = await getSender(apiKey)
    if (sender == null) return failure

    const response = await sender
      .sendMulticast({
        data,
        notification: { title, body },
        tokens
      })
      .catch(() => failure)

    successCounter.inc(response.successCount)
    failureCounter.inc(response.failureCount)
    return response
  }

  return {
    async send(connection, message, opts) {
      const { date, deviceId, loginId, isPriceChange = false } = opts

      let deviceRows =
        deviceId != null
          ? [await getDeviceById(connection, deviceId, date)]
          : loginId != null
          ? await getDevicesByLoginId(connection, loginId)
          : []

      if (isPriceChange) {
        deviceRows = deviceRows.filter(row => !row.device.ignorePriceChanges)
      }

      // Sort the devices by app:
      const apiKeys = new Map<string, string[]>()
      for (const row of deviceRows) {
        const { apiKey, deviceToken } = row.device
        if (apiKey == null || deviceToken == null) continue
        const tokens = apiKeys.get(apiKey) ?? []
        tokens.push(deviceToken)
        apiKeys.set(apiKey, tokens)
      }

      // Do the individual sends:
      const out = {
        failureCount: 0,
        successCount: 0
      }
      for (const [apiKey, tokens] of apiKeys) {
        const result = await sendRaw(apiKey, tokens, message)
        out.failureCount += result.failureCount
        out.successCount += result.successCount
      }
      return out
    }
  }
}
