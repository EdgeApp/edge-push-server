// -------------------------------------------------------------------
// Type definitions
// -------------------------------------------------------------------

import {
  asArray,
  asEither,
  asObject,
  asOptional,
  asString,
  Cleaner
} from 'cleaners'

import { ApiKey } from '../../models'

export interface GeneralActionData {
  additionalData?: Object
}

export interface PushActionData extends GeneralActionData {
  apiKey: ApiKey | string
  title: string
  body: string
  tokenIds: string[]
}

export interface BroadcastTxActionData extends GeneralActionData {
  SOMETHING: string
}

export interface ClientActionData extends GeneralActionData {
  SOMETHING: string
}

export type ActionData =
  | PushActionData
  | BroadcastTxActionData
  | ClientActionData

// -------------------------------------------------------------------
// Cleaners definitions
// -------------------------------------------------------------------

export const asGeneralActionData: Cleaner<GeneralActionData> = asObject({
  additionalData: asOptional(asObject)
})

export const asPushActionData: Cleaner<PushActionData> = asObject({
  apiKey: asString,
  title: asString,
  body: asString,
  tokenIds: asArray(asString)
})

export const asBroadcastTxActionData: Cleaner<BroadcastTxActionData> = asObject(
  {
    SOMETHING: asString
  }
)

export const asClientActionData: Cleaner<ClientActionData> = asObject({
  SOMETHING: asString
})

export const asActionData: Cleaner<ActionData> = asEither(
  asPushActionData,
  asBroadcastTxActionData,
  asClientActionData
)
