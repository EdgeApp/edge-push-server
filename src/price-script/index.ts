import * as schedule from 'node-schedule'
import * as io from '@pm2/io'

import { NotificationManager } from '../NotificationManager'
import { checkPriceChanges } from './checkPriceChanges'

const CONFIG = require('../../serverConfig.json')

// Schedule job to run
schedule.scheduleJob(`*/${CONFIG.priceCheckInMinutes} * * * *`, run)

let isRunning = false
let managers: NotificationManager[] = []

const runCounter = io.counter({
  id: 'price:script:counter',
  name: 'Price Script Runner Count'
})

async function start() {
  managers = await Promise.all(CONFIG.apiKeys.map(partner => 
    NotificationManager.init(partner.apiKey)
  ))

  run()
}
start()

async function run() {
  if (isRunning) return
  isRunning = true

  runCounter.inc()

  try {
    if (managers.length === 0) throw new Error('No partner apiKeys')
    for (const manager of managers) {
      await checkPriceChanges(manager)
    }
  } catch (err) {
    io.notifyError(err)
    throw err
  }

  isRunning = false
}

