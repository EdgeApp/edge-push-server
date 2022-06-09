import { asMap } from 'cleaners'
import Nano from 'nano'

import { Base } from '.'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CONFIG = require('../../serverConfig.json')

const nanoDb = Nano(CONFIG.dbFullpath)
const dbCurrencyThreshold = nanoDb.db.use('defaults')

export class Defaults extends Base {
  public static table = dbCurrencyThreshold
  public static asType = asMap
}
