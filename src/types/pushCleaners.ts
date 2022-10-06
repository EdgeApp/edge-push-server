import {
  asArray,
  asCodec,
  asDate,
  asEither,
  asNumber,
  asObject,
  asOptional,
  asString,
  asValue,
  Cleaner
} from 'cleaners'
import { base64 } from 'rfc4648'

import { base58 } from '../util/base58'
import {
  AddressBalanceTrigger,
  BroadcastTx,
  PriceChangeTrigger,
  PriceLevelTrigger,
  PushEventState,
  PushMessage,
  PushTrigger,
  PushTriggerState,
  TxConfirmTrigger
} from './pushTypes'

export const asBase58 = asCodec(
  raw => base58.parse(asString(raw)),
  clean => base58.stringify(clean)
)

export const asBase64 = asCodec(
  raw => base64.parse(asString(raw)),
  clean => base64.stringify(clean)
)

export const asAddressBalanceTrigger = asObject<AddressBalanceTrigger>({
  type: asValue('address-balance'),
  pluginId: asString,
  tokenId: asOptional(asString),
  address: asString,
  aboveAmount: asOptional(asString), // Satoshis or Wei or such
  belowAmount: asOptional(asString) // Satoshis or Wei or such
})

export const asPriceChangeTrigger = asObject<PriceChangeTrigger>({
  type: asValue('price-change'),
  pluginId: asOptional(asString),
  currencyPair: asString, // From our rates server
  directions: asOptional(asArray(asString)), // [hourUp, hourDown, dayUp, dayDown]
  dailyChange: asOptional(asNumber), // Percentage
  hourlyChange: asOptional(asNumber) // Percentage
})

export const asPriceLevelTrigger = asObject<PriceLevelTrigger>({
  type: asValue('price-level'),
  currencyPair: asString, // From our rates server
  aboveRate: asOptional(asNumber),
  belowRate: asOptional(asNumber)
})

export const asTxConfirmTrigger = asObject<TxConfirmTrigger>({
  type: asValue('tx-confirm'),
  pluginId: asString,
  confirmations: asNumber,
  txid: asString
})

export const asPushTrigger: Cleaner<PushTrigger> = asEither(
  asAddressBalanceTrigger,
  asPriceChangeTrigger,
  asPriceLevelTrigger,
  asTxConfirmTrigger
)

export const asPushTriggerState: Cleaner<PushTriggerState> = asOptional(asDate)

export const asBroadcastTx = asObject<BroadcastTx>({
  pluginId: asString,
  rawTx: asBase64
})

export const asPushMessage = asObject<PushMessage>({
  title: asOptional(asString),
  body: asOptional(asString),
  data: asOptional(asObject(asString))
})

export const asPushEventState: Cleaner<PushEventState> = asValue(
  'waiting',
  'cancelled',
  'triggered',
  'hidden'
)
