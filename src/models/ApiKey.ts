import * as Nano from 'nano'

import { Base } from '.'
const CONFIG = require('../../serverConfig.json')

const nanoDb = Nano(CONFIG.dbFullpath)
const dbDevices = nanoDb.db.use('db_api_keys')

interface IApiKey {
  appId: string
}

export class ApiKey extends Base implements IApiKey {
  public static table = dbDevices

  public appId: string
}
