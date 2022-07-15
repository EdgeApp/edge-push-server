import {
  asArray,
  asBoolean,
  asEither,
  asNumber,
  asObject,
  asOptional,
  asString,
  asValue,
  Cleaner
} from 'cleaners'

// -------------------------------------------------------------------
// Type definitions
// -------------------------------------------------------------------

export interface GeneralActionEffect {
  completed: boolean
}
export interface SeqActionEffect extends GeneralActionEffect {
  type: 'seq'
  opIndex: number
  childEffect: ActionEffect
}

export interface ParActionEffect extends GeneralActionEffect {
  type: 'par'
  childEffects: ActionEffect[]
}

export interface BalanceActionEffect extends GeneralActionEffect {
  type: 'balance'
  address: string
  aboveAmount?: string
  belowAmount?: string
  walletId: string
  tokenId?: string
}

export interface TxConfsActionEffect extends GeneralActionEffect {
  type: 'tx-confs'
  txId: string
  walletId: string
  confirmations: number
}

export interface PriceActionEffect extends GeneralActionEffect {
  type: 'price'
  currencyPair: string
  aboveRate?: string
  belowRate?: string
}
// TODO: @samholmes to add comments
export type ActionEffect =
  | SeqActionEffect
  | ParActionEffect
  | BalanceActionEffect
  | TxConfsActionEffect
  | PriceActionEffect

// -------------------------------------------------------------------
// Cleaners definitions
// -------------------------------------------------------------------

export const asSeqActionEffect: Cleaner<SeqActionEffect> = asObject({
  type: asValue('seq'),
  opIndex: asNumber,
  completed: asBoolean,
  childEffect: raw => asActionEffect(raw)
})

export const asParActionEffect: Cleaner<ParActionEffect> = asObject({
  type: asValue('par'),
  completed: asBoolean,
  childEffects: asArray(raw => asActionEffect(raw))
})

export const asBalanceActionEffect: Cleaner<BalanceActionEffect> = asObject({
  type: asValue('balance'),
  address: asString,
  completed: asBoolean,
  aboveAmount: asOptional(asString),
  belowAmount: asOptional(asString),
  walletId: asString,
  tokenId: asOptional(asString)
})

export const asTxConfsActionEffect: Cleaner<TxConfsActionEffect> = asObject({
  type: asValue('tx-confs'),
  txId: asString,
  completed: asBoolean,
  walletId: asString,
  confirmations: asNumber
})

export const asPriceActionEffect: Cleaner<PriceActionEffect> = asObject({
  type: asValue('price'),
  currencyPair: asString,
  completed: asBoolean,
  aboveRate: asOptional(asString),
  belowRate: asOptional(asString)
})

export const asActionEffect: Cleaner<ActionEffect> = asEither(
  asSeqActionEffect,
  asParActionEffect,
  asBalanceActionEffect,
  asTxConfsActionEffect,
  asPriceActionEffect
)
