import {
  asArray,
  asCodec,
  asEither,
  asNumber,
  asObject,
  asOptional,
  asString,
  asValue,
  Cleaner
} from 'cleaners'
import { base64 } from 'rfc4648'

import {
  AddressBalanceTrigger,
  BroadcastTx,
  PriceChangeTrigger,
  PriceLevelTrigger,
  PushEventState,
  PushMessage,
  PushTrigger,
  TxConfirmTrigger
} from './pushTypes'

export const asBase64 = asCodec(
  raw => base64.parse(asString(raw)),
  clean => base64.stringify(clean)
)

export const asAddressBalanceTrigger: Cleaner<AddressBalanceTrigger> = asObject(
  {
    type: asValue('address-balance'),
    pluginId: asString,
    tokenId: asOptional(asString),
    address: asString,
    aboveAmount: asOptional(asString), // Satoshis or Wei or such
    belowAmount: asOptional(asString) // Satoshis or Wei or such
  }
)

export const asPriceChangeTrigger: Cleaner<PriceChangeTrigger> = asObject({
  type: asValue('price-change'),
  pluginId: asString,
  currencyPair: asString, // From our rates server
  directions: asOptional(asArray(asString)), // [hourUp, hourDown, dayUp, dayDown]
  dailyChange: asOptional(asNumber), // Percentage
  hourlyChange: asOptional(asNumber) // Percentage
})

export const asPriceLevelTrigger: Cleaner<PriceLevelTrigger> = asObject({
  type: asValue('price-level'),
  currencyPair: asString, // From our rates server
  aboveRate: asOptional(asNumber),
  belowRate: asOptional(asNumber)
})

export const asTxConfirmTrigger: Cleaner<TxConfirmTrigger> = asObject({
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

export const asBroadcastTx: Cleaner<BroadcastTx> = asObject({
  pluginId: asString,
  rawTx: asBase64
})

export const asPushMessage: Cleaner<PushMessage> = asObject({
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
