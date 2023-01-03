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
 * An app installed on a single phone.
 *
 * This the in-memory format, independent of the database.
 */
export interface Device {
  readonly created: Date
  readonly deviceId: string

  // Settings:
  apiKey: string | undefined // Which app to send to?
  deviceToken: string | undefined
  ignoreMarketing: boolean
  ignorePriceChanges: boolean
  ip?: string
  location?: {
    country: string
    city: string
    region: string
  }
  loginIds: Uint8Array[]
  visited: Date
}

//
// Triggers that may cause an event to fire.
//

export interface AddressBalanceTrigger {
  readonly type: 'address-balance'
  readonly pluginId: string
  readonly tokenId?: string
  readonly address: string
  readonly aboveAmount?: string // Satoshis or Wei or such
  readonly belowAmount?: string // Satoshis or Wei or such
}

export interface AllTrigger {
  readonly type: 'all'
  readonly triggers: PushTrigger[]
}

export interface AnyTrigger {
  readonly type: 'any'
  readonly triggers: PushTrigger[]
}

/**
 * The price change trigger is recurring, which makes it special.
 * It will not broadcast transactions,
 * and it will leave the the event status as "waiting".
 */
export interface PriceChangeTrigger {
  readonly type: 'price-change'
  readonly pluginId?: string // Used by the client
  readonly currencyPair: string // From our rates server
  readonly directions?: string[] // [hourUp, hourDown, dayUp, dayDown]
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
  | AllTrigger
  | AnyTrigger
  | PriceChangeTrigger
  | PriceLevelTrigger
  | TxConfirmTrigger

/**
 * Records when a trigger took place.
 */
export type PushTriggerState =
  | undefined
  // For "any" and "all" triggers:
  | PushTriggerState[]
  // For normal triggers:
  | Date

//
// Events that happen when a trigger fires.
//

/**
 * Broadcasts a transaction to a blockchain.
 */
export interface BroadcastTx {
  readonly pluginId: string
  readonly rawTx: Uint8Array // asBase64
}

/**
 * Sends a push notification.
 */
export interface PushMessage {
  readonly title?: string
  readonly body?: string
  readonly data?: { [key: string]: string } // JSON to push to device
}

export type PushEventState =
  | 'waiting' // Waiting for the trigger
  | 'cancelled' // Removed before the trigger happened
  | 'triggered' // The trigger and effects are done
  | 'hidden' // Removed after being triggered

/**
 * Combines a trigger with an action.
 * This the in-memory format, independent of the database.
 */
export interface PushEvent {
  readonly created: Date
  readonly eventId: string // From the client, not globally unique
  readonly deviceId?: string
  readonly loginId?: Uint8Array

  readonly broadcastTxs?: BroadcastTx[]
  readonly pushMessage?: PushMessage
  readonly trigger: PushTrigger

  // Mutable state:
  broadcastTxErrors?: Array<string | null> // For ones that fail
  pushMessageEmits?: number // Number of devices we sent to
  pushMessageFails?: number // Number of devices that failed
  state: PushEventState
  triggered: PushTriggerState // When did we see the trigger?
}
