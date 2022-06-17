import nano from 'nano'

import { setupDatabases } from '../couchSetup'
import { serverConfig } from '../serverConfig'
import { app } from './app'

async function main(): Promise<void> {
  const { couchUri, listenHost, listenPort } = serverConfig

  // Set up databases:
  const connection = nano(couchUri)
  await setupDatabases(connection)

  // Start the HTTP server:
  app.listen(listenPort, listenHost)
  console.log(`HTTP server listening on port ${listenPort}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
