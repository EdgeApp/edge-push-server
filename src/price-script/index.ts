import * as io from '@pm2/io'
import * as schedule from 'node-schedule'

import { NotificationManager } from '../NotificationManager'
import { checkPriceChanges } from './checkPriceChanges'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CONFIG = require('../../serverConfig.json')

// Schedule job to run
// eslint-disable-next-line @typescript-eslint/no-misused-promises
schedule.scheduleJob(`*/${CONFIG.priceCheckInMinutes} * * * *`, run)

let isRunning = false
let managers: NotificationManager[] = []

const runCounter = io.counter({
  id: 'price:script:counter',
  name: 'Price Script Runner Count'
})

async function start() {
  managers = await Promise.all(
    // @ts-expect-error
    CONFIG.apiKeys.map(async partner =>
      NotificationManager.init(partner.apiKey)
    )
  )

  await run()
}
start().catch(error => console.error(error))

async function run() {
  if (isRunning) return
  isRunning = true

  runCounter.inc()

  try {
    if (managers.length === 0) throw new Error('No partner apiKeys')
    for (const manager of managers) {
      await checkPriceChanges(manager)
    }
  } catch (err: any) {
    io.notifyError(err)
    throw err
  }

  isRunning = false
}
