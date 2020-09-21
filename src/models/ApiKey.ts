import { asBoolean, asMap, asObject, asOptional, asString } from 'cleaners'
import * as Nano from 'nano'

import { Base } from '.'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CONFIG = require('../../serverConfig.json')

const nanoDb = Nano(CONFIG.dbFullpath)
const dbDevices = nanoDb.db.use('db_api_keys')

const IApiKey = asObject({
  appId: asString,
  admin: asBoolean,
  adminsdk: asOptional(asMap(asString))
})

export class ApiKey extends Base implements ReturnType<typeof IApiKey> {
  public static table = dbDevices
  public static asType = IApiKey

  public appId!: string
  public admin!: boolean
  public adminsdk!: { [key: string]: string }
}
