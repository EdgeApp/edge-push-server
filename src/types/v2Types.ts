export interface Device {
  appId: string
  deviceId: string
  deviceToken: string
  rootLoginIds: Uint8Array[] // asArray(asBase64)
  created: Date
  visited: Date
}

interface PriceChangeTrigger {
  type: 'price-change'
  pluginId: string
  tokenId?: string
  aboveRatio?: number //  1.1 for +10%
  belowRatio?: number // 0.9 for -10%
  range: 'hourly' | 'daily'
}

interface PriceLevelTrigger {
  type: 'price-level'
  currencyPair: string // From our rates server
  aboveRate?: number
  belowRate?: number
}

interface AddressBalanceTrigger {
  type: 'address-balance'
  pluginId: string
  tokenId?: string
  address: string
  aboveAmount?: string // Satoshis or Wei or such
  belowAmount?: string // Satoshis or Wei or such
}

interface TxConfirmTrigger {
  type: 'tx-confirm'
  pluginId: string
  confirmations: number
  txid: string
}

export type PushTrigger =
  | AddressBalanceTrigger
  | PriceChangeTrigger
  | PriceLevelTrigger
  | TxConfirmTrigger

interface PushEvent {
  trigger: PushTrigger
  triggered: boolean

  // TODO: Check firebase docs
  pushMessage?: string
  pushPayload?: unknown // JSON to push to device
  broadcastTxs?: Array<{
    pluginId: string
    rawTx: Uint8Array // asBase64
  }>
}

export interface PushRequestBody {
  // The request payload:
  data: unknown

  // Who is making the request:
  apiKey: string
  appId: string
  deviceId: string

  // For logins:
  rootLoginId?: Uint8Array
  // rootSecretHash?: Uint8Array
}

/**
 * Refreshes the `visited` date on a device and its effects or logins.
 * Devices expire after 3 months.
 * POST /v2/device/checkin
 */

/**
 * Registers / updates a device.
 * POST /v2/device/update
 */
export interface UpdateDevicePayload {
  rootLoginIds: Uint8Array[] // asArray(asBase64)
  events: PushEvent[]
  deviceToken: string
}

/**
 * Gets a device from the database.
 * POST /v2/device
 */
export interface DevicePayload {
  deviceId: string
  deviceToken: string
  events: PushEvent[]
  rootLoginIds: Uint8Array[] // asArray(asBase64)
  created: Date
  visited: Date
}

/**
 * Registers / updates a login.
 * POST /v2/login/update
 */
export interface UpdateLoginPayload {
  events: PushEvent[]

  // removeEvents?: string[]
  // replaceEvents?: PushEvent[]
  // newEvents?: PushEvent[]
}

/**
 * Reads a login from the database.
 * POST /v2/login
 */
export interface LoginPayload {
  deviceIds: string
  events: PushEvent[]
  created: Date
  visited: Date
}
