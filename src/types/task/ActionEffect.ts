import {
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
export type ActionEffect =
  | {
      type: 'balance'
      completed: boolean
      params: {
        address: string
        aboveAmount?: string
        belowAmount?: string
        contractAddress?: string
        network: string
      }
    }
  | {
      type: 'tx-confs'
      completed: boolean
      params: {
        confirmations: number
        txId: string
        network: string
      }
    }
  | {
      type: 'price'
      completed: boolean
      params: {
        aboveRate?: string
        belowRate?: string
        currencyPair: string
        network: string
      }
    }

// -------------------------------------------------------------------
// Cleaners definitions
// -------------------------------------------------------------------

export const asActionEffect: Cleaner<ActionEffect> = asEither(
  asObject({
    type: asValue('balance'),
    completed: asBoolean,
    params: asObject({
      address: asString,
      aboveAmount: asOptional(asString),
      belowAmount: asOptional(asString),
      contractAddress: asOptional(asString),
      network: asString
    })
  }),
  asObject({
    type: asValue('tx-confs'),
    completed: asBoolean,
    params: asObject({
      confirmations: asNumber,
      txId: asString,
      network: asString
    })
  }),
  asObject({
    type: asValue('price'),
    completed: asBoolean,
    params: asObject({
      aboveRate: asOptional(asString),
      belowRate: asOptional(asString),
      currencyPair: asString,
      network: asString
    })
  })
)
