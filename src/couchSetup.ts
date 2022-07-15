import { asArray, asMaybe, asNumber, asObject, asString } from 'cleaners'
import {
  asReplicatorSetupDocument,
  DatabaseSetup,
  setupDatabase,
  SetupDatabaseOptions,
  syncedDocument
} from 'edge-server-tools'
import { ServerScope } from 'nano'

import { tasksListening, tasksPublishing } from './database/views/couch-tasks'
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

const tasksSetup: DatabaseSetup = {
  name: 'db_tasks',
  // Turn on partition by userId for performance and security reasons.
  // https://docs.couchdb.org/en/3.2.2/partitioned-dbs/index.html
  options: {
    partitioned: true
  },
  // Set up the views
  documents: {
    '_design/tasks_listening': tasksListening,
    '_design/tasks_publishing': tasksPublishing
  }
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
  // @ts-expect-error
  await setupDatabase(connection, settingsSetup, options)
  await Promise.all([
    // @ts-expect-error
    setupDatabase(connection, apiKeysSetup, options),
    // @ts-expect-error
    setupDatabase(connection, tasksSetup, options)
  ])
}
