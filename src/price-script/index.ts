import * as schedule from 'node-schedule'

import { NotificationManager } from '../NotificationManager'
import { checkPriceChanges } from './checkPriceChanges'

const CONFIG = require('../../serverConfig.json')

// Schedule job to run
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

