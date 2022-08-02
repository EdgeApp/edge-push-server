import { asNumber, asObject, asOptional, asString, uncleaner } from 'cleaners'
import {
  asCouchDoc,
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
  const { save } = makeDeviceRow(connection, packDevice(device))
  await save()
}

export const makeDeviceRow = (
  connection: ServerScope,
  doc: CouchDevice
): DeviceRow => {
  const device = unpackDevice(doc)
  return {
    device,
    async save() {
      doc.doc = packDevice(device).doc
      const db = connection.db.use(devicesSetup.name)
      const result = await db.insert(wasCouchDevice(doc))
      doc.rev = result?.rev
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
