import {
  DatabaseSetup,
  setupDatabase,
  SetupDatabaseOptions
} from 'edge-server-tools'
import { ServerScope } from 'nano'

import { serverConfig } from '../serverConfig'
import { settingsSetup, syncedReplicators } from './couchSettings'

// ---------------------------------------------------------------------------
// Databases
// ---------------------------------------------------------------------------

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

  await setupDatabase(connection, settingsSetup, options)
  await Promise.all([
    setupDatabase(connection, apiKeysSetup, options),
    setupDatabase(connection, thresholdsSetup, options),
    setupDatabase(connection, devicesSetup, options),
    setupDatabase(connection, usersSetup, options),
    setupDatabase(connection, defaultsSetup, options)
  ])
}
