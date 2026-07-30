import {
  asArray,
  asBoolean,
  asDate,
  asMaybe,
  asNumber,
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
  makeJsDesign,
  viewToStream
} from 'edge-server-tools'
import { DocumentScope } from 'nano'
import { base64 } from 'rfc4648'

import { asBase64 } from '../types/pushCleaners'
import { Device } from '../types/pushTypes'
import { DbConnections } from './dbConnections'

// Couch rejects an `_all_docs` request with no keys, and very large key lists
// make for unwieldy requests, so batch lookups at this size:
const FETCH_BATCH_SIZE = 500

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
const asCouchDevice = asCouchDoc(
  asObject<CouchDevice>({
    created: asDate,

    // Status:
    apiKey: asOptional(asString),
    deviceToken: asOptional(asString),
    ignoreMarketing: asOptional(asBoolean, false),
    ignorePriceChanges: asOptional(asBoolean, false),
    ip: asOptional(asString),
    location: asOptional(
      asObject({
        country: asString,
        city: asString,
        region: asOptional(asString, '')
      })
    ),
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

/**
 * Looks up devices by the IP location sorted by city.
 */
const locationByCityDesign = makeJsDesign('locationByCity', ({ emit }) => ({
  map: function (doc) {
    if (doc.location == null) return
    emit(
      [
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        doc.location.country || '',
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        doc.location.region || '',
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        doc.location.city || ''
      ],
      null
    )
  },
  reduce: '_count'
}))

/**
 * Looks up devices by the IP location sorted by region/state.
 */
const locationByRegionDesign = makeJsDesign('locationByRegion', ({ emit }) => ({
  map: function (doc) {
    if (doc.location == null) return
    emit(
      [
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        doc.location.country || '',
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        doc.location.region || '',
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        doc.location.city || ''
      ],
      null
    )
  },
  reduce: '_count'
}))

/**
 * Looks up devices by API key, then by IP location.
 */
const apiKeyLocationDesign = makeJsDesign('apiKeyLocation', ({ emit }) => ({
  map: function (doc) {
    if (doc.apiKey == null || doc.location == null) return
    emit(
      [
        doc.apiKey,
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        doc.location.country || '',
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        doc.location.region || '',
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        doc.location.city || ''
      ],
      null
    )
  },
  reduce: '_count'
}))

export const couchDevicesSetup: DatabaseSetup = {
  name: 'push-devices',
  documents: {
    '_design/loginId': loginIdDesign,
    '_design/locationByCity': locationByCityDesign,
    '_design/locationByRegion': locationByRegionDesign,
    '_design/apiKeyLocation': apiKeyLocationDesign
  }
}

export const countDevicesByLocation = async (
  connections: DbConnections,
  location: { country?: string; region?: string; city?: string }
): Promise<
  Array<{
    key: string[]
    count: number
  }>
> => {
  const db = connections.couch.use(couchDevicesSetup.name)

  const { country, region, city } = location

  let startKey: string[]
  let viewName: string
  const isRegionlessQuery = city != null && region == null

  if (isRegionlessQuery) {
    // Query by country and maybe city:
    startKey = [
      ...(country == null ? [] : [country]),
      ...(city == null ? [] : [city])
    ]
    viewName = 'locationByCity'
  } else {
    // Query by country, region, and maybe city:
    startKey = [
      ...(country == null ? [] : [country]),
      ...(region == null ? [] : [region]),
      ...(city == null ? [] : [city])
    ]
    viewName = 'locationByRegion'
  }

  const endKey = [...startKey, 'zzzzzz']

  const queryParams = {
    start_key: startKey,
    end_key: endKey
  }

  const results = await db.view(viewName, viewName, {
    ...queryParams,
    reduce: true,
    group: true,
    // Use grouping for country/city queries to expose the regions.
    // This is useful to verify your query matches a single target region.
    group_level: startKey.length + (isRegionlessQuery ? 1 : 0)
  })

  return results.rows.map(row => {
    const key = asOptional(asArray(asString), [])(row.key)
    const count: number = asNumber(row.value)
    return { key: key, count }
  })
}

/**
 * Looks up a device by its id.
 * If the device does not exist in the database, creates a fresh row.
 */
export async function getDeviceById(
  connections: DbConnections,
  deviceId: string,
  date: Date
): Promise<DeviceRow> {
  const db = connections.couch.use(couchDevicesSetup.name)

  const emptyDevice = {
    id: deviceId,
    doc: {
      created: date,
      apiKey: undefined,
      deviceToken: undefined,
      ignoreMarketing: false,
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
 * Looks up many devices at once, skipping any ids that are missing, deleted, or
 * unreadable. Ids are de-duplicated, and the lookup runs in batches to keep
 * individual Couch requests small.
 */
export async function fetchDevicesByIds(
  connections: DbConnections,
  deviceIds: string[]
): Promise<DeviceRow[]> {
  const db = connections.couch.use(couchDevicesSetup.name)
  const unique = [...new Set(deviceIds)]

  const out: DeviceRow[] = []
  for (let i = 0; i < unique.length; i += FETCH_BATCH_SIZE) {
    const keys = unique.slice(i, i + FETCH_BATCH_SIZE)
    const response = await db.fetch({ keys })
    for (const row of response.rows) {
      // Missing and deleted ids come back as rows without a document:
      if ('error' in row || row.doc == null) continue
      const couchDevice = asMaybe(asCouchDevice)(row.doc)
      if (couchDevice == null) continue
      out.push(makeDeviceRow(db, couchDevice))
    }
  }
  return out
}

/**
 * Finds all the devices that have logged into this account.
 */
export async function getDevicesByLoginId(
  connections: DbConnections,
  loginId: Uint8Array
): Promise<DeviceRow[]> {
  const db = connections.couch.use(couchDevicesSetup.name)
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
        if (device.ignoreMarketing === base.ignoreMarketing) {
          device.ignoreMarketing = remote.doc.ignoreMarketing
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

export async function* streamDevicesByLocation(
  connections: DbConnections,
  location: { country?: string; region?: string; city?: string }
): AsyncIterableIterator<DeviceRow> {
  const db = connections.couch.use(couchDevicesSetup.name)

  const { country, region, city } = location

  let startKey: string[]
  let viewName: string
  const isRegionlessQuery = city != null && region == null

  if (isRegionlessQuery) {
    // Query by country and maybe city:
    startKey = [
      ...(country == null ? [] : [country]),
      ...(city == null ? [] : [city])
    ]
    viewName = 'locationByCity'
  } else {
    // Query by country, region, and maybe city:
    startKey = [
      ...(country == null ? [] : [country]),
      ...(region == null ? [] : [region]),
      ...(city == null ? [] : [city])
    ]
    viewName = 'locationByRegion'
  }

  const endKey = [...startKey, 'zzzzzz']

  const queryParams = {
    start_key: startKey,
    end_key: endKey
  }

  for await (const doc of viewToStream(async params => {
    return await db.view(viewName, viewName, {
      reduce: false,
      ...queryParams,
      ...params
    })
  })) {
    const couchDevice = asMaybe(asCouchDevice)(doc)
    if (couchDevice == null) continue
    yield makeDeviceRow(db, couchDevice)
  }
}

/**
 * Builds a CouchDB start key of [apiKey, country, region, city], stopping at the
 * first missing location field so the range stays a valid prefix.
 */
function makeApiKeyLocationStartKey(
  apiKey: string,
  location: { country?: string; region?: string; city?: string }
): string[] {
  const key = [apiKey]
  for (const part of [location.country, location.region, location.city]) {
    if (part == null) break
    key.push(part)
  }
  return key
}

/**
 * Streams the devices registered under an API key, optionally narrowed by
 * location.
 */
export async function* streamDevicesByApiKeyLocation(
  connections: DbConnections,
  apiKey: string,
  location: { country?: string; region?: string; city?: string }
): AsyncIterableIterator<DeviceRow> {
  const db = connections.couch.use(couchDevicesSetup.name)
  const startKey = makeApiKeyLocationStartKey(apiKey, location)
  const endKey = [...startKey, 'zzzzzz']

  for await (const doc of viewToStream(async params => {
    return await db.view('apiKeyLocation', 'apiKeyLocation', {
      reduce: false,
      start_key: startKey,
      end_key: endKey,
      ...params
    })
  })) {
    const couchDevice = asMaybe(asCouchDevice)(doc)
    if (couchDevice == null) continue
    yield makeDeviceRow(db, couchDevice)
  }
}
