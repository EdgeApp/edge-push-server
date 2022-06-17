import { asMap } from 'cleaners'
import Nano from 'nano'

import { serverConfig } from '../serverConfig'
import { Base } from '.'

const nanoDb = Nano(serverConfig.couchUri)
const dbCurrencyThreshold = nanoDb.db.use('defaults')

export class Defaults extends Base {
  public static table = dbCurrencyThreshold
  public static asType = asMap
}
