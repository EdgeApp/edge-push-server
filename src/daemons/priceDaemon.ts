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
      const price = await getPrice(currencyPair)

      if (dailyChange != null) {
        if (eventRow.event.triggered < yesterday) continue
        const yesterdayPrice = await getPrice(yesterday)
        const yesterdayChange = (100 * (price = lastPrice)) / price

        if (Math.abs(change) > dailyChange) {
          // Trigger daily
          await tools.triggerEvent(eventRow, {
            '%balance%': price,
            '%direction%': change > 0 ? 'up' : 'down'
          })
        }
      }

      if (hourlyChange != null) {
        // hourly Stuff
        if (eventRow.event.triggered < hourAgo) continue
        const hourAgoPrice = await getPrice(yesterday)
        const yesterdayChange = (100 * (price = lastPrice)) / price
        if (Math.abs(change) > hourlyChange) {
          // Trigger daily
          await tools.triggerEvent(eventRow, {
            '%balance%': price,
            '%direction%': change > 0 ? 'up' : 'down'
          })
        }
      }
    } else if (trigger.type === 'price-level') {
      const { currencyPair, aboveRate, belowRate } = trigger

      const price = await getPrice(currencyPair)
      const lastPrice = await getPrice(yesterday)

      if (
        (aboveRate != null && price > aboveRate) ||
        (belowRate != null && price < belowRate)
      ) {
        console.log('Triggering')
        await tools.triggerEvent(eventRow, {
          '%balance%': price,
          '%direction%': price > lastPrice ? 'up' : 'down'
        })
      }
    }

    heartbeat()
  }
})
