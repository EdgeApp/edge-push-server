import { asArray, asMaybe, asNumber, asObject, asString } from 'cleaners'
import {
  asReplicatorSetupDocument,
  DatabaseSetup,
  setupDatabase,
  SetupDatabaseOptions,
  syncedDocument
} from 'edge-server-tools'
import { ServerScope } from 'nano'

import { serverConfig } from './serverConfig'

// ---------------------------------------------------------------------------
// Synced documents
// ---------------------------------------------------------------------------

/**
 * Live-updating server options stored in the `push-settings` database.
 */
const asSettings = asObject({
  apiKeys: asMaybe(
    asArray(
      asObject({
        name: asString,
        apiKey: asString
      })
    ),
    []
  ),
  priceCheckInMinutes: asMaybe(asNumber, 5)
})

export const syncedReplicators = syncedDocument(
  'replicators',
  asReplicatorSetupDocument
)

export const syncedSettings = syncedDocument('settings', asSettings.withRest)

// ---------------------------------------------------------------------------
// Databases
// ---------------------------------------------------------------------------

export const settingsSetup: DatabaseSetup = {
  name: 'push-settings',
  syncedDocuments: [syncedReplicators, syncedSettings]
}

const apiKeysSetup: DatabaseSetup = { name: 'db_api_keys' }

const thresholdsSetup: DatabaseSetup = { name: 'db_currency_thresholds' }

const devicesSetup: DatabaseSetup = { name: 'db_devices' }

const usersSetup: DatabaseSetup = {
  name: 'db_user_settings'
  // documents: {
  //   '_design/filter': makeJsDesign('by-currency', ?),
  //   '_design/map': makeJsDesign('currency-codes', ?)
  // }
}

const defaultsSetup: DatabaseSetup = {
  name: 'defaults'
  // syncedDocuments: ['thresholds']
}

// ---------------------------------------------------------------------------
// Setup routine
// ---------------------------------------------------------------------------

export async function setupDatabases(
  connection: ServerScope,
  disableWatching: boolean = false
): Promise<void> {
  const { currentCluster } = serverConfig
  const options: SetupDatabaseOptions = {
    currentCluster,
    replicatorSetup: syncedReplicators,
    disableWatching
  }
  const uri = connection.config.url

  await setupDatabase(uri, settingsSetup, options)
  await Promise.all([
    setupDatabase(uri, apiKeysSetup, options),
    setupDatabase(uri, thresholdsSetup, options),
    setupDatabase(uri, devicesSetup, options),
    setupDatabase(uri, usersSetup, options),
    setupDatabase(uri, defaultsSetup, options)
  ])
}
