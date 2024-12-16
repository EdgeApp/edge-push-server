import { AMQPMessage } from '@cloudamqp/amqp-client'
import admin from 'firebase-admin'
import { base64 } from 'rfc4648'

import { getApiKeyByKey } from '../db/couchApiKeys'
import {
  DeviceRow,
  getDeviceById,
  getDevicesByLoginId
} from '../db/couchDevices'
import { DbConnections } from '../db/dbConnections'
import { logger } from '../util/logger'
import { asRabbitMessage, SendableMessage } from '../util/pushSender'
import { runDaemon } from './runDaemon'

runDaemon(async tools => {
  const { connections } = tools

  const consumer = await connections.queue.subscribe(
    { noAck: false },
    message => {
      handleMessage(connections, message).catch(error => {
        logger.warn({
          msg: 'Failed to handle message',
          body: message.bodyToString(),
          error
        })
      })
    }
  )

  // Will wait until we have an error, which closes the channel:
  await consumer.wait()
})

async function handleMessage(
  connections: DbConnections,
  amqpMessage: AMQPMessage
): Promise<void> {
  const { deviceId, loginId, message } = asRabbitMessage(
    amqpMessage.bodyToString() ?? '{}'
  )

  // Send it where it needs to go:
  if (deviceId != null) {
    logger.info(`Send to device: ${deviceId}`)
    const deviceRow = await getDeviceById(connections, deviceId, new Date())
    await sendToDevice(connections, deviceRow, message)
  }
  if (loginId != null) {
    logger.info(`Send to login: ${base64.stringify(loginId)}`)
    const deviceRows = await getDevicesByLoginId(connections, loginId)
    for (const deviceRow of deviceRows) {
      await sendToDevice(connections, deviceRow, message)
    }
  }

  // We need to send an ACK to clear the message:
  await amqpMessage.ack()
}

async function sendToDevice(
  connections: DbConnections,
  deviceRow: DeviceRow,
  message: SendableMessage
): Promise<void> {
  const { apiKey, deviceId, deviceToken, ignoreMarketing, ignorePriceChanges } =
    deviceRow.device

  if (message.isMarketing && ignoreMarketing) return
  if (message.isPriceChange && ignorePriceChanges) return
  if (apiKey == null || deviceToken == null) return

  const sender = await getSender(connections, apiKey)
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
  } catch (error) {
    if (String(error).includes('not a valid FCM registration token')) {
      logger.info(`Disabling device: ${deviceId}`)
      deviceRow.device.deviceToken = undefined
      await deviceRow.save()
    } else {
      logger.info('Unknown error', { deviceId, error })
    }
  }
}

// Map apiKey's to message senders, or `null` if missing:
const senders = new Map<string, admin.messaging.Messaging | null>()

async function getSender(
  connections: DbConnections,
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
