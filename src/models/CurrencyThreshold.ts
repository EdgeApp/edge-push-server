import { asBoolean, asMap, asNumber, asObject, asOptional } from 'cleaners'
import * as Nano from 'nano'

import { Base } from '.'
import { Defaults } from './Defaults'
const CONFIG = require('../../serverConfig.json')

const nanoDb = Nano(CONFIG.dbFullpath)
const dbCurrencyThreshold = nanoDb.db.use('db_currency_thresholds')

interface IThreshold {
  custom?: number
  lastUpdated: number
  price: number
}

const asThreshold = asObject<IThreshold>({
  custom: asOptional(asNumber),
  lastUpdated: asNumber,
  price: asNumber
})
const IThresholds = asMap<IThreshold | undefined>(asThreshold)

interface ICurrencyThreshold {
  disabled?: boolean
  anomaly?: number
  thresholds: ReturnType<typeof IThresholds>
}
const asCurrencyThreshold = asObject<ICurrencyThreshold>({
  disabled: asOptional(asBoolean),
  anomaly: asOptional(asNumber),
  thresholds: IThresholds
})

const defaultData: IThreshold = {
  lastUpdated: 0,
  price: 0
}

export class CurrencyThreshold extends Base implements ICurrencyThreshold {
  public static table = dbCurrencyThreshold
  public static asType = asCurrencyThreshold

  public disabled?: boolean
  public anomaly?: number
  public thresholds!: ReturnType<typeof IThresholds>

  public static async defaultAnomaly(): Promise<number> {
    const threshold = await Defaults.fetch('thresholds')
    return threshold.get('anomaly')
  }

  public static async defaultThresholds(): Promise<{
    [hours: string]: number
  }> {
    const threshold = await Defaults.fetch('thresholds')
    return threshold.get('hours')
  }

  public static async fromCode(
    currencyCode: string
  ): Promise<CurrencyThreshold> {
    const threshold = new CurrencyThreshold(undefined, currencyCode)
    return threshold.save()
  }

  public async update(
    hours: string | number,
    timestamp: number,
    price: number
  ): Promise<CurrencyThreshold> {
    const threshold: IThreshold = this.thresholds[hours] ?? {
      lastUpdated: 0,
      price: 0
    }
    threshold.lastUpdated = timestamp
    threshold.price = price
    this.thresholds[hours] = threshold
    return (await this.save()) as CurrencyThreshold
  }
}
