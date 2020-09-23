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
  price: number
  priceBefore: number
  priceChange: number
}

export async function checkPriceChanges(manager: NotificationManager) {
  // Sends a notification to devices about a price change
  async function sendNotification(thresholdPrice: NotificationPriceChange, deviceTokens: string[]) {
    const { currencyCode, hourChange, priceChange, price } = thresholdPrice

    const direction = priceChange > 0 ? 'up' : 'down'
    const symbol = priceChange > 0 ? '+' : ''
    const time = Number(hourChange) === 1 ? '1 hour' : `${hourChange} hours`

    const title = 'Price Alert'
    const body = `${currencyCode} is ${direction} ${symbol}${priceChange}% to $${price} in the last ${time}.`
    const data = {}

    console.log('=================')
    console.log(`Sending ${deviceTokens.length} notifications for ${currencyCode}.`)
    console.log('=================')

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
      while(true) {
        const { value: deviceTokens, done } = await tokenGenerator.next()

        if (deviceTokens) {
          // Send notification to user about price change
          await sendNotification(thresholdPrice, deviceTokens)
        }

        if (done) break
      }
    }
  }
}

async function* deviceTokenGenerator(deviceIds: string[]): AsyncGenerator<string[], string[]> {
  let tokens: string[] = []
  let bookmark: string
  while (true) {
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
      break
    }
  }

  return tokens
}
