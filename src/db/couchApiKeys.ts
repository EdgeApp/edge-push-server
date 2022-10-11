import { asBoolean, asObject, asOptional, asString } from 'cleaners'
import {
  asCouchDoc,
  asMaybeNotFoundError,
  CouchDoc,
  DatabaseSetup
} from 'edge-server-tools'
import { ServerScope } from 'nano'

import { ApiKey, FirebaseAdminKey } from '../types/pushTypes'

export const asFirebaseAdminKey = asObject<FirebaseAdminKey>({
  type: asOptional(asString),
  project_id: asOptional(asString),

  auth_provider_x509_cert_url: asOptional(asString),
  auth_uri: asOptional(asString),
  client_email: asOptional(asString),
  client_id: asOptional(asString),
  client_x509_cert_url: asOptional(asString),
  private_key_id: asOptional(asString),
  private_key: asOptional(asString),
  token_uri: asOptional(asString)
}).withRest

interface CouchApiKey extends Omit<ApiKey, 'apiKey'> {}

/**
 * An API key, as stored in Couch.
 */
export const asCouchApiKey = asCouchDoc(
  asObject<CouchApiKey>({
    appId: asString,
    admin: asBoolean,
    adminsdk: asOptional(asFirebaseAdminKey)
  })
)

/**
 * The document key is the api key.
 */
export const couchApiKeysSetup: DatabaseSetup = {
  name: 'db_api_keys'
}

export async function getApiKeyByKey(
  connection: ServerScope,
  apiKey: string
): Promise<ApiKey | undefined> {
  const db = connection.db.use(couchApiKeysSetup.name)
  if (apiKey === '') return

  const raw = await db.get(apiKey).catch(error => {
    if (asMaybeNotFoundError(error) != null) return
    throw error
  })

  if (raw == null) return
  return unpackApiKey(asCouchApiKey(raw))
}

function unpackApiKey(doc: CouchDoc<CouchApiKey>): ApiKey {
  return { ...doc.doc, apiKey: doc.id }
}
