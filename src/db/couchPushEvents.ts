import {
  asArray,
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
  CouchDoc,
  DatabaseSetup,
  JsDesignDocument,
  makeJsDesign,
  viewToStream
} from 'edge-server-tools'
import { DocumentScope, ServerScope } from 'nano'
import { base64 } from 'rfc4648'

import { NewPushEvent } from '../types/pushApiTypes'
import {
  asBase64,
  asBroadcastTx,
  asPushEventState,
  asPushMessage,
  asPushTrigger,
  asPushTriggerState
} from '../types/pushCleaners'
import { PushEvent, PushTrigger } from '../types/pushTypes'

/**
 * An event returned from the database.
 * To make changes, edit the `event` object, then call `save`.
 */
export interface PushEventRow {
  id: string
  event: PushEvent
  save: () => Promise<void>
}

interface CouchPushEvent extends Omit<PushEvent, 'created'> {}

/**
 * A push event, as stored in Couch.
 * The document ID is the creation date.
 */
export const asCouchPushEvent = asCouchDoc(
  asObject<CouchPushEvent>({
    eventId: asString, // Not the document id!
    deviceId: asOptional(asString),
    loginId: asOptional(asBase64),

    // Event:
    broadcastTxs: asOptional(asArray(asBroadcastTx)),
    pushMessage: asOptional(asPushMessage),
    trigger: asPushTrigger,

    // Status:
    broadcastTxErrors: asOptional(asArray(asEither(asString, asNull))),
    pushMessageEmits: asOptional(asNumber),
    pushMessageFails: asOptional(asNumber),
    state: asPushEventState,
    triggered: asPushTriggerState
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
 * Looks up active events which contain the given trigger type.
 */
function makeStreamDesign(
  type: 'address-balance' | 'price-change' | 'price-level' | 'tx-confirm'
): JsDesignDocument {
  return makeJsDesign(
    type,
    ({ emit }) => ({
      map: function (doc) {
        if (doc.state !== 'waiting') return

        function search(trigger: PushTrigger): boolean {
          if (trigger == null) return false
          if (trigger.type === 'address-balance') return true
          if (trigger.type === 'all' || trigger.type === 'any') {
            for (let i = 0; i < trigger.triggers.length; ++i) {
              if (search(trigger.triggers[i])) return true
            }
          }
          return false
        }

        if (search(doc.trigger)) emit(doc._id, null)
      }
    }),
    {
      fixJs(code) {
        return code
          .replace(/\blet\b|\bconst\b/g, 'var')
          .replace('address-balance', type)
      }
    }
  )
}

export const couchEventsSetup: DatabaseSetup = {
  name: 'push-events',

  documents: {
    '_design/address-balance': makeStreamDesign('address-balance'),
    '_design/deviceId': deviceIdDesign,
    '_design/loginId': loginIdDesign,
    '_design/price-change': makeStreamDesign('price-change'),
    '_design/price-level': makeStreamDesign('price-level'),
    '_design/tx-confirm': makeStreamDesign('tx-confirm')
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
  const removeSet = new Set(removeEvents)
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
      state: 'waiting',
      triggered: undefined
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
  return response.rows.map(row =>
    makePushEventRow(db, asCouchPushEvent(row.doc))
  )
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
  return response.rows.map(row =>
    makePushEventRow(db, asCouchPushEvent(row.doc))
  )
}

export async function* streamEvents(
  connection: ServerScope,
  view: 'address-balance' | 'price-change' | 'price-level' | 'tx-confirm',
  opts: { afterDate?: Date } = {}
): AsyncIterableIterator<PushEventRow> {
  const { afterDate } = opts

  const db = connection.use(couchEventsSetup.name)
  const stream = viewToStream(async params => {
    return await db.view(view, view, {
      start_key: afterDate == null ? '' : afterDate.toISOString(),
      ...params
    })
  })
  for await (const raw of stream) {
    yield makePushEventRow(db, asCouchPushEvent(raw))
  }
}

function makePushEventRow(
  db: DocumentScope<unknown>,
  clean: CouchDoc<CouchPushEvent>
): PushEventRow {
  const event = { ...clean.doc, created: new Date(clean.id) }
  let rev = clean.rev
  let base = { ...event }

  return {
    id: clean.id,
    event,

    async save(): Promise<void> {
      while (true) {
        // Write to the database:
        const doc: CouchDoc<CouchPushEvent> = {
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
