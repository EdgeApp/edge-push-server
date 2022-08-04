import { streamTxConfirmEvents } from '../db/couchPushEvents'
import { asTxConfirmTrigger } from '../types/pushCleaners'
import { PushTrigger } from '../types/pushTypes'
import { providerMap, triggerChecker } from '.'

const txConfirmationChecker = async (
  trigger: PushTrigger
): Promise<boolean> => {
  const {
    pluginId,
    confirmations: confirmationThreshold,
    txid
  } = asTxConfirmTrigger(trigger)

  const provider = providerMap[pluginId]
  if (provider == null) {
    console.log(`No provider for ${pluginId}`)
    return false
  }

  const confirmations = await provider.getTxConfirmations(txid)

  return confirmations >= confirmationThreshold
}

export const txConfirmationTrigger = async (): Promise<void> =>
  await triggerChecker(
    streamTxConfirmEvents,
    'tx-confirm',
    txConfirmationChecker
  )
