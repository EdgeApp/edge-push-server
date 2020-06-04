import * as Nano from 'nano'
import { asNumber, asObject, asString } from 'cleaners'

import { Base } from '.'
const CONFIG = require('../../serverConfig.json')

const nanoDb = Nano(CONFIG.dbFullpath)
const dbDevices = nanoDb.db.use('db_devices')

const IDevice = asObject({
  appId: asString,
  tokenId: asString,
  deviceDescription: asString,
  osType: asString,
  edgeVersion: asString,
  edgeBuildNumber: asNumber
})

export class Device extends Base implements ReturnType<typeof IDevice> {
  public static table = dbDevices
  public static asType = IDevice

  public appId: string
  public tokenId: string
  public deviceDescription: string
  public osType: string
  public edgeVersion: string
  public edgeBuildNumber: number
}
