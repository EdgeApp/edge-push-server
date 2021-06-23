import * as schedule from 'node-schedule'
import * as io from '@pm2/io'

import { NotificationManager } from '../NotificationManager'
import { checkPriceChanges } from './checkPriceChanges'

const CONFIG = require('../../config.json')

// Schedule job to run
schedule.scheduleJob(`*/${CONFIG.priceCheckInMinutes} * * * *`, run)

let isRunning = false
let manager: NotificationManager

const runCounter = io.counter({
  id: 'price:script:counter',
  name: 'Price Script Runner Count'
})

async function start() {
  manager = await NotificationManager.init(CONFIG.apiKey)

  run()
}
start()

async function run() {
  if (isRunning) return
  isRunning = true

  runCounter.inc()

  try {
    await checkPriceChanges(manager)
  } catch (err) {
    io.notifyError(err)
    throw err
  }

  isRunning = false
}

