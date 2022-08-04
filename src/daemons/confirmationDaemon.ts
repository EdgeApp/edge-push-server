import { streamTxConfirmEvents } from '../db/couchPushEvents'
import { runDaemon } from './runDaemon'

runDaemon(async tools => {
  const { connection, heartbeat, plugins } = tools

  for await (const eventRow of streamTxConfirmEvents(connection)) {
    const { trigger } = eventRow.event
    if (trigger.type !== 'tx-confirm') continue

    const { pluginId, txid } = trigger
    const plugin = plugins[pluginId]
    if (plugin == null) continue

    const confirmations = await plugin.getTxConfirmations(txid)
    if (confirmations >= trigger.confirmations) {
      console.log('Triggering')
      await tools.triggerEvent(eventRow)
    }

    heartbeat()
  }
})
