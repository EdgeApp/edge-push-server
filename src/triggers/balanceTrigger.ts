import { gte, lte } from 'biggystring'

import { streamAddressBalanceEvents } from '../db/couchPushEvents'
import { asAddressBalanceTrigger } from '../types/pushCleaners'
import { PushTrigger } from '../types/pushTypes'
import { providerMap, triggerChecker } from '.'

const addressBalanceChecker = async (
  trigger: PushTrigger
): Promise<boolean> => {
  const { pluginId, tokenId, address, aboveAmount, belowAmount } =
    asAddressBalanceTrigger(trigger)

  const provider = providerMap[pluginId]
  if (provider == null) {
    console.log(`No provider for ${pluginId}`)
    return false
  }

  const balance = await provider.getBalance(address, tokenId)

  return (
    (aboveAmount != null && gte(balance, aboveAmount)) ||
    (belowAmount != null && lte(balance, belowAmount))
  )
}

export const addressBalanceTrigger = async (): Promise<void> =>
  await triggerChecker(
    streamAddressBalanceEvents,
    'address-balance',
    addressBalanceChecker
  )
