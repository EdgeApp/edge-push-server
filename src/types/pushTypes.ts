/**
 * Firebase admin credentials.
 *
 * We should probably match the `ServiceAccount` type from the Firebase SDK,
 * but this is the existing situation in the database.
 */
export interface FirebaseAdminKey {
  type?: string
  project_id?: string

  auth_provider_x509_cert_url?: string
  auth_uri?: string
  client_email?: string
  client_id?: string
  client_x509_cert_url?: string
  private_key_id?: string
  private_key?: string
  token_uri?: string
}

/**
 * An API key, along with some extra info.
 */
export interface ApiKey {
  apiKey: string
  appId: string

  admin: boolean
  adminsdk?: FirebaseAdminKey
}
