import { asNumber, asObject, asOptional, asString } from 'cleaners'
import * as Nano from 'nano'

import { Base } from '.'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CONFIG = require('../../serverConfig.json')

const nanoDb = Nano(CONFIG.dbFullpath)
const dbDevices = nanoDb.db.use<ReturnType<typeof IDevice>>('db_devices')

const IDevice = asObject({
  appId: asString,
  tokenId: asOptional(asString),
  deviceDescription: asString,
  osType: asString,
  edgeVersion: asString,
  edgeBuildNumber: asNumber
})

type asDevice = Omit<ReturnType<typeof IDevice>, 'tokenId'> & {
  tokenId?: string
}

export class Device extends Base implements asDevice {
  public static table = dbDevices
  public static asType = IDevice

  public appId!: string
  public tokenId?: string
  public deviceDescription!: string
  public osType!: string
  public edgeVersion!: string
  public edgeBuildNumber!: number
}
