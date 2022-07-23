import { asBoolean, asMap, asObject, asOptional, Cleaner } from 'cleaners'
import {
  asCouchDoc,
  asMaybeNotFoundError,
  DatabaseSetup,
  makeJsDesign
} from 'edge-server-tools'
import { ServerScope } from 'nano'

import {
  Device,
  User,
  UserCurrencyCodes,
  UserCurrencyHours,
  UserDevices,
  UserNotifications
} from '../types/pushTypes'
import { saveToDB } from './utils/couchOps'

export const asUserDevices: Cleaner<UserDevices> = asObject(asBoolean)
export type IDevicesByCurrencyHoursViewResponse = ReturnType<
  typeof asUserDevices
>
export const asUserCurrencyHours: Cleaner<UserCurrencyHours> = asObject({
  '1': asBoolean,
  '24': asBoolean
})
export const asUserCurrencyCodes: Cleaner<UserCurrencyCodes> =
  asMap(asUserCurrencyHours)

export const asUserNotifications: Cleaner<UserNotifications> = asObject({
  enabled: asOptional(asBoolean),
  currencyCodes: asUserCurrencyCodes
})

export const asCouchUser = asCouchDoc<Omit<User, 'userId'>>(
  asObject({
    devices: asUserDevices,
    notifications: asUserNotifications
  })
)

type CouchUser = ReturnType<typeof asCouchUser>

export const usersSetup: DatabaseSetup = {
  name: 'db_user_settings',
  documents: {
    '_design/filter': makeJsDesign('by-currency', ({ emit }) => ({
      map: function (doc) {
        const notifs = doc.notifications
        if (notifs?.enabled && notifs.currencyCodes) {
          const codes = notifs.currencyCodes
          for (const currencyCode in codes) {
            for (const hours in codes[currencyCode]) {
              const enabled = codes[currencyCode][hours]
              if (enabled) {
                emit([currencyCode, hours], doc.devices)
              }
            }
          }
        }
      }
    })),
    '_design/map': makeJsDesign('currency-codes', ({ emit }) => ({
      map: function (doc) {
        if (doc.notifications?.currencyCodes) {
          for (const code in doc.notifications.currencyCodes) {
            emit(null, code)
          }
        }
      },
      reduce: function (keys, values, rereduce) {
        return Array.from(new Set(values))
      }
    }))
  }
}

// ------------------------------------------------------------------------------
// Functions associated with User
// ------------------------------------------------------------------------------

export const cleanUpMissingDevices = async (
  connection: ServerScope,
  user: User,
  devices: Device[]
): Promise<void> => {
  const db = connection.db.use(usersSetup.name)
  let updated = false
  for (const device of devices) {
    if (user.devices[device.deviceId] == null) {
      user.devices[device.deviceId] = true
      updated = true
    }
  }
  if (updated) await saveToDB(db, packUser(user))
}

export const devicesByCurrencyHours = async (
  connection: ServerScope,
  hours: string,
  currencyCode: string
) => {
  return await connection.db
    .use(usersSetup.name)
    .view<IDevicesByCurrencyHoursViewResponse>('filter', 'by-currency', {
      key: [currencyCode, hours]
    })
}

export const saveUserToDB = async (
  connection: ServerScope,
  user: User
): Promise<void> => {
  const db = connection.db.use(usersSetup.name)
  await saveToDB(db, packUser(user))
}

export const fetchUser = async (
  connection: ServerScope,
  userId: string
): Promise<User> => {
  const db = connection.db.use(usersSetup.name)
  const raw = await db.get(userId).catch(error => {
    if (asMaybeNotFoundError(error) != null) return
    throw error
  })
  const userDoc = asCouchUser(raw)
  return unpackUser(userDoc)
}

export const unpackUser = (doc: CouchUser): User => {
  return { ...doc.doc, userId: doc.id }
}
export const packUser = (user: User): CouchUser => {
  return {
    doc: { devices: user.devices, notifications: user.notifications },
    id: user.userId
  }
}
