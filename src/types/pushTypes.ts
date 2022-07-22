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

export interface User {
  loginId: string
  devices: string[]
  notifications: FutureNotifType[]
}

export interface NewDevice {
  deviceId: string // from Firebase
  loginIds: string[]

  subscriptions: Subscription[]
}

export interface NewUser {
  loginId: string // Username, hashed
  deviceIds: string[]

  subscriptions: Subscription[]
}

type Subscription =
  | {
      type: 'price-change'
    }
  | {
      type: 'price-level'
    }

// These are one-shots,
// and will go away once expired
export interface Events {
  deviceId?: string
  loginId?: string
  created: Date // Older than 6 months = expired, ignore it
  // Older than 2 months, refresh it in the latest db.
  action:
    | {
        type: 'price-change'
        tokenId: string
        pluginId: string // "bitcoin" / "ethereum"
        percentage: number
        perHours: 24 | 1
      }
    | {
        type: 'price'
        above: number
        tokenId: string
        pluginId: string // "bitcoin" / "ethereum"
      }
    | {
        type: 'tx-confirm'
        tokenId: string
        pluginId: string // "bitcoin" / "ethereum"
        percentage: number
        perHours: 24 | 1
      }
    | {
        type: 'address-balance'
        tokenId: string
        pluginId: string // "bitcoin" / "ethereum"
        percentage: number
        perHours: 24 | 1
      }
}
