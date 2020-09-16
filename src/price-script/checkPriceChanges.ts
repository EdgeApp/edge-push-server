import { CurrencyThreshold, Device, INotificationsEnabledViewResponse, User } from '../models'
import { DocumentResponseRowMeta } from 'nano'
import { fetchThresholdPrices } from './fetchThresholdPrices'

interface NotificationPriceMap {
  [currencyCode: string]: {
    [hours: string]: NotificationPriceChange
  }
}

export interface NotificationPriceChange {
  currencyCode: string
  hours: string
  price: number
  priceChange: number
  timestamp: number
  deviceTokens: Array<string>
}

export async function checkPriceChanges() {
  const priceMap: NotificationPriceMap = {}
  const thresholdMap: { [currencyCode: string]: CurrencyThreshold } = {}

  // Only fetch currency prices once per iteration
  async function fetchPriceChanges(currencyCode: string) {
    if (currencyCode in priceMap) return

    // Check if theres a threshold object created
    // Create and save in database if not
    if (!thresholdMap[currencyCode]) {
      thresholdMap[currencyCode] = await CurrencyThreshold.fromCode(currencyCode) as CurrencyThreshold
    }

    // Fetch price changes for all currency hours stored in threshold model
    priceMap[currencyCode] = await fetchThresholdPrices(thresholdMap[currencyCode])
  }

  // Fetches Threshold models and their currency price changes
  async function fetchAndUpdateThresholdPrices({ id: currencyCode }: DocumentResponseRowMeta) {
    thresholdMap[currencyCode] = await CurrencyThreshold.fetch(currencyCode)
    await fetchPriceChanges(currencyCode)
  }

  async function fetchDeviceTokens(deviceIds: string[]) {
    const devices = await Device.fetchAll(deviceIds)
    return devices.map((device) => device.tokenId)
  }

  // Sends notifications to a user based on the currency codes and hour changes they are following if
  // the price change crossed the threshold change
  async function sendUserNotifications({ value: userData }: { value: INotificationsEnabledViewResponse }) {
    let deviceTokens: string[]

    const { currencyCodes } = userData
    for (const currencyCode in currencyCodes) {
      await fetchPriceChanges(currencyCode)

      for (const hours in currencyCodes[currencyCode]) {
        // Check if we have a price for the hour change AND user has notifications enabled for that hour change
        // if (hours in priceMap[currencyCode] && currencyCodes[currencyCode][hours]) {
          // Fetch user's device tokens if we don't have they already
          if (!deviceTokens) deviceTokens = await fetchDeviceTokens(Object.keys(userData.devices))

          // Send notification to user about price change
          // await sendNotification(currencyCode, hours, deviceTokens)
        // }
      }
    }
  }

  // Sends a notification to devices about a price change
  async function sendNotification(currencyCode: string, hours: string, deviceTokens: string[]) {
    const { priceChange, price } = priceMap[currencyCode][hours]

    const direction = priceChange > 0 ? 'up' : 'down'
    const symbol = priceChange > 0 ? '+' : ''
    const time = Number(hours) === 1 ? '1 hour' : `${hours} hours`

    const title = 'Price Alert'
    const body = `${currencyCode} is ${direction} ${symbol}${priceChange}% to $${price} in the last ${time}.`
    const data = {}

    // await manager.sendNotifications(title, body, deviceTokens, data)
    //   .catch(() => {})
  }

  // Fetch list of threshold items and their prices
  const thresholdList = await CurrencyThreshold.table.list()
  for (const threshold of thresholdList.rows) {
    await fetchAndUpdateThresholdPrices(threshold)
  }

  // Fetch data for users that have notifications enabled using CouchDB Design Document View
  const userView = await User.notificationsEnabled()
  for (const user of userView.rows) {
    await sendUserNotifications(user)
  }

  console.log('price map: ', JSON.stringify(priceMap, null, 2))
}
