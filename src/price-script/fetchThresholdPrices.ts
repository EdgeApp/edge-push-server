import { CurrencyThreshold } from '../models'
import { getPrice } from './prices'
import { NotificationPriceChange } from './checkPriceChanges'

const HOURS_PERCENT_MAP = {
  1: 3,
  24: 10
}
const SLEEP_TIMEOUT = 1000 // in milliseconds

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

    const percent = HOURS_PERCENT_MAP[hours]
    if (priceChange <= -percent || priceChange >= percent) {
      currencyThreshold.thresholds[hours] = { lastUpdated: Date.parse(now), price: priceNow }
      await currencyThreshold.save()
        .catch((err) => {
          console.error(`Could not update ${currencyCode} threshold data.`)
          console.error(err)
        })

      response[hours] = priceData
    }
  }

  return response
}
