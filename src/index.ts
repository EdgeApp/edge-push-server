import * as schedule from 'node-schedule'

import { CurrencyThreshold, Device, User } from './models'
import { getPrice } from './prices'
import { NotificationManager } from './NotificationManager'
const CONFIG = require('../serverConfig.json')

const HOURS_PERCENT_MAP = {
  1: 3,
  24: 10
}

interface NotificationPriceMap {
  [currencyCode: string]: {
    [hours: string]: NotificationPriceChange
  }
}

interface NotificationPriceChange {
  price: number
  priceChange: number
  timestamp: number
  deviceTokens: Array<string>
}

schedule.scheduleJob(`*/${CONFIG.priceCheckInMinutes} * * * *`, run)

let isRunning = false

async function run() {
  if (isRunning) return
  isRunning = true

  await checkPriceChanges()

  isRunning = false
}
run()

async function checkPriceChanges() {
  const users = await User.where({selector: {
    notifications: { enabled: true }
  }}) as Array<User>

  const priceMap: NotificationPriceMap = {}

  for (const user of users) {
    for (const currencyCode in user.notifications.currencyCodes) {
      let map = priceMap[currencyCode]
      if (!map) {
        try {
          let currencyThreshold = await CurrencyThreshold.fetch(currencyCode) as CurrencyThreshold
          if (!currencyThreshold) {
            currencyThreshold = await CurrencyThreshold.fromCode(currencyCode) as CurrencyThreshold
          }

          map = priceMap[currencyCode] = await fetchThresholdPrices(currencyThreshold)
        } catch {
          continue
        }
      }

      const devices = await user.fetchDevices()
      const deviceTokens: string[] = []
      for (const device of devices) {
        const { tokenId } = device
        if (typeof tokenId === 'string')
          deviceTokens.push(tokenId)
      }

      const userHourSettings = user.notifications.currencyCodes[currencyCode]
      for (const [ hours, enabled ] of Object.entries(userHourSettings)) {
        if (enabled && map[hours]) {
          map[hours].deviceTokens.push(...deviceTokens)
          const set = new Set(map[hours].deviceTokens)
          map[hours].deviceTokens = Array.from(set)
        }
      }
    }
  }

  console.log('price map: ', JSON.stringify(priceMap, null, 2))

  await sendNotifications(priceMap)
}

async function sendNotifications(priceMap: NotificationPriceMap) {
  const manager = await NotificationManager.init(CONFIG.apiKey)

  for (const currencyCode in priceMap) {
    for (const hours in priceMap[currencyCode]) {
      const priceChange = priceMap[currencyCode][hours]
      const direction = priceChange.priceChange > 0 ? 'up': 'down'
      const symbol = priceChange.priceChange > 0 ? '+' : ''
      const time = Number(hours) === 1 ? '1 hour' : `${hours} hours`

      const title = 'Price Alert'
      const body = `${currencyCode} is ${direction} ${symbol}${priceChange.priceChange}% to $${priceChange.price} in the last ${time}.`
      const data = {}

      const pages = Math.ceil(priceChange.deviceTokens.length / 500)
      for (let i = 0; i < pages; i++) {
        const start = i * 500
        const end = start + 500
        const tokens = priceChange.deviceTokens.slice(start, end)
        const response = await manager.sendNotifications(title, body, tokens, data)
          .catch((err) => console.log(JSON.stringify(err, null, 2)))
        console.log('FCM notification response', JSON.stringify(response, null, 2))
      }
    }
  }
}

interface IThresholdPricesResponse {
  [hours: string]: {
    price: number
    priceChange: number
    timestamp: number
    deviceTokens: Array<string>
  }
}

function sleep(ms = 5000) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchThresholdPrices(currencyThreshold: CurrencyThreshold): Promise<IThresholdPricesResponse> {
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
    const today = Date.parse(new Date().toISOString())
    const percent = HOURS_PERCENT_MAP[hours]

    const logData = {
      currencyCode,
      now: new Date().toISOString(),
      before: new Date(before).toISOString(),
      hourChange: hours,
      price,
      priceBefore,
      priceChange
    }
    console.log(logData)

    if (priceChange <= -percent || priceChange >= percent) {
      currencyThreshold.thresholds[hours] = { lastUpdated: today, price }
      await currencyThreshold.save()

      // Set decimal place to 2 significant digits
      let numSplit = price.toString().split('.')
      let sigIndex = numSplit[1].search(/[1-9]/)
      numSplit[1] = numSplit[1].substring(0, sigIndex + 2)
      const displayPrice = Number(numSplit.join('.'))

      response[hours] = {
        price: displayPrice,
        priceChange,
        timestamp: today,
        deviceTokens: []
      }
    }
  }

  return response
}
