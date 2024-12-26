import {
  asBoolean,
  asEither,
  asMaybe,
  asNull,
  asNumber,
  asObject,
  asString
} from 'cleaners'
import {
  asReplicatorSetupDocument,
  DatabaseSetup,
  syncedDocument
} from 'edge-server-tools'

/**
 * Live-updating server options stored in the `push-settings` database.
 */
const asSettings = asObject({
  // Mode toggles:
  debugLogs: asMaybe(asBoolean, false),
  daemonMaxHours: asMaybe(asNumber, 1)
})

/**
 * Keys to outside services we rely on.
 */
const asServices = asObject({
  infuraProjectId: asMaybe(asString, ''),
  ipApiKey: asMaybe(asString, ''),
  ratesServer: asMaybe(asString, 'https://rates2.edge.app'),
  slackUri: asMaybe(asEither(asString, asNull), null)
})

export const syncedReplicators = syncedDocument(
  'replicators',
  asReplicatorSetupDocument
)

export const syncedSettings = syncedDocument('settings', asSettings.withRest)
export const syncedServices = syncedDocument('services', asServices.withRest)

export const settingsSetup: DatabaseSetup = {
  name: 'push-settings',
  syncedDocuments: [syncedReplicators, syncedServices, syncedSettings]
}
