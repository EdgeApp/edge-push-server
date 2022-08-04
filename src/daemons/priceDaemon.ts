import { streamPriceEvents } from '../db/couchPushEvents'
import { runDaemon } from './runDaemon'

runDaemon(async tools => {
  const { connection, heartbeat } = tools

  async function getPrice(currencyPair: string): Promise<number> {
    // TOOD
    return 0
  }

  for await (const eventRow of streamPriceEvents(connection)) {
    const { trigger } = eventRow.event

    if (trigger.type === 'price-change') {
      const { pluginId, tokenId, dailyChange, hourlyChange } = trigger
      console.log(pluginId, tokenId, dailyChange, hourlyChange)
    } else if (trigger.type === 'price-level') {
      const { currencyPair, aboveRate, belowRate } = trigger

      const price = await getPrice(currencyPair)

      if (
        (aboveRate != null && price > aboveRate) ||
        (belowRate != null && price < belowRate)
      ) {
        console.log('Triggering')
        await tools.triggerEvent(eventRow)
      }
    }

    heartbeat()
  }
})
