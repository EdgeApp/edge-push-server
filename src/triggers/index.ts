import nano, { ServerScope } from 'nano'

import { PushEventRow } from '../db/couchPushEvents'
import { serverConfig } from '../serverConfig'
import { PushTrigger } from '../types/pushTypes'
import { useBlockbook } from './blockbookUtils'
import { useEvm } from './evmUtils'

const { couchUri } = serverConfig

const connection = nano(couchUri)

export interface ProviderMethods {
  getBalance: (address: string, tokenId?: string) => Promise<string>
  getTxConfirmations: (txid: string) => Promise<number>
}

export const providerMap: { [pluginId: string]: ProviderMethods } = {
  bitcoin: useBlockbook('BTC'),
  polygon: useEvm('https://polygon-rpc.com/')
}

export const triggerChecker = async (
  stream: (connection: ServerScope) => AsyncIterableIterator<PushEventRow>,
  type: string,
  checkTrigger: (trigger: PushTrigger) => Promise<boolean>
): Promise<void> => {
  for await (const { event, save } of stream(connection)) {
    if (event.trigger.type !== type) return

    try {
      const triggered = await checkTrigger(event.trigger)
      if (triggered) {
        event.state = 'triggered'
        event.triggered = new Date()
        await save()
      }
    } catch (e) {
      console.log(e) // TODO: throw? console?
    }
  }
}
