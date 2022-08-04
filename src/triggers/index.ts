import nano, { ServerScope } from 'nano'

import { serverConfig } from '../serverConfig'
import { PushEventRow } from '../types/dbTypes'
import { PushTrigger } from '../types/pushTypes'

const { couchUri } = serverConfig

const connection = nano(couchUri)

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
