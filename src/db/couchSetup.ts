import {
  DatabaseSetup,
  setupDatabase,
  SetupDatabaseOptions
} from 'edge-server-tools'

import { serverConfig } from '../serverConfig'
import { couchApiKeysSetup } from './couchApiKeys'
import { couchDevicesSetup } from './couchDevices'
import { couchEventsSetup } from './couchPushEvents'
import { settingsSetup, syncedReplicators } from './couchSettings'
import { DbConnections } from './dbConnections'

// ---------------------------------------------------------------------------
// Databases
// ---------------------------------------------------------------------------

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
  connections: DbConnections,
  disableWatching: boolean = false
): Promise<void> {
  const { currentCluster } = serverConfig
  const options: SetupDatabaseOptions = {
    currentCluster,
    replicatorSetup: syncedReplicators,
    disableWatching
  }

  await setupDatabase(connections.couch, settingsSetup, options)
  await Promise.all([
    setupDatabase(connections.couch, couchApiKeysSetup, options),
    setupDatabase(connections.couch, couchDevicesSetup, options),
    setupDatabase(connections.couch, couchEventsSetup, options),
    setupDatabase(connections.couch, devicesSetup, options),
    setupDatabase(connections.couch, usersSetup, options)
  ])
}
