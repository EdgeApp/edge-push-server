import express from 'express'
import { withCors } from 'serverlet'
import { makeExpressRoute } from 'serverlet/express'

import { setupDatabases } from '../db/couchSetup'
import { makeConnections, serverConfig } from '../serverConfig'
import { logger } from '../util/logger'
import { withLogging } from './middleware/withLogging'
import { allRoutes } from './urls'

async function main(): Promise<void> {
  const { listenHost, listenPort } = serverConfig

  // Set up databases:
  const connections = await makeConnections()
  await setupDatabases(connections)

  // Bind the database to the request:
  const server = withCors(
    withLogging(request => allRoutes({ ...request, connections }))
  )

  // Set up Express:
  const app = express()
  app.enable('trust proxy')
  app.use(express.json({ limit: '1mb' }))
  app.use('/', makeExpressRoute(server))

  // Start the HTTP server:
  app.listen(listenPort, listenHost)
  logger.info(`HTTP server listening on port ${listenPort}`)
}

main().catch(error => {
  logger.error(error)
  process.exit(1)
})
