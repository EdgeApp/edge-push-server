import {
  asArray,
  asBoolean,
  asDate,
  asObject,
  asOptional,
  asString,
  uncleaner
} from 'cleaners'
import {
  asCouchDoc,
  asMaybeConflictError,
  asMaybeNotFoundError,
  CouchDoc,
  DatabaseSetup,
  makeJsDesign
} from 'edge-server-tools'
import { DocumentScope, ServerScope } from 'nano'
import { base64 } from 'rfc4648'

import { asBase64 } from '../types/pushCleaners'
import { Device } from '../types/pushTypes'

/**
 * A device returned from the database.
 * To make changes, edit the `device` object, then call `save`.
 */
export interface DeviceRow {
  device: Device
  exists: boolean
  save: () => Promise<void>
}

type CouchDevice = Omit<Device, 'deviceId'>

/**
 * A single phone or other devIce, as stored in Couch.
 * The document ID is the deviceId.
 */
export const asCouchDevice = asCouchDoc(
  asObject<CouchDevice>({
    created: asDate,

    // Status:
    apiKey: asOptional(asString),
    deviceToken: asOptional(asString),
    ignorePriceChanges: asOptional(asBoolean, false),
    loginIds: asArray(asBase64),
    visited: asDate
  })
)
const wasCouchDevice = uncleaner(asCouchDevice)

/**
 * Looks up devices that contain a particular login.
 */
const loginIdDesign = makeJsDesign('loginId', ({ emit }) => ({
  map: function (doc) {
    for (let i = 0; i < doc.loginIds.length; ++i) {
      emit(doc.loginIds[i], null)
    }
  }
}))

export const couchDevicesSetup: DatabaseSetup = {
  name: 'push-devices',
  documents: {
    '_design/loginId': loginIdDesign
  }
}

/**
 * Looks up a device by its id.
 * If the device does not exist in the database, creates a fresh row.
 */
export async function getDeviceById(
  connection: ServerScope,
  deviceId: string,
  date: Date
): Promise<DeviceRow> {
  const db = connection.use(couchDevicesSetup.name)

  const emptyDevice = {
    id: deviceId,
    doc: {
      created: date,
      apiKey: undefined,
      deviceToken: undefined,
      ignorePriceChanges: false,
      loginIds: [],
      visited: date
    }
  }
  if (deviceId === '') return makeDeviceRow(db, emptyDevice)

  const raw = await db.get(deviceId).catch(error => {
    if (asMaybeNotFoundError(error) != null) return
    throw error
  })

  if (raw == null) return makeDeviceRow(db, emptyDevice)
  return makeDeviceRow(db, asCouchDevice(raw))
}

/**
 * Finds all the devices that have logged into this account.
 */
export async function getDevicesByLoginId(
  connection: ServerScope,
  loginId: Uint8Array
): Promise<DeviceRow[]> {
  const db = connection.use(couchDevicesSetup.name)
  const response = await db.view('loginId', 'loginId', {
    include_docs: true,
    key: base64.stringify(loginId)
  })
  return response.rows.map(row => makeDeviceRow(db, asCouchDevice(row.doc)))
}

function makeDeviceRow(
  db: DocumentScope<unknown>,
  clean: CouchDoc<CouchDevice>
): DeviceRow {
  const device = { ...clean.doc, deviceId: clean.id }
  let rev = clean.rev
  let base = { ...device }

  return {
    device,

    get exists(): boolean {
      return rev != null
    },

    async save(): Promise<void> {
      while (true) {
        // Write to the database:
        const doc: CouchDoc<CouchDevice> = {
          doc: device,
          id: clean.id,
          rev
        }
        const response = await db.insert(wasCouchDevice(doc)).catch(error => {
          if (asMaybeConflictError(error) == null) throw error
        })

        // If that worked, the merged document is now the latest:
        if (response?.ok === true) {
          rev = response.rev
          base = { ...device }
          return
        }

        // Something went wrong, so grab the latest remote document:
        const raw = await db.get(doc.id)
        const remote = asCouchDevice(raw)
        rev = remote.rev

        // If we don't have local edits, take the remote field:
        if (device.apiKey === base.apiKey) {
          device.apiKey = remote.doc.apiKey
        }
        if (device.deviceToken === base.deviceToken) {
          device.deviceToken = remote.doc.deviceToken
        }
        if (device.ignorePriceChanges === base.ignorePriceChanges) {
          device.ignorePriceChanges = remote.doc.ignorePriceChanges
        }
        if (device.loginIds === base.loginIds) {
          device.loginIds = remote.doc.loginIds
        }
        if (device.visited < remote.doc.visited) {
          device.visited = remote.doc.visited
        }
      }
    }
  }
}
