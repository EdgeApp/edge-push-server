import io from '@pm2/io'
import admin from 'firebase-admin'
import { ServerScope } from 'nano'

import { getApiKeyByKey } from '../db/couchApiKeys'
import { getDeviceById, getDevicesByLoginId } from '../db/couchDevices'
import { PushMessage } from '../types/pushTypes'
import { logger } from './logger'

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
  sendRaw: (
    apiKey: string,
    tokens: Set<string>,
    message: PushMessage
  ) => Promise<PushResult>
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
    ): Promise<PushResult> {
      const { title = '', body = '', data = {} } = message

      const failure: PushResult = {
        successCount: 0,
        failureCount: tokens.size
      }
      const response: PushResult = {
        successCount: 0,
        failureCount: 0
      }

      const sender = await getSender(apiKey)
      if (sender == null) return failure

      let lastError: unknown = null
      for (const token of tokens) {
        try {
          await sender.send({
            token,
            notification: { title, body },
            data
          })
          successCounter.inc(1)
          response.successCount += 1
        } catch (err) {
          failureCounter.inc(1)
          response.failureCount += 1
          lastError = err
        }
      }
      if (response.successCount === 0) {
        logger.warn({
          msg: 'Failed to send push messages',
          err: lastError,
          apiKey,
          tokens,
          message
        })
      }

      return response
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
      const out = {
        failureCount: 0,
        successCount: 0
      }
      for (const [apiKey, tokens] of apiKeys) {
        const result = await instance.sendRaw(apiKey, tokens, message)
        out.failureCount += result.failureCount
        out.successCount += result.successCount
      }
      return out
    }
  }

  return instance
}
