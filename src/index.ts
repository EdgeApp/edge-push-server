import * as schedule from 'node-schedule'

import { CurrencyThreshold, User } from './models'
import { getPrice } from './prices'
import { NotificationManager } from './NotificationManager'

const CONFIG = require('../serverConfig.json')

const HOURS_PERCENT_MAP = {
  1: 3,
  24: 10
}

const USER_BATCH_SIZE = 50

interface NotificationPriceMap {
  [currencyCode: string]: {
    [hours: string]: NotificationPriceChange
  }
}

interface NotificationPriceChange {
  currencyCode: string
  hours: string
  price: number
  priceChange: number
  timestamp: number
  deviceTokens: Array<string>
}

schedule.scheduleJob(`*/${CONFIG.priceCheckInMinutes} * * * *`, run)

let isRunning = false
let manager: NotificationManager

async function start() {
  manager = await NotificationManager.init(CONFIG.apiKey)

  run()
}

start()

async function run() {
  if (isRunning) return
  isRunning = true

  await checkPriceChanges()

  isRunning = false
}

async function checkPriceChanges() {
  const priceMap: NotificationPriceMap = {}
  const thresholdMap: { [currencyCode: string]: CurrencyThreshold } = {}

  async function fetchPrices(currencyCode: string) {
    if (!!priceMap[currencyCode]) return

    try {
      if (!thresholdMap[currencyCode]) {
        thresholdMap[currencyCode] = await CurrencyThreshold.fromCode(currencyCode) as CurrencyThreshold
      }

      priceMap[currencyCode] = await fetchThresholdPrices(thresholdMap[currencyCode])
    } catch (error) {
      // todo report error
      console.error(error)
    }
  }

  const thresholdList = await CurrencyThreshold.table.list()
  for (const { id: currencyCode } of thresholdList.rows) {
    thresholdMap[currencyCode] = await CurrencyThreshold.fetch(currencyCode)
    await fetchPrices(currencyCode)
  }

  const userList = await User.table.list()
  for (let offset = 0; offset < userList.total_rows; offset += USER_BATCH_SIZE) {
    const promises = new Array(USER_BATCH_SIZE).fill(null).map(async (_, batchIndex) => {
      const index = offset + batchIndex
      if (index >= userList.total_rows) return

      const user = await User.fetch(userList.rows[index].id)
      const { notifications } = user
      // skip user if notifications are turned off
      if (!notifications.enabled) return

      const devices = await user.fetchDevices()
      const deviceTokens = devices.map((device) => device.tokenId)

      const { currencyCodes } = notifications
      for (const currencyCode in currencyCodes) {
        await fetchPrices(currencyCode)

        for (const hours in currencyCodes[currencyCode]) {
          if (!(hours in priceMap[currencyCode])) continue

          const enabled = currencyCodes[currencyCode][hours]
          if (!enabled) continue

          await sendNotification(priceMap[currencyCode][hours], deviceTokens)
        }
      }
    })

    await Promise.all(promises)
  }

  console.log('price map: ', JSON.stringify(priceMap, null, 2))
}

async function sendNotification({
  currencyCode,
  hours,
  price,
  priceChange
}: NotificationPriceChange, deviceTokens: string[]) {
  const direction = priceChange > 0 ? 'up' : 'down'
  const symbol = priceChange > 0 ? '+' : ''
  const time = Number(hours) === 1 ? '1 hour' : `${hours} hours`

  const title = 'Price Alert'
  const body = `${currencyCode} is ${direction} ${symbol}${priceChange}% to $${price} in the last ${time}.`
  const data = {}

  await manager.sendNotifications(title, body, deviceTokens, data)
    .catch(() => {})
}

interface IThresholdPricesResponse {
  [hours: string]: NotificationPriceChange
}

function sleep(ms = 1000) {
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
        currencyCode,
        hours,
        price: displayPrice,
        priceChange,
        timestamp: today,
        deviceTokens: []
      }
    }
  }

  return response
}
