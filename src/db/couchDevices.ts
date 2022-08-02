import { asNumber, asObject, asOptional, asString, uncleaner } from 'cleaners'
import {
  asCouchDoc,
  asMaybeConflictError,
  asMaybeNotFoundError,
  DatabaseSetup
} from 'edge-server-tools'
import { ServerScope } from 'nano'

import { DeviceRow } from '../types/dbTypes'
import { Device } from '../types/pushTypes'

export const asCouchDevice = asCouchDoc<Omit<Device, 'deviceId'>>(
  asObject({
    appId: asString,
    tokenId: asOptional(asString),
    deviceDescription: asString,
    osType: asString,
    edgeVersion: asString,
    edgeBuildNumber: asNumber
  })
)
const wasCouchDevice = uncleaner(asCouchDevice)
type CouchDevice = ReturnType<typeof asCouchDevice>
export const devicesSetup: DatabaseSetup = { name: 'db_devices' }

export const fetchDevice = async (
  connection: ServerScope,
  deviceId: string
): Promise<Device | null> => {
  const db = connection.db.use(devicesSetup.name)
  const raw = await db.get(deviceId).catch(error => {
    if (asMaybeNotFoundError(error) != null) return
    throw error
  })
  if (raw == null) return null
  const deviceDoc = asCouchDevice(raw)
  return unpackDevice(deviceDoc)
}

export const saveDeviceToDB = async (
  connection: ServerScope,
  device: Device
): Promise<void> => {
  const db = connection.db.use(devicesSetup.name)

  const raw = await db.get(device.deviceId).catch(error => {
    if (asMaybeNotFoundError(error) != null) return
    throw error
  })
  if (raw == null) return
  const { save } = makeDeviceRow(connection, raw)
  await save()
}

export const makeDeviceRow = (
  connection: ServerScope,
  raw: unknown
): DeviceRow => {
  const db = connection.db.use(devicesSetup.name)
  let base = asCouchDevice(raw)
  const device: Device = { ...base.doc, deviceId: base.id }
  return {
    device,
    async save() {
      let remote = base
      while (true) {
        // Write to the database:
        const doc: CouchDevice = {
          doc: { ...device },
          id: remote.id,
          rev: remote.rev
        }
        const response = await db.insert(wasCouchDevice(doc)).catch(error => {
          if (asMaybeConflictError(error) == null) throw error
        })

        // If that worked, the merged document is now the latest:
        if (response?.ok === true) {
          base = doc
          return
        }

        // Something went wrong, so grab the latest remote document:
        const raw = await db.get(device.deviceId)
        remote = asCouchDevice(raw)
      }
    }
  }
}

export const unpackDevice = (doc: CouchDevice): Device => {
  return { ...doc.doc, deviceId: doc.id }
}

export const packDevice = (device: Device): CouchDevice => {
  const { deviceId, ...doc } = device
  return {
    id: deviceId,
    doc: doc
  }
}
