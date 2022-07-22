import { asArray, asBoolean, asMaybe, asNumber, asObject, asString } from 'cleaners'
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
  priceCheckInMinutes: asMaybe(asNumber, 5)
})

const asDefaultThresholds = asObject({
  anomaly: asBoolean
})

export const syncedReplicators = syncedDocument(
  'replicators',
  asReplicatorSetupDocument
)

export const syncedSettings = syncedDocument('settings', asSettings.withRest)
export const syncedDefaultThresholds = syncedDocument(
  'defaultThresholds',
  asDefaultThresholds.withRest
)

export const settingsSetup: DatabaseSetup = {
  name: 'push-settings',
  syncedDocuments: [syncedReplicators, syncedSettings, syncedDefaultThresholds]
}
