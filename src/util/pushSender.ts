import {
  asBoolean,
  asJSON,
  asObject,
  asOptional,
  asString,
  uncleaner
} from 'cleaners'

import { DbConnections } from '../db/dbConnections'
import { asBase64, asPushMessage } from '../types/pushCleaners'
import { Device, PushEvent, PushMessage } from '../types/pushTypes'

export interface SendableMessage extends PushMessage {
  /** Some devices ignore these messages: */
  readonly isPriceChange: boolean
  readonly isMarketing: boolean
}

export const asSendableMessage = asObject<SendableMessage>({
  ...asPushMessage.shape,
  isPriceChange: asBoolean,
  isMarketing: asBoolean
})

export const asRabbitMessage = asJSON(
  asObject({
    // What devices are we sending to:
    deviceId: asOptional(asString),
    loginId: asOptional(asBase64),

    // What we are sending:
    message: asSendableMessage
  })
)
const wasRabbitMessage = uncleaner(asRabbitMessage)

/**
 * Queues up a message to be sent to a device.
 * The priority should be 0-5, with the default being 0.
 * Higher priority messages jump to the front of the line.
 */
export interface PushSender {
  sendToEvent: (
    event: PushEvent,
    message: SendableMessage,
    priority?: number
  ) => Promise<void>

  sendToLogin: (
    loginId: Uint8Array,
    message: SendableMessage,
    priority?: number
  ) => Promise<void>

  sendToDevice: (
    device: Device,
    message: SendableMessage,
    priority?: number
  ) => Promise<void>
}

/**
 * Creates a push notification sender object.
 */
export function makePushSender(connections: DbConnections): PushSender {
  // Persistent delivery:
  const deliveryMode = 2

  async function sendToEvent(
    event: PushEvent,
    message: SendableMessage,
    priority?: number
  ): Promise<void> {
    const { deviceId, loginId } = event
    await connections.queue.publish(
      wasRabbitMessage({
        deviceId,
        loginId,
        message
      }),
      { deliveryMode, priority }
    )
  }

  async function sendToLogin(
    loginId: Uint8Array,
    message: SendableMessage,
    priority?: number
  ): Promise<void> {
    await connections.queue.publish(
      wasRabbitMessage({
        deviceId: undefined,
        loginId,
        message
      }),
      { deliveryMode, priority }
    )
  }

  async function sendToDevice(
    device: Device,
    message: SendableMessage,
    priority?: number
  ): Promise<void> {
    await connections.queue.publish(
      wasRabbitMessage({
        deviceId: device.deviceId,
        loginId: undefined,
        message
      }),
      { deliveryMode, priority }
    )
  }

  const out: PushSender = {
    sendToEvent,
    sendToLogin,
    sendToDevice
  }
  return out
}
