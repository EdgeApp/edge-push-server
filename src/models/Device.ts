import { asNumber, asObject, asOptional, asString } from 'cleaners'
import { asCouchDoc } from 'edge-server-tools'
import Nano from 'nano'

import { serverConfig } from '../serverConfig'
import { Base } from './base'

const nanoDb = Nano(serverConfig.couchUri)
const dbDevices = nanoDb.db.use<ReturnType<typeof asDevice>>('db_devices')

const asDevice = asObject({
  appId: asString,
  tokenId: asOptional(asString),
  deviceDescription: asString,
  osType: asString,
  edgeVersion: asString,
  edgeBuildNumber: asNumber
})
export const asLegacyDevice = asCouchDoc(asDevice)

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
