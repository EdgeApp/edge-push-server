import {
  asArray,
  asBoolean,
  asDate,
  asEither,
  asNull,
  asNumber,
  asObject,
  asOptional,
  asString,
  uncleaner
} from 'cleaners'
import {
  asCouchDoc,
  asMaybeConflictError,
  DatabaseSetup,
  makeJsDesign,
  viewToStream
} from 'edge-server-tools'
import { DocumentScope, ServerScope } from 'nano'
import { base64 } from 'rfc4648'

import {
  asBase64,
  asBroadcastTx,
  asPushEventState,
  asPushMessage,
  asPushTrigger
} from '../types/pushCleaners'
import { NewPushEvent, PushEvent } from '../types/pushTypes'

/**
 * An event returned from the database.
 * To make changes, edit the `event` object, then call `save`.
 */
export interface PushEventRow {
  event: PushEvent
  save: () => Promise<void>
}

/**
 * A push event, as stored in Couch.
 * The document ID is the creation date.
 */
export const asCouchPushEvent = asCouchDoc<Omit<PushEvent, 'created'>>(
  asObject({
    eventId: asString, // Not the document id!
    deviceId: asOptional(asString),
    loginId: asOptional(asBase64),

    // Event:
    broadcastTxs: asOptional(asArray(asBroadcastTx)),
    pushMessage: asOptional(asPushMessage),
    recurring: asBoolean,
    trigger: asPushTrigger,

    // Status:
    broadcastTxErrors: asOptional(asArray(asEither(asString, asNull))),
    pushMessageEmits: asOptional(asNumber),
    pushMessageFails: asOptional(asNumber),
    state: asPushEventState,
    triggered: asOptional(asDate)
  })
)
const wasCouchPushEvent = uncleaner(asCouchPushEvent)

/**
 * Looks up events attached to devices.
 */
const deviceIdDesign = makeJsDesign('deviceId', ({ emit }) => ({
  map: function (doc) {
    if (doc.deviceId == null) return
    if (doc.state === 'cancelled') return
    if (doc.state === 'hidden') return
    emit(doc.deviceId, null)
  }
}))

/**
 * Looks up events attached to logins.
 */
const loginIdDesign = makeJsDesign('loginId', ({ emit }) => ({
  map: function (doc) {
    if (doc.loginId == null) return
    if (doc.state === 'cancelled') return
    if (doc.state === 'hidden') return
    emit(doc.loginId, null)
  }
}))

/**
 * Looks up active address-balance events.
 */
const addressBalanceDesign = makeJsDesign('address-balance', ({ emit }) => ({
  map: function (doc) {
    if (doc.trigger == null) return
    if (doc.trigger.type !== 'address-balance') return
    if (doc.state !== 'waiting') return
    emit(doc._id, null)
  }
}))

/**
 * Looks up active price-related events.
 */
const priceDesign = makeJsDesign('price', ({ emit }) => ({
  map: function (doc) {
    if (doc.trigger == null) return
    const type = doc.trigger.type
    if (type !== 'price-change' && type !== 'price-level') return
    if (doc.state !== 'waiting') return
    emit(doc._id, null)
  }
}))

/**
 * Looks up active price-related events.
 */
const txConfirmDesign = makeJsDesign('tx-confirm', ({ emit }) => ({
  map: function (doc) {
    if (doc.trigger == null) return
    if (doc.trigger.type !== 'tx-confirm') return
    if (doc.state !== 'waiting') return
    emit(doc._id, null)
  }
}))

export const couchEventsSetup: DatabaseSetup = {
  name: 'push-events',

  documents: {
    '_design/address-balance': addressBalanceDesign,
    '_design/deviceId': deviceIdDesign,
    '_design/loginId': loginIdDesign,
    '_design/price': priceDesign,
    '_design/tx-confirm': txConfirmDesign
  }
}

export async function addEvent(
  connection: ServerScope,
  event: PushEvent,
  created: Date
): Promise<void> {
  const db = connection.use(couchEventsSetup.name)
  try {
    await db.insert(
      wasCouchPushEvent({
        doc: event,
        id: created.toISOString()
      })
    )
  } catch (error) {
    if (asMaybeConflictError(error) == null) throw error
    await addEvent(connection, event, new Date(created.valueOf() + 1))
  }
}

export async function adjustEvents(
  connection: ServerScope,
  opts: {
    date: Date
    deviceId?: string
    loginId?: Uint8Array
    createEvents?: NewPushEvent[]
    removeEvents?: string[]
  }
): Promise<PushEvent[]> {
  const { date, deviceId, loginId, createEvents = [], removeEvents = [] } = opts

  // Load existing events:
  const eventRows =
    deviceId != null
      ? await getEventsByDeviceId(connection, deviceId)
      : loginId != null
      ? await getEventsByLoginId(connection, loginId)
      : []

  // Remove events from the array:
  const removeSet = new Set<string>(removeEvents)
  for (const event of createEvents) removeSet.add(event.eventId)
  const out: PushEvent[] = eventRows
    .map(row => row.event)
    .filter(event => !removeSet.has(event.eventId))

  // Perform the deletion on the database:
  for (const row of eventRows) {
    if (!removeSet.has(row.event.eventId)) continue
    if (row.event.state === 'waiting') row.event.state = 'cancelled'
    else row.event.state = 'hidden'
    await row.save()
  }

  // Add new events:
  for (const create of createEvents) {
    const event: PushEvent = {
      ...create,
      created: date,
      deviceId,
      loginId,
      state: 'waiting'
    }
    await addEvent(connection, event, date)
    out.push(event)
  }

  return out
}

export async function getEventsByDeviceId(
  connection: ServerScope,
  deviceId: string
): Promise<PushEventRow[]> {
  const db = connection.use(couchEventsSetup.name)
  const response = await db.view('deviceId', 'deviceId', {
    include_docs: true,
    key: deviceId
  })
  return response.rows.map(row => makePushEventRow(db, row.doc))
}

export async function getEventsByLoginId(
  connection: ServerScope,
  loginId: Uint8Array
): Promise<PushEventRow[]> {
  const db = connection.use(couchEventsSetup.name)
  const response = await db.view('loginId', 'loginId', {
    include_docs: true,
    key: base64.stringify(loginId)
  })
  return response.rows.map(row => makePushEventRow(db, row.doc))
}

export async function* streamAddressBalanceEvents(
  connection: ServerScope
): AsyncIterableIterator<PushEventRow> {
  const db = connection.use(couchEventsSetup.name)
  const stream = viewToStream(async params => {
    return await db.view('address-balance', 'address-balance', params)
  })
  for await (const raw of stream) {
    yield makePushEventRow(db, raw)
  }
}

export async function* streamPriceEvents(
  connection: ServerScope
): AsyncIterableIterator<PushEventRow> {
  const db = connection.use(couchEventsSetup.name)
  const stream = viewToStream(async params => {
    return await db.view('price', 'price', params)
  })
  for await (const raw of stream) {
    yield makePushEventRow(db, raw)
  }
}

export async function* streamTxConfirmEvents(
  connection: ServerScope
): AsyncIterableIterator<PushEventRow> {
  const db = connection.use(couchEventsSetup.name)
  const stream = viewToStream(async params => {
    return await db.view('tx-confirm', 'tx-confirm', params)
  })
  for await (const raw of stream) {
    yield makePushEventRow(db, raw)
  }
}

function makePushEventRow(
  db: DocumentScope<unknown>,
  raw: unknown
): PushEventRow {
  const clean = asCouchPushEvent(raw)
  const event = { ...clean.doc, created: new Date(clean.id) }
  let rev = clean.rev
  let base = { ...event }

  return {
    event,

    async save(): Promise<void> {
      while (true) {
        // Write to the database:
        const doc: ReturnType<typeof asCouchPushEvent> = {
          doc: event,
          id: clean.id,
          rev
        }
        const response = await db
          .insert(wasCouchPushEvent(doc))
          .catch(error => {
            if (asMaybeConflictError(error) == null) throw error
          })

        // If that worked, the merged document is now the latest:
        if (response?.ok === true) {
          rev = response.rev
          base = { ...event }
          return
        }

        // Something went wrong, so grab the latest remote document:
        const raw = await db.get(doc.id)
        const remote = asCouchPushEvent(raw)
        rev = remote.rev

        // If we don't have local edits, take the remote field:
        if (event.broadcastTxErrors === base.broadcastTxErrors) {
          event.broadcastTxErrors = remote.doc.broadcastTxErrors
        }
        if (
          event.pushMessageEmits === base.pushMessageEmits &&
          event.pushMessageFails === base.pushMessageFails
        ) {
          event.pushMessageEmits = remote.doc.pushMessageEmits
          event.pushMessageFails = remote.doc.pushMessageFails
        }
        if (event.state === base.state) {
          event.state = remote.doc.state
        }
        if (event.triggered === base.triggered) {
          event.triggered = remote.doc.triggered
        }
      }
    }
  }
}
