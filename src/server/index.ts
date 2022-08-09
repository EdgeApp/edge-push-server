import express from 'express'
import nano from 'nano'
import { withCors } from 'serverlet'
import { makeExpressRoute } from 'serverlet/express'

import { setupDatabases } from '../db/couchSetup'
import { serverConfig } from '../serverConfig'
import { withLogging } from './middleware/withLogging'
import { allRoutes } from './urls'

async function main(): Promise<void> {
  const { couchUri, listenHost, listenPort } = serverConfig

  // Set up databases:
  const connection = nano(couchUri)
  await setupDatabases(connection)

  // Bind the database to the request:
  const server = withCors(
    withLogging(request => allRoutes({ ...request, connection }))
  )

  // Set up Express:
  const app = express()
  app.enable('trust proxy')
  app.use(express.json({ limit: '1mb' }))
  app.use('/', makeExpressRoute(server))

  // Start the HTTP server:
  app.listen(listenPort, listenHost)
  console.log(`HTTP server listening on port ${listenPort}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
