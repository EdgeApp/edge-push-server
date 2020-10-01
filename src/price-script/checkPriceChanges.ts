import { CurrencyThreshold, Device, User } from '../models'
import { fetchThresholdPrices } from './fetchThresholdPrices'
import { NotificationManager } from '../NotificationManager'

// Firebase Messaging API limits batch messages to 500
const NOTIFICATION_LIMIT = 500
const MANGO_FIND_LIMIT = 200

interface NotificationPriceMap {
  [currencyCode: string]: NotificationPriceHoursChange
}

interface NotificationPriceHoursChange {
  [hours: string]: NotificationPriceChange
}

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
  async function sendNotification(thresholdPrice: NotificationPriceChange, deviceTokens: string[]) {
    const { currencyCode, hourChange, priceChange, priceNow } = thresholdPrice

    const direction = priceChange > 0 ? 'up' : 'down'
    const symbol = priceChange > 0 ? '+' : ''
    const time = Number(hourChange) === 1 ? '1 hour' : `${hourChange} hours`

    const title = 'Price Alert'
    const displayPrice = formatDisplayPrice(priceNow)
    const body = `${currencyCode} is ${direction} ${symbol}${priceChange}% to $${displayPrice} in the last ${time}.`
    const data = {}

    await manager.send(title, body, deviceTokens, data)
      .catch(() => {})
  }

  // Fetch list of threshold items and their prices
  const thresholdList = await CurrencyThreshold.table.list()
  for (const { id: currencyCode } of thresholdList.rows) {
    const threshold = await CurrencyThreshold.fetch(currencyCode)

    const thresholdPrices = await fetchThresholdPrices(threshold)
    for (const hours in thresholdPrices) {
      const thresholdPrice = thresholdPrices[hours]

      const { rows: usersDevices } = await User.devicesByCurrencyHours(currencyCode, hours)
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
      const notificationPromises: Promise<void>[] = []
      while(!done) {
        const next = await tokenGenerator.next()
        done = next.done

        if (next.value) {
          // Send notification to user about price change
          const promise = sendNotification(thresholdPrice, next.value)
          notificationPromises.push(promise)
        }
      }
      await Promise.all(notificationPromises)
    }
  }
}

async function* deviceTokenGenerator(deviceIds: string[]): AsyncGenerator<string[], string[]> {
  let tokens: string[] = []
  let bookmark: string
  let done = false
  while (!done) {
    const response = await Device.table.find({
      bookmark,
      selector: {
        _id: {
          "$in": deviceIds
        },
        tokenId: {
          "$exists": true,
          "$ne": null
        }
      },
      fields: [ 'tokenId' ],
      limit: MANGO_FIND_LIMIT
    })
    bookmark = response.bookmark

    for (const { tokenId } of response.docs) {
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
  let numSplit = priceNow.toString().split('.')
  let sigIndex = numSplit[1].search(/[1-9]/)
  numSplit[1] = numSplit[1].substring(0, sigIndex + 2)
  return Number(numSplit.join('.'))
}
