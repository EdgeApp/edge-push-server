import { makeConfig } from 'cleaner-config'
import { asNumber, asObject, asOptional, asString } from 'cleaners'

/**
 * Configures the server process as a whole,
 * such as where to listen and how to talk to the database.
 */
export const asServerConfig = asObject({
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
