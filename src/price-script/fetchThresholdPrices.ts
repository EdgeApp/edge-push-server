import io from '@pm2/io'

import { CurrencyThreshold } from '../models'
import { NotificationPriceChange } from './checkPriceChanges'
import { getPrice } from './prices'

const SLEEP_TIMEOUT = 1000 // in milliseconds

type Counter = ReturnType<typeof io.counter>
const processMetrics: { [id: string]: Counter | undefined } = {}

async function sleep(ms = SLEEP_TIMEOUT) {
  return await new Promise(resolve => setTimeout(resolve, ms))
}
export async function fetchThresholdPrice(
  currencyThreshold: CurrencyThreshold,
  hours: string | number,
  defaultPercent: number,
  anomalyPercent: number
): Promise<NotificationPriceChange | undefined> {
  if (currencyThreshold.disabled) return

  const currencyCode = currencyThreshold._id
  let priceNow: number
  try {
    await sleep()
    priceNow = await getPrice(currencyCode, 'USD')
  } catch {
    return
  }

  const hoursAgo = Date.now() - Number(hours) * 60 * 60 * 1000
  let threshold = currencyThreshold.thresholds[hours]
  if (!threshold) {
    threshold = {
      custom: undefined,
      lastUpdated: 0,
      price: 0
    }
  }

  const before =
    threshold.lastUpdated === 0 || hoursAgo > threshold.lastUpdated
      ? hoursAgo
      : threshold.lastUpdated

  let priceBefore
  try {
    priceBefore = await getPrice(currencyCode, 'USD', before)
  } catch {
    return
  }

  const priceChange = parseFloat(
    ((100 * (priceNow - priceBefore)) / priceBefore).toFixed(2)
  )
  const now = new Date().toISOString()
  const priceData: NotificationPriceChange = {
    currencyCode,
    now,
    before: new Date(before).toISOString(),
    hourChange: hours.toString(),
    priceNow,
    priceBefore,
    priceChange
  }
  console.log(priceData)

  if (Math.abs(priceChange) >= anomalyPercent) {
    io.notifyError(new Error('Rates Server Anomaly Price Change Detected'), {
      custom: priceData
    })

    await currencyThreshold.save('disabled', true)

    return
  }

  const percent = threshold.custom ?? defaultPercent
  if (Math.abs(priceChange) >= percent) {
    await currencyThreshold
      .update(hours, Date.parse(now), priceNow)
      .catch(err => {
        console.error(`Could not update ${currencyCode} threshold data.`)
        console.error(err)
      })

    const counterId = `threshold:crossed:${currencyCode}:${hours}`
    let counter = processMetrics[counterId]
    if (counter == null) {
      counter = processMetrics[counterId] = io.counter({
        id: counterId,
        name: `Threshold Crossed for ${currencyCode} - ${hours} Hour`
      })
    }
    counter.inc()

    return priceData
  }
}
