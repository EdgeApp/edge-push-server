import {
  asArray,
  asBoolean,
  asMap,
  asMaybe,
  asObject,
  asString
} from 'cleaners'
import { asCouchDoc } from 'edge-server-tools'
import { domainToASCII } from 'url'

import { User } from '../types/pushTypes'

const asCouchUser = asCouchDoc<Omit<User, 'loginId'>>(
  asObject({
    devices: asObject(asBoolean),
    notifications: asObject({
      enabled: asBoolean,
      currencyCodes: asObject(
        asObject({
          '1': asBoolean,
          '24': asBoolean
        })
      )
    })
  })
)
type CouchUser = ReturnType<typeof asCouchUser>

export async function getUserById(
  connection: ServerScope,
  id: string
): Promise<User> {}

export async function updateUserById(
  connection: ServerScope,
  user: User
): Promise<User> {}

function unpackUser(doc: CouchUser): User {
  return { ...doc.doc, loginId: doc.id, notifications: Object.keys(doc.notifications.currencyCodes).map(key => ...arguments.FutureNotifType) }
}
