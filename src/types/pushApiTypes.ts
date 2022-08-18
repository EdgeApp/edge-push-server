import {
  asArray,
  asBoolean,
  asDate,
  asEither,
  asNull,
  asObject,
  asOptional,
  asString,
  asUnknown,
  Cleaner
} from 'cleaners'

import {
  asBase64,
  asBroadcastTx,
  asPushEventState,
  asPushMessage,
  asPushTrigger
} from './pushCleaners'
import { BroadcastTx, PushEvent, PushMessage, PushTrigger } from './pushTypes'

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

/**
 * All v2 requests use this request body.
 */
export interface PushRequestBody {
  // The request payload:
  data?: unknown

  // Who is making the request:
  apiKey: string
  deviceId: string
  deviceToken?: string

  // For logins:
  loginId?: Uint8Array
}

/**
 * Template for creating new push events.
 */
export interface NewPushEvent {
  readonly eventId: string
  readonly broadcastTxs?: BroadcastTx[]
  readonly pushMessage?: PushMessage
  readonly recurring: boolean
  readonly trigger: PushTrigger
}

/**
 * PUSH /v2/device/update payload.
 */
export interface DeviceUpdatePayload {
  loginIds: Uint8Array[]
  createEvents?: NewPushEvent[]
  removeEvents?: string[]
}

/**
 * PUSH /v2/login/update payload.
 */
export interface LoginUpdatePayload {
  createEvents?: NewPushEvent[]
  removeEvents?: string[]
}

// ---------------------------------------------------------------------------
// Request cleaners
// ---------------------------------------------------------------------------

export const asPushRequestBody: Cleaner<PushRequestBody> = asObject({
  // The request payload:
  data: asUnknown,

  // Who is making the request:
  apiKey: asString,
  deviceId: asString,
  deviceToken: asOptional(asString),

  // For logins:
  loginId: asOptional(asBase64)
})

export const asNewPushEvent: Cleaner<NewPushEvent> = asObject({
  eventId: asString,
  broadcastTxs: asOptional(asArray(asBroadcastTx)),
  pushMessage: asOptional(asPushMessage),
  recurring: asBoolean,
  trigger: asPushTrigger
})

export const asDeviceUpdatePayload: Cleaner<DeviceUpdatePayload> = asObject({
  loginIds: asArray(asBase64),
  createEvents: asOptional(asArray(asNewPushEvent), []),
  removeEvents: asOptional(asArray(asString), [])
})

export const asLoginUpdatePayload: Cleaner<LoginUpdatePayload> = asObject({
  createEvents: asOptional(asArray(asNewPushEvent), []),
  removeEvents: asOptional(asArray(asString), [])
})

// ---------------------------------------------------------------------------
// Response cleaners
// ---------------------------------------------------------------------------

/**
 * A push event returned from a query.
 */
export const asPushEventStatus: Cleaner<
  Omit<PushEvent, 'created' | 'deviceId' | 'loginId'>
> = asObject({
  eventId: asString,

  broadcastTxs: asOptional(asArray(asBroadcastTx)),
  pushMessage: asOptional(asPushMessage),
  recurring: asBoolean,
  trigger: asPushTrigger,

  // Status:
  broadcastTxErrors: asOptional(asArray(asEither(asString, asNull))),
  pushMessageError: asOptional(asString),
  state: asPushEventState,
  triggered: asOptional(asDate)
})

/**
 * POST /v2/device response payload.
 */
export const asDevicePayload = asObject({
  loginIds: asArray(asBase64),
  events: asArray(asPushEventStatus)
})

/**
 * POST /v2/login response payload.
 */
export const asLoginPayload = asObject({
  events: asArray(asPushEventStatus)
})
