import { asNumber, asObject, asOptional, asString } from 'cleaners'
import * as Nano from 'nano'

import { Base } from '.'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CONFIG = require('../../serverConfig.json')

const nanoDb = Nano(CONFIG.dbFullpath)
const dbDevices = nanoDb.db.use<ReturnType<typeof asDevice>>('db_devices')

const asDevice = asObject({
  appId: asString,
  tokenId: asOptional(asString),
  deviceDescription: asString,
  osType: asString,
  edgeVersion: asString,
  edgeBuildNumber: asNumber
})

export class Device extends Base implements ReturnType<typeof asDevice> {
  public static table = dbDevices
  public static asType = asDevice

  public appId!: string
  public tokenId!: string | undefined
  public deviceDescription!: string
  public osType!: string
  public edgeVersion!: string
  public edgeBuildNumber!: number
}
