import * as io from '@pm2/io'

import { CurrencyThreshold } from '../models'
import { getPrice } from './prices'
import { NotificationPriceChange } from './checkPriceChanges'
import Counter from '@pm2/io/build/main/utils/metrics/counter'

const CONFIG = require('../../serverConfig.json')

const HOURS_PERCENT_MAP = {
  1: 3,
  24: 10
}
const SLEEP_TIMEOUT = 1000 // in milliseconds

const processMetrics: { [id: string]: Counter | undefined } = {}

interface IThresholdPricesResponse {
  [hours: string]: NotificationPriceChange
}

function sleep(ms = SLEEP_TIMEOUT) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchThresholdPrices(currencyThreshold: CurrencyThreshold): Promise<IThresholdPricesResponse> {
  const response: IThresholdPricesResponse = {}

  const currencyCode = currencyThreshold._id

  let priceNow: number
  try {
    await sleep()
    priceNow = await getPrice(currencyCode, 'USD')
  } catch {
    return response
  }

  for (const hours in currencyThreshold.thresholds) {
    const hoursAgo = Date.now() - (Number(hours) * 60 * 60 * 1000)
    let threshold = currencyThreshold.thresholds[hours]
    const before = threshold.lastUpdated === 0 || hoursAgo > threshold.lastUpdated
      ? hoursAgo
      : threshold.lastUpdated

    let priceBefore
    try {
      priceBefore = await getPrice(currencyCode, 'USD', before)
    } catch {
      continue
    }

    const priceChange = parseFloat((100 * (priceNow - priceBefore) / priceBefore).toFixed(2))
    const now = new Date().toISOString()
    const priceData: NotificationPriceChange = {
      currencyCode,
      now,
      before: new Date(before).toISOString(),
      hourChange: hours,
      priceNow,
      priceBefore,
      priceChange
    }
    console.log(priceData)

    if (Math.abs(priceChange) >= CONFIG.significantThresholdChange) {
      io.notifyError(new Error('Rates Server Significant Price Change'), {
        custom: priceData
      })
    }

    const percent = HOURS_PERCENT_MAP[hours]
    if (Math.abs(priceChange) >= percent) {

      await currencyThreshold.update(hours, Date.parse(now), priceNow)
        .catch((err) => {
          console.error(`Could not update ${currencyCode} threshold data.`)
          console.error(err)
        })

      const counterId = `threshold:crossed:${currencyCode}:${hours}`
      let counter = processMetrics[counterId]
      if (!counter) {
        counter = processMetrics[counterId] = io.counter({
          id: counterId,
          name: `Threshold Crossed for ${currencyCode} - ${hours} Hour`
        })
      }
      counter.inc()

      response[hours] = priceData
    }
  }

  return response
}
