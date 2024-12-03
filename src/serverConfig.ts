import { makeConfig } from 'cleaner-config'
import { asNumber, asObject, asOptional, asString } from 'cleaners'
import nano from 'nano'

import { DbConnections } from './db/dbConnections'

/**
 * Configures the server process as a whole,
 * such as where to listen and how to talk to the database.
 */
const asServerConfig = asObject({
  // HTTP server options:
  listenHost: asOptional(asString, '127.0.0.1'),
  listenPort: asOptional(asNumber, 8008),

  // Databases:
  couchUri: asOptional(asString, 'http://username:password@localhost:5984'),
  currentCluster: asOptional(asString)
})

export const serverConfig = makeConfig(
  asServerConfig,
  './pushServerConfig.json'
)

/**
 * Connects to the databases, using the server config JSON.
 */
export function makeConnections(): DbConnections {
  return {
    couch: nano(serverConfig.couchUri)
  }
}
