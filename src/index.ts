import nano from 'nano'
import { makeExpressRoute } from 'serverlet/express'

import { pushNotificationRouterV2 } from './api/router'
import { setupDatabases } from './couchSetup'
import { createServer } from './server'
import { serverConfig } from './serverConfig'

async function main(): Promise<void> {
  // Set up databases:
  const connection = nano(serverConfig.couchUri)
  await setupDatabases(connection)

  // Create server
  const server = createServer(
    makeExpressRoute(pushNotificationRouterV2),
    serverConfig
  )

  // Start Server
  server.listen(server.get('httpPort'), server.get('httpHost'), () => {
    console.log(
      `Express server listening on port ${JSON.stringify(
        server.get('httpPort')
      )}`
    )
  })
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
