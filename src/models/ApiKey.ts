import { asBoolean, asMap, asObject, asOptional, asString } from 'cleaners'
import Nano from 'nano'

import { serverConfig } from '../serverConfig'
import { Base } from './base'

const nanoDb = Nano(serverConfig.couchUri)
const dbDevices = nanoDb.db.use('db_api_keys')

const asApiKey = asObject({
  appId: asString,
  admin: asBoolean,
  adminsdk: asOptional(asMap(asString))
})

export class ApiKey extends Base implements ReturnType<typeof asApiKey> {
  public static table = dbDevices
  public static asType = asApiKey

  public appId!: string
  public admin!: boolean
  public adminsdk!: { [key: string]: string }
}
