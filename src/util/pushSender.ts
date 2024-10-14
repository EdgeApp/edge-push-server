import admin from 'firebase-admin'
import { ServerScope } from 'nano'

import { getApiKeyByKey } from '../db/couchApiKeys'
import { getDeviceById, getDevicesByLoginId } from '../db/couchDevices'
import { PushMessage } from '../types/pushTypes'

export interface PushSender {
  sendRaw: (
    apiKey: string,
    tokens: Set<string>,
    message: PushMessage
  ) => Promise<void>
  send: (
    connection: ServerScope,
    message: PushMessage,
    opts: {
      date: Date
      deviceId?: string
      loginId?: Uint8Array
      isPriceChange?: boolean
    }
  ) => Promise<void>
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
    const projectId = serviceAccount.projectId ?? serviceAccount.project_id

    // Create a sender if we have an API key for them.
    // It is possible that multiple API keys will use the same
    // Firebase project, so check for existing instances
    // before creating new ones:
    const app =
      admin.apps.find(app => app?.name === projectId) ??
      admin.initializeApp(
        { credential: admin.credential.cert(serviceAccount) },
        projectId
      )
    const sender = app.messaging()
    senders.set(apiKey, sender)
    return sender
  }

  const instance: PushSender = {
    async sendRaw(
      apiKey: string,
      tokens: Set<string>,
      message: PushMessage
    ): Promise<void> {
      const { title = '', body = '', data = {} } = message

      const sender = await getSender(apiKey)
      if (sender == null) return

      for (const token of tokens) {
        try {
          await sender.send({
            token,
            notification: { title, body },
            data
          })
        } catch (err) {}
      }
    },

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
      const apiKeys = new Map<string, Set<string>>()
      for (const row of deviceRows) {
        const { apiKey, deviceToken } = row.device
        if (apiKey == null || deviceToken == null) continue
        const tokens = apiKeys.get(apiKey) ?? new Set()
        tokens.add(deviceToken)
        apiKeys.set(apiKey, tokens)
      }

      // Do the individual sends:
      for (const [apiKey, tokens] of apiKeys) {
        await instance.sendRaw(apiKey, tokens, message)
      }
    }
  }

  return instance
}
