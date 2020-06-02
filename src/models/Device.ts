import * as Nano from 'nano'

import { Base } from '.'
const CONFIG = require('../../serverConfig.json')

const nanoDb = Nano(CONFIG.dbFullpath)
const dbDevices = nanoDb.db.use('db_devices')

interface IDevice {
  appId: string
  tokenId: string
  deviceDescription: string
  osType: string
  edgeVersion: string
  edgeBuildNumber: string
  userId?: string
}

export class Device extends Base implements IDevice {
  public static table = dbDevices

  public appId: string
  public tokenId: string
  public deviceDescription: string
  public osType: string
  public edgeVersion: string
  public edgeBuildNumber: string
}
