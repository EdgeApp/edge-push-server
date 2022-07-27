import { asBoolean, asMap, asNumber, asObject, asOptional } from 'cleaners'
import Nano from 'nano'

import { serverConfig } from '../serverConfig'
import { Base } from './base'

const nanoDb = Nano(serverConfig.couchUri)
const dbCurrencyThreshold = nanoDb.db.use('db_currency_thresholds')

const asThreshold = asObject({
  custom: asOptional(asNumber),
  lastUpdated: asNumber,
  price: asNumber
})
const asThresholds = asMap(asThreshold)

interface ICurrencyThreshold {
  disabled?: boolean
  anomaly?: number
  thresholds: ReturnType<typeof asThresholds>
}

const asCurrencyThreshold = asObject<ICurrencyThreshold>({
  disabled: asOptional(asBoolean),
  anomaly: asOptional(asNumber),
  thresholds: asThresholds
})

export class CurrencyThreshold extends Base implements ICurrencyThreshold {
  public static table = dbCurrencyThreshold
  public static asType = asCurrencyThreshold

  public disabled?: boolean
  public anomaly?: number
  public thresholds!: ReturnType<typeof asThresholds>

  public static async fromCode(
    currencyCode: string
  ): Promise<CurrencyThreshold> {
    const threshold = new CurrencyThreshold(undefined, currencyCode)
    return await threshold.save()
  }

  public async update(
    hours: string | number,
    timestamp: number,
    price: number
  ): Promise<CurrencyThreshold> {
    const threshold = this.thresholds[hours] ?? {
      lastUpdated: 0,
      price: 0
    }
    threshold.lastUpdated = timestamp
    threshold.price = price
    this.thresholds[hours] = threshold
    return (await this.save()) as CurrencyThreshold
  }
}
