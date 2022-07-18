import io from '@pm2/io'
import { makePeriodicTask } from 'edge-server-tools'
import nano from 'nano'

import { setupDatabases, syncedSettings } from '../couchSetup'
import { NotificationManager } from '../NotificationManager'
import { serverConfig } from '../serverConfig'
import { checkPriceChanges } from './checkPriceChanges'

const runCounter = io.counter({
  id: 'price:script:counter',
  name: 'Price Script Runner Count'
})

async function main(): Promise<void> {
  const { couchUri } = serverConfig

  // Set up databases:
  const connection = nano(couchUri)
  await setupDatabases(connection)

  // Read the API keys from settings:
  const managers = await Promise.all(
    syncedSettings.doc.apiKeys.map(
      async partner => await NotificationManager.init(partner.apiKey)
    )
  )

  // Check the prices every few minutes:
  const task = makePeriodicTask(
    async () => {
      runCounter.inc()

      if (managers.length === 0) throw new Error('No partner apiKeys')
      for (const manager of managers) {
        await checkPriceChanges(manager)
      }
    },
    60 * 1000 * syncedSettings.doc.priceCheckInMinutes,
    {
      onError(error) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        io.notifyError(error as any)
      }
    }
  )
  task.start()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
