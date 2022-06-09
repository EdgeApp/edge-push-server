import io from '@pm2/io'
import { MetricType } from '@pm2/io/build/main/services/metrics'

import { CurrencyThreshold, Device, User } from '../models'
import { NotificationManager } from '../NotificationManager'
import { fetchThresholdPrice } from './fetchThresholdPrices'

// Firebase Messaging API limits batch messages to 500
const NOTIFICATION_LIMIT = 500
const MANGO_FIND_LIMIT = 200
const THRESHOLD_FETCH_LIMIT = 200

export interface NotificationPriceChange {
  currencyCode: string
  now: string
  before: string
  hourChange: string
  priceNow: number
  priceBefore: number
  priceChange: number
}

export async function checkPriceChanges(manager: NotificationManager) {
  // Sends a notification to devices about a price change
  async function sendNotification(
    thresholdPrice: NotificationPriceChange,
    deviceTokens: string[]
  ) {
    const { currencyCode, hourChange, priceChange, priceNow } = thresholdPrice

    const direction = priceChange > 0 ? 'up' : 'down'
    const symbol = priceChange > 0 ? '+' : ''
    const time = Number(hourChange) === 1 ? '1 hour' : `${hourChange} hours`

    const title = 'Price Alert'
    const displayPrice = formatDisplayPrice(priceNow)
    const body = `${currencyCode} is ${direction} ${symbol}${priceChange}% to $${displayPrice} in the last ${time}.`
    const data = {}

    return manager.send(title, body, deviceTokens, data)
  }

  // Fetch list of threshold items and their prices
  const thresholds = await CurrencyThreshold.where({
    selector: {
      $or: [{ disabled: { $exists: false } }, { disabled: false }]
    },
    limit: THRESHOLD_FETCH_LIMIT
  })
  // Fetch default values to use if otherwise not defined
  const defaultThresholds = await CurrencyThreshold.defaultThresholds()
  const defaultAnomaly = await CurrencyThreshold.defaultAnomaly()
  for (const threshold of thresholds) {
    const currencyCode = threshold._id
    const anomalyPercent = threshold.anomaly ?? defaultAnomaly
    for (const hours in defaultThresholds) {
      const priceData = await fetchThresholdPrice(
        threshold,
        hours,
        defaultThresholds[hours],
        anomalyPercent
      )
      if (!priceData) continue

      const { rows: usersDevices } = await User.devicesByCurrencyHours(
        currencyCode,
        hours
      )
      // Skip if no users registered to currency
      if (usersDevices.length === 0) continue

      const deviceIds: string[] = []
      for (const { value: userDevices } of usersDevices) {
        for (const deviceId in userDevices) {
          deviceIds.push(deviceId)
        }
      }
      const tokenGenerator = deviceTokenGenerator(deviceIds)
      let done = false
      let successCount = 0
      let failureCount = 0
      while (!done) {
        const next = await tokenGenerator.next()
        done = !!next.done

        if (next.value) {
          // Send notification to user about price change
          try {
            const response = await sendNotification(priceData, next.value)
            successCount += response.successCount
            failureCount += response.failureCount
          } catch (err: any) {
            io.notifyError(err, {
              custom: {
                message:
                  'Failed to batch send notifications for currency hours threshold change',
                currencyCode,
                hours
              }
            })
          }
        }
      }

      const idPostfix = `${currencyCode}:${hours}`
      const namePostfix = `Notifications For ${currencyCode} - ${hours} Hour`
      io.metrics([
        {
          type: MetricType.metric,
          id: `notifications:success:${idPostfix}`,
          name: `Successful ${namePostfix}`,
          value: () => successCount
        },
        {
          type: MetricType.metric,
          id: `notifications:failure:${idPostfix}`,
          name: `Failed ${namePostfix}`,
          value: () => failureCount
        }
      ])
    }
  }
}

async function* deviceTokenGenerator(
  deviceIds: string[]
): AsyncGenerator<string[], string[]> {
  const tokenSet: Set<string> = new Set()
  let tokens: string[] = []
  let bookmark: string | undefined
  let done = false
  while (!done) {
    const response = await Device.table.find({
      bookmark,
      selector: {
        _id: {
          $in: deviceIds
        },
        tokenId: {
          $exists: true,
          $ne: null
        }
      },
      fields: ['tokenId'],
      limit: MANGO_FIND_LIMIT
    })
    bookmark = response.bookmark

    for (const { tokenId } of response.docs) {
      if (!tokenId || tokenSet.has(tokenId)) continue

      tokenSet.add(tokenId)
      tokens.push(tokenId)

      if (tokens.length === NOTIFICATION_LIMIT) {
        yield tokens
        tokens = []
      }
    }

    if (response.docs.length < MANGO_FIND_LIMIT) {
      done = true
    }
  }

  return tokens
}

// Set decimal place to 2 significant digits
function formatDisplayPrice(priceNow: number) {
  const numSplit = priceNow.toString().split('.')
  const sigIndex = numSplit[1].search(/[1-9]/)
  numSplit[1] = numSplit[1].substring(0, sigIndex + 2)
  return Number(numSplit.join('.'))
}
