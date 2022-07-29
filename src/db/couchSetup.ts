import {
  DatabaseSetup,
  setupDatabase,
  SetupDatabaseOptions
} from 'edge-server-tools'
import { ServerScope } from 'nano'

import { serverConfig } from '../serverConfig'
import { couchApiKeysSetup } from './couchApiKeys'
import { devicesSetup } from './couchDevices'
import { settingsSetup, syncedReplicators } from './couchSettings'
import { usersSetup } from './couchUsers'

// ---------------------------------------------------------------------------
// Databases
// ---------------------------------------------------------------------------

export const apiKeysSetup: DatabaseSetup = { name: 'db_api_keys' }

export const thresholdsSetup: DatabaseSetup = { name: 'db_currency_thresholds' }

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
    setupDatabase(connection, couchApiKeysSetup, options),
    setupDatabase(connection, thresholdsSetup, options),
    setupDatabase(connection, devicesSetup, options),
    setupDatabase(connection, usersSetup, options)
  ])
}
