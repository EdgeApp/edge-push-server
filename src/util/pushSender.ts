import admin from 'firebase-admin'

import { getApiKeyByKey } from '../db/couchApiKeys'
import { getDeviceById, getDevicesByLoginId } from '../db/couchDevices'
import { DbConnections } from '../db/dbConnections'
import { Device, PushEvent, PushMessage } from '../types/pushTypes'

export interface SendableMessage extends PushMessage {
  /** Some devices ignore these messages: */
  readonly isPriceChange: boolean
}

export interface PushSender {
  sendToEvent: (event: PushEvent, message: SendableMessage) => Promise<void>

  sendToLogin: (loginId: Uint8Array, message: SendableMessage) => Promise<void>

  sendToDevice: (device: Device, message: SendableMessage) => Promise<void>
}

// Map apiKey's to message senders, or `null` if missing:
const senders = new Map<string, admin.messaging.Messaging | null>()

/**
 * Creates a push notification sender object.
 * This object uses a cache to map appId's to Firebase credentials,
 * based on the Couch database.
 */
export function makePushSender(connections: DbConnections): PushSender {
  async function getSender(
    apiKey: string
  ): Promise<admin.messaging.Messaging | null> {
    const cached = senders.get(apiKey)
    // Null is a valid cache hit:
    if (cached !== undefined) {
      return cached
    }

    // Look up the API key for this appId:
    const apiKeyRow = await getApiKeyByKey(connections, apiKey)
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

  async function sendToEvent(
    event: PushEvent,
    message: SendableMessage
  ): Promise<void> {
    const { deviceId, loginId } = event

    if (loginId != null) {
      await sendToLogin(loginId, message)
    } else if (deviceId != null) {
      const device = await getDeviceById(connections, deviceId, new Date())
      await sendToDevice(device.device, message)
    }
  }

  async function sendToLogin(
    loginId: Uint8Array,
    message: SendableMessage
  ): Promise<void> {
    const deviceRows = await getDevicesByLoginId(connections, loginId)
    for (const deviceRow of deviceRows) {
      await sendToDevice(deviceRow.device, message)
    }
  }

  async function sendToDevice(
    device: Device,
    message: SendableMessage
  ): Promise<void> {
    const { apiKey, deviceToken } = device

    if (message.isPriceChange && device.ignorePriceChanges) return
    if (apiKey == null || deviceToken == null) return

    const sender = await getSender(apiKey)
    if (sender == null) return

    try {
      await sender.send({
        token: deviceToken,
        notification: {
          title: message.title ?? '',
          body: message.body ?? ''
        },
        data: message.data ?? {}
      })
    } catch (err) {}
  }

  const out: PushSender = {
    sendToEvent,
    sendToLogin,
    sendToDevice
  }
  return out
}
