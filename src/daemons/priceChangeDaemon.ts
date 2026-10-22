import { streamEvents } from '../db/couchPushEvents'
import { logger } from '../util/logger'
import { checkPriceChange } from '../util/priceChange'
import { runDaemon } from './runDaemon'

runDaemon(async tools => {
  const { connections, heartbeat } = tools

  for await (const eventRow of streamEvents(connections, 'price-change')) {
    const { trigger } = eventRow.event
    if (trigger.type !== 'price-change') continue
    const now = new Date()

    try {
      const { currencyPair } = trigger

      // Grab the price:
      const price = await tools.rates.getRate(currencyPair, now)
      if (price == null) continue

      // Check the triggers:
      await checkPriceChange(tools, eventRow, now, price, 'day')
      await checkPriceChange(tools, eventRow, now, price, 'hour')
    } catch (err) {
      const id = eventRow.event.created.toISOString()
      logger.warn({ msg: 'Failed event', id, err })
    }

    heartbeat(`row '${eventRow.id}'`)
  }
})
