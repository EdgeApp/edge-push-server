import { streamEvents } from '../db/couchPushEvents'
import { logger } from '../util/logger'
import { pages } from '../util/pages'
import { checkPriceChange, priceChangeLookups } from '../util/priceChange'
import { runDaemon } from './runDaemon'

/**
 * Events per rates prefetch. The first pages fill the cache with the
 * common pairs, so later pages mostly find their rates already there.
 */
const PAGE_SIZE = 500

runDaemon(async tools => {
  const { connections, heartbeat, rates } = tools

  try {
    const stream = streamEvents(connections, 'price-change')
    for await (const page of pages(stream, PAGE_SIZE)) {
      // Fetch every rate this page needs in a few batched requests,
      // so the lookups below come from the cache:
      const now = new Date()
      await rates.prefetch(
        page.flatMap(row => priceChangeLookups(row.event, now))
      )

      for (const eventRow of page) {
        const { trigger } = eventRow.event
        if (trigger.type !== 'price-change') continue

        try {
          const { currencyPair } = trigger

          // Grab the price:
          const price = await rates.getRate(currencyPair, now)
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
    }
  } finally {
    logger.info({ msg: 'Rates lookups', ...rates.getStats() })
  }
})
