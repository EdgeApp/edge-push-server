import { CurrencyThreshold } from '../models'
import { getPrice } from './prices'
import { NotificationPriceChange } from './checkPriceChanges'

const HOURS_PERCENT_MAP = {
  1: 3,
  24: 10
}

interface IThresholdPricesResponse {
  [hours: string]: NotificationPriceChange
}

function sleep(ms = 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchThresholdPrices(currencyThreshold: CurrencyThreshold): Promise<IThresholdPricesResponse> {
  const response: IThresholdPricesResponse = {}

  const currencyCode = currencyThreshold._id

  let price: number
  try {
    await sleep()
    price = await getPrice(currencyCode, 'USD')
  } catch {
    return response
  }

  for (const hours in currencyThreshold.thresholds) {
    const hoursAgo = Date.now() - (Number(hours) * 60 * 60 * 1000)
    let threshold = currencyThreshold.thresholds[hours]
    let before
    if (threshold.lastUpdated === 0)
      before = hoursAgo
    else if (hoursAgo > threshold.lastUpdated)
      before = hoursAgo
    else
      before = threshold.lastUpdated

    let priceBefore
    try {
      priceBefore = await getPrice(currencyCode, 'USD', before)
    } catch {
      continue
    }

    const priceChange = parseFloat((100 * (price - priceBefore) / priceBefore).toFixed(2))
    const now = new Date().toISOString()
    const priceData: NotificationPriceChange = {
      currencyCode,
      now,
      before: new Date(before).toISOString(),
      hourChange: hours,
      price,
      priceBefore,
      priceChange
    }
    console.log(priceData)

    const percent = HOURS_PERCENT_MAP[hours]
    if (priceChange <= -percent || priceChange >= percent) {
      currencyThreshold.thresholds[hours] = { lastUpdated: Date.parse(now), price }
      await currencyThreshold.save()
        .catch((err) => {
          console.error(`Could not update ${currencyCode} threshold data.`)
          console.error(err)
        })

      // Set decimal place to 2 significant digits
      let numSplit = price.toString().split('.')
      let sigIndex = numSplit[1].search(/[1-9]/)
      numSplit[1] = numSplit[1].substring(0, sigIndex + 2)
      const displayPrice = Number(numSplit.join('.'))
      priceData.price = displayPrice

      response[hours] = priceData
    }
  }

  return response
}
