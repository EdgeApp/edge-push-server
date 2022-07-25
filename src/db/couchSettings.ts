import { asArray, asMaybe, asNumber, asObject, asString } from 'cleaners'
import {
  asReplicatorSetupDocument,
  DatabaseSetup,
  syncedDocument
} from 'edge-server-tools'

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

  // Default thresholds:
  defaultAnomaly: asMaybe(asNumber, 90),
  defaultHours: asMaybe(asObject(asNumber), { '1': 3, '24': 10 }),

  priceCheckInMinutes: asMaybe(asNumber, 5)
})

export const syncedReplicators = syncedDocument(
  'replicators',
  asReplicatorSetupDocument
)

export const syncedSettings = syncedDocument('settings', asSettings.withRest)

export const settingsSetup: DatabaseSetup = {
  name: 'push-settings',
  syncedDocuments: [syncedReplicators, syncedSettings]
}
