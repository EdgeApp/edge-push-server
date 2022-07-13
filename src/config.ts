import { makeConfig } from 'cleaner-config'
import { asNumber, asObject, asOptional, asString } from 'cleaners'

const { COUCH_HOSTNAME = 'localhost', COUCH_PASSWORD = 'password' } =
  process.env

export const asServerConfig = asObject({
  couchUri: asOptional(
    asString,
    `http://username:${COUCH_PASSWORD}@${COUCH_HOSTNAME}:5984`
  ),
  // for running the local server
  httpPort: asOptional(asNumber, 8008),
  httpHost: asOptional(asString, '127.0.0.1')
})

export const config = makeConfig(asServerConfig, 'pushServerConfig.json')
