import io from '@pm2/io'
import { makePeriodicTask } from 'edge-server-tools'
import nano from 'nano'

import { getApiKeyByKey } from '../db/couchApiKeys'
import { syncedSettings } from '../db/couchSettings'
import { setupDatabases } from '../db/couchSetup'
import { serverConfig } from '../serverConfig'
import { makePushSender } from '../util/pushSender'
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

  if (syncedSettings.doc.apiKeys.length === 0) {
    throw new Error('No partner apiKeys')
  }

  // Read the API keys from settings:
  const senders = await Promise.all(
    syncedSettings.doc.apiKeys.map(async partner => {
      const apiKey = await getApiKeyByKey(connection, partner.apiKey)
      if (apiKey == null) {
        throw new Error(`Cannot find API key ${partner.apiKey}`)
      }
      return await makePushSender(apiKey)
    })
  )

  // Check the prices every few minutes:
  const task = makePeriodicTask(
    async () => {
      runCounter.inc()

      for (const sender of senders) {
        await checkPriceChanges(connection, sender)
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
