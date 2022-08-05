import {
  asArray,
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
  DatabaseSetup,
  makeJsDesign
} from 'edge-server-tools'
import { ServerScope } from 'nano'
import { base64 } from 'rfc4648'

import { asBase64 } from '../types/pushCleaners'
import { Device } from '../types/pushTypes'

/**
 * A device returned from the database.
 * Mutate the `device` object, then call `save` to commit the changes.
 */
export interface DeviceRow {
  device: Device
  save: () => Promise<void>
}

/**
 * An API key, as stored in Couch.
 */
export const asCouchDevice = asCouchDoc<Omit<Device, 'deviceId'>>(
  asObject({
    created: asDate,

    // Status:
    apiKey: asOptional(asString),
    deviceToken: asOptional(asString),
    loginIds: asArray(asBase64),
    visited: asDate
  })
)
const wasCouchDevice = uncleaner(asCouchDevice)
type CouchDevice = ReturnType<typeof asCouchDevice>

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
  const raw = await db.get(deviceId).catch(error => {
    if (asMaybeNotFoundError(error) != null) return
    throw error
  })

  if (raw == null) {
    return makeDeviceRow(connection, {
      created: date,
      deviceId,
      apiKey: undefined,
      deviceToken: undefined,
      loginIds: [],
      visited: date
    })
  }
  const clean = asCouchDevice(raw)
  return makeDeviceRow(
    connection,
    { ...clean.doc, deviceId: clean.id },
    clean.rev
  )
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
  return response.rows.map(row => {
    const clean = asCouchDevice(row.doc)
    return makeDeviceRow(
      connection,
      { ...clean.doc, deviceId: clean.id },
      clean.rev
    )
  })
}

function makeDeviceRow(
  connection: ServerScope,
  device: Device,
  rev?: string
): DeviceRow {
  const db = connection.db.use(couchDevicesSetup.name)
  let base = { ...device }

  return {
    device,

    async save(): Promise<void> {
      while (true) {
        // Write to the database:
        const doc: CouchDevice = {
          doc: device,
          id: device.deviceId,
          rev
        }
        const response = await db.insert(wasCouchDevice(doc)).catch(error => {
          if (asMaybeConflictError(error) == null) throw error
        })

        // If that worked, the merged document is now the latest:
        if (response?.ok === true) {
          base = { ...device }
          rev = doc.rev
          return
        }

        // Something went wrong, so grab the latest remote document:
        const raw = await db.get(device.deviceId)
        const clean = asCouchDevice(raw)
        rev = clean.rev
        const remote = clean.doc

        // If we don't have local edits, take the remote field:
        if (device.apiKey === base.apiKey) {
          device.apiKey = remote.apiKey
        }
        if (device.deviceToken === base.deviceToken) {
          device.deviceToken = remote.deviceToken
        }
        if (device.loginIds === base.loginIds) {
          device.loginIds = remote.loginIds
        }
        if (remote.visited > device.visited) {
          device.visited = remote.visited
        }
      }
    }
  }
}
