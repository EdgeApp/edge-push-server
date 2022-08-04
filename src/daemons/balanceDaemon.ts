import { gte, lte } from 'biggystring'

import { streamAddressBalanceEvents } from '../db/couchPushEvents'
import { runDaemon } from './runDaemon'

runDaemon(async tools => {
  const { connection, heartbeat, plugins } = tools

  for await (const eventRow of streamAddressBalanceEvents(connection)) {
    const { trigger } = eventRow.event
    if (trigger.type !== 'address-balance') continue
    const now = new Date()

    const { aboveAmount, belowAmount, address, pluginId, tokenId } = trigger
    const plugin = plugins[pluginId]
    if (plugin == null) continue

    const balance = await plugin.getBalance(address, tokenId)
    if (
      (aboveAmount != null && gte(balance, aboveAmount)) ||
      (belowAmount != null && lte(balance, belowAmount))
    ) {
      await tools.triggerEvent(eventRow, now, {
        '%balance%': balance
      })
    }

    heartbeat()
  }
})
