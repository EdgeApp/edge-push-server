import {
  asArray,
  asBoolean,
  asEither,
  asNull,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown
} from 'cleaners'

import {
  asBase64,
  asBroadcastTx,
  asPushEventState,
  asPushMessage,
  asPushTrigger,
  asPushTriggerState
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
  readonly trigger: PushTrigger
}

/**
 * PUSH /v2/device/update payload.
 */
export interface DeviceUpdatePayload {
  createEvents?: NewPushEvent[]
  removeEvents?: string[]

  ignoreMarketing?: boolean
  ignorePriceChanges?: boolean
  loginIds?: Uint8Array[]
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

export const asPushRequestBody = asObject<PushRequestBody>({
  // The request payload:
  data: asUnknown,

  // Who is making the request:
  apiKey: asString,
  deviceId: asString,
  deviceToken: asOptional(raw => {
    const clean = asString(raw)

    // The app will send a blank string when Firebase has a problem,
    // so treat that as missing:
    if (clean === '') return undefined

    // Otherwise, we need an alphanumeric string:
    if (/^[a-zA-Z0-9_\-:]+$/.test(clean)) return clean

    throw new TypeError(`Invalid deviceToken "${clean}"`)
  }),

  // For logins:
  loginId: asOptional(asBase64)
})

export const asNewPushEvent = asObject<NewPushEvent>({
  eventId: asString,
  broadcastTxs: asOptional(asArray(asBroadcastTx)),
  pushMessage: asOptional(asPushMessage),
  trigger: asPushTrigger
})

export const asDeviceUpdatePayload = asObject<DeviceUpdatePayload>({
  createEvents: asOptional(asArray(asNewPushEvent), []),
  removeEvents: asOptional(asArray(asString), []),

  ignoreMarketing: asOptional(asBoolean),
  ignorePriceChanges: asOptional(asBoolean),
  loginIds: asOptional(asArray(asBase64))
})

export const asLoginUpdatePayload = asObject<LoginUpdatePayload>({
  createEvents: asOptional(asArray(asNewPushEvent), []),
  removeEvents: asOptional(asArray(asString), [])
})

// ---------------------------------------------------------------------------
// Response cleaners
// ---------------------------------------------------------------------------

/**
 * A push event returned from a query.
 */
export const asPushEventStatus = asObject<
  Omit<PushEvent, 'created' | 'deviceId' | 'loginId'>
>({
  eventId: asString,

  broadcastTxs: asOptional(asArray(asBroadcastTx)),
  pushMessage: asOptional(asPushMessage),
  trigger: asPushTrigger,

  // Status:
  broadcastTxErrors: asOptional(asArray(asEither(asString, asNull))),
  pushMessageEmits: asOptional(asNumber), // Number of devices we sent to
  pushMessageFails: asOptional(asNumber), // Number of devices that failed
  state: asPushEventState,
  triggered: asPushTriggerState
})

/**
 * POST /v2/device response payload.
 */
export const asDevicePayload = asObject({
  events: asArray(asPushEventStatus),
  ignoreMarketing: asBoolean,
  ignorePriceChanges: asBoolean,
  loginIds: asArray(asBase64)
})

/**
 * POST /v2/login response payload.
 */
export const asLoginPayload = asObject({
  events: asArray(asPushEventStatus)
})
