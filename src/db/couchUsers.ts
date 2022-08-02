import {
  asBoolean,
  asMap,
  asObject,
  asOptional,
  Cleaner,
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

import { UserRow } from '../types/dbTypes'
import {
  Device,
  User,
  UserCurrencyCodes,
  UserCurrencyHours,
  UserDevices,
  UserNotifications
} from '../types/pushTypes'

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

const wasCouchUser = uncleaner(asCouchUser)
type CouchUser = ReturnType<typeof asCouchUser>

export const usersSetup: DatabaseSetup = {
  name: 'db_user_settings',
  documents: {
    '_design/filter': makeJsDesign('by-currency', ({ emit }) => ({
      map: function (doc) {
        const notifs = doc.notifications

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (notifs?.enabled && notifs.currencyCodes) {
          const codes = notifs.currencyCodes
          for (const currencyCode in codes) {
            for (const hours in codes[currencyCode]) {
              const enabled = codes[currencyCode][hours]
              // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
  let updated = false
  for (const device of devices) {
    if (user.devices[device.deviceId] == null) {
      user.devices[device.deviceId] = true
      updated = true
    }
  }
  if (updated) {
    const db = connection.db.use(usersSetup.name)
    const raw = await db.get(user.userId).catch(error => {
      if (asMaybeNotFoundError(error) != null) return
      throw error
    })
    if (raw == null) return
    const { save } = makeUserRow(connection, raw)
    await save()
  }
}

export const makeUserRow = (connection: ServerScope, raw: unknown): UserRow => {
  const db = connection.db.use(usersSetup.name)
  let base = asCouchUser(raw)
  const user: User = { ...base.doc, userId: base.id }
  return {
    user,
    async save() {
      let remote = base
      while (true) {
        // Write to the database:
        const doc: CouchUser = {
          doc: { ...user },
          id: remote.id,
          rev: remote.rev
        }
        const response = await db.insert(wasCouchUser(doc)).catch(error => {
          if (asMaybeConflictError(error) == null) throw error
        })

        // If that worked, the merged document is now the latest:
        if (response?.ok === true) {
          base = doc
          return
        }

        // Something went wrong, so grab the latest remote document:
        const raw = await db.get(user.userId)
        remote = asCouchUser(raw)
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
  const raw = await db.get(user.userId).catch(error => {
    if (asMaybeNotFoundError(error) != null) return
    throw error
  })
  if (raw == null) return
  const { save } = makeUserRow(connection, raw)
  await save()
}

export const fetchUser = async (
  connection: ServerScope,
  userId: string
): Promise<User | null> => {
  const db = connection.db.use(usersSetup.name)
  const raw = await db.get(userId).catch(error => {
    if (asMaybeNotFoundError(error) != null) return
    throw error
  })
  if (raw == null) return null
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
