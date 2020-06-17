import * as Nano from 'nano'
import { asMap, asNumber, asObject } from 'cleaners'

import { Base } from '.'
const CONFIG = require('../../serverConfig.json')

const nanoDb = Nano(CONFIG.dbFullpath)
const dbCurrencyThreshold = nanoDb.db.use('db_currency_thresholds')

const IThresholds = asMap(asObject({
  lastUpdated: asNumber,
  price: asNumber
}))

const ICurrencyThreshold = asObject({
  thresholds: IThresholds
})

export class CurrencyThreshold extends Base implements ReturnType<typeof ICurrencyThreshold> {
  public static table = dbCurrencyThreshold
  public static asType = ICurrencyThreshold

  public thresholds: ReturnType<typeof IThresholds>

  constructor(...args) {
    super(...args)

    if (!this.thresholds)
      this.thresholds = {}
  }

  public static async fromCode(currencyCode: string): Promise<CurrencyThreshold> {
    const threshold = new CurrencyThreshold(null, currencyCode)
    const obj = { lastUpdated: 0, price: 0 }
    threshold.thresholds[1] = obj
    threshold.thresholds[24] = obj
    await threshold.save()
    return threshold
  }

  public async update(hours: string, timestamp: number, price: number): Promise<CurrencyThreshold> {
    this.thresholds[hours] = {
      lastUpdated: timestamp,
      price
    }
    return await this.save() as CurrencyThreshold
  }
}
