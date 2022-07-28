import {
  DatabaseSetup,
  setupDatabase,
  SetupDatabaseOptions
} from 'edge-server-tools'
import { ServerScope } from 'nano'

import { serverConfig } from '../serverConfig'
import { couchApiKeysSetup } from './couchApiKeys'
import { couchDevicesSetup } from './couchDevices'
import { couchEventsSetup } from './couchPushEvents'
import { settingsSetup, syncedReplicators } from './couchSettings'

// ---------------------------------------------------------------------------
// Databases
// ---------------------------------------------------------------------------

const thresholdsSetup: DatabaseSetup = { name: 'db_currency_thresholds' }

const devicesSetup: DatabaseSetup = { name: 'db_devices' }

const usersSetup: DatabaseSetup = {
  name: 'db_user_settings'
  // documents: {
  //   '_design/filter': makeJsDesign('by-currency', ?),
  //   '_design/map': makeJsDesign('currency-codes', ?)
  // }
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
    setupDatabase(connection, couchApiKeysSetup, options),
    setupDatabase(connection, couchDevicesSetup, options),
    setupDatabase(connection, couchEventsSetup, options),
    setupDatabase(connection, devicesSetup, options),
    setupDatabase(connection, thresholdsSetup, options),
    setupDatabase(connection, usersSetup, options)
  ])
}
