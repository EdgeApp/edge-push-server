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

/**
 * Mutable state on a device object.
 */
export interface DeviceState {
  enableLegacyPrices: boolean // For legacy v1 API.
  rootLoginIds: Uint8Array[] // asArray(asBase64)
  visited: Date
}

/**
 * An app installed on a single phone.
 */
export interface Device extends DeviceState {
  readonly appId: string
  readonly created: Date
  readonly deviceId: string
  readonly deviceToken: string
}

//
// Events that devices or logins may subscribe to.
//

export interface AddressBalanceTrigger {
  readonly type: 'address-balance'
  readonly pluginId: string
  readonly tokenId?: string
  readonly address: string
  readonly aboveAmount?: string // Satoshis or Wei or such
  readonly belowAmount?: string // Satoshis or Wei or such
}

export interface PriceChangeTrigger {
  readonly type: 'price-change'
  readonly pluginId: string
  readonly tokenId?: string
  readonly dailyChange?: number // Percentage
  readonly hourlyChange?: number // Percentage
}

export interface PriceLevelTrigger {
  readonly type: 'price-level'
  readonly currencyPair: string // From our rates server
  readonly aboveRate?: number
  readonly belowRate?: number
}

export interface TxConfirmTrigger {
  readonly type: 'tx-confirm'
  readonly pluginId: string
  readonly confirmations: number
  readonly txid: string
}

export type PushTrigger =
  | AddressBalanceTrigger
  | PriceChangeTrigger
  | PriceLevelTrigger
  | TxConfirmTrigger

/**
 * Mutable flags that we can toggle on a push event.
 */
export interface PushEventState {
  active: boolean // Watch the trigger when true
  triggered?: Date
  broadcasted?: Date
  pushed?: Date
}

/**
 * An action to perform once a trigger takes place.
 */
export interface PushEvent extends PushEventState {
  readonly eventId?: string
  readonly deviceId?: string
  readonly loginId?: Uint8Array

  readonly broadcast?: Array<{
    pluginId: string
    rawTx: Uint8Array // asBase64
  }>
  readonly push?: {
    title?: string
    body?: string
    data: { [key: string]: string } // JSON to push to device
  }
  readonly trigger: PushTrigger
}
